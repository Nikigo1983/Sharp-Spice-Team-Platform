/**
 * Central unique-resolution → ClientRef lock transition.
 * Questionnaire UUID only. Called at the server resolve boundary before SSE.
 */
import "server-only";

import {
  createClientRef,
  isQuestionnaireUuid,
  type ClientRef,
} from "@/lib/ai/client-ref";
import {
  applyClientSwitch,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  getWorkspaceChatMemory,
  setWorkspaceChatMemory,
} from "@/lib/ai/workspace-chat-memory-store";
import type { WorkspaceCaseMemory } from "@/lib/ai/workspace-case-memory";

export type UniqueClientResolutionCommit = {
  memory: WorkspaceCaseMemory;
  clientRef: ClientRef;
  switched: boolean;
  /** True when this call newly applied a lock (including same-id reaffirm). */
  locked: boolean;
};

/**
 * UNIQUE canonical resolution → authoritative caseMemory.linkedClientId.
 * AMBIGUOUS / NOT_FOUND callers must not invoke this.
 */
export function commitUniqueClientResolution(params: {
  memory: WorkspaceCaseMemory | null | undefined;
  ref: ClientRef;
  /** Explicit user/system switch to another client (drops prior facts). */
  switchExplicit?: boolean;
}): UniqueClientResolutionCommit {
  const next: ClientRef = {
    ...params.ref,
    resolutionOutcome: "RESOLVED_LOCKED",
  };
  if (!isQuestionnaireUuid(next.clientId)) {
    throw new Error("commitUniqueClientResolution requires questionnaire UUID");
  }

  const previous = clientRefFromCaseMemory(params.memory);
  if (
    params.switchExplicit &&
    previous &&
    previous.clientId !== next.clientId
  ) {
    const switched = applyClientSwitch({
      memory: params.memory,
      previous,
      next,
    });
    return {
      memory: switched.memory,
      clientRef: switched.clientRef,
      switched: switched.switched,
      locked: true,
    };
  }

  const memory = lockClientRefIntoCaseMemory(params.memory, next);
  return {
    memory,
    clientRef: next,
    switched: false,
    locked: true,
  };
}

/**
 * UNIQUE resolved portal client → lock questionnaire UUID into caseMemory.
 * Call at every unique-resolution boundary and again immediately before
 * returning kind:"ai" so ClientRef cannot stay unset while evidence is attached.
 * AMBIGUOUS / NOT_FOUND / non-UUID contexts must not call this (ref is null).
 */
export function lockCaseMemoryFromUniqueResolvedClient(params: {
  memory: WorkspaceCaseMemory | null | undefined;
  ref: ClientRef | null | undefined;
  /** Prior lock from this conversation (for explicit switch detection). */
  previousRef?: ClientRef | null;
}): {
  memory: WorkspaceCaseMemory | null;
  clientRef: ClientRef | null;
  locked: boolean;
  switched: boolean;
} {
  const ref = params.ref ?? null;
  if (!ref || !isQuestionnaireUuid(ref.clientId)) {
    return {
      memory: params.memory ?? null,
      clientRef: null,
      locked: false,
      switched: false,
    };
  }
  const previous =
    params.previousRef ?? clientRefFromCaseMemory(params.memory);
  const committed = commitUniqueClientResolution({
    memory: params.memory,
    ref,
    switchExplicit: Boolean(
      previous && previous.clientId !== ref.clientId,
    ),
  });
  return {
    memory: committed.memory,
    clientRef: committed.clientRef,
    locked: committed.locked,
    switched: committed.switched,
  };
}


/**
 * Persist minimal identity only (linkedClientId + display label) into the
 * same store durable recovery reads (`getWorkspaceChatMemory`).
 */
export async function persistDurableClientRefIdentity(params: {
  userId: string | null | undefined;
  chatId: string | null | undefined;
  ref: ClientRef;
}): Promise<boolean> {
  const userId = params.userId?.trim();
  const chatId = params.chatId?.trim();
  if (!userId || !chatId) return false;
  if (!isQuestionnaireUuid(params.ref.clientId)) return false;

  const current = await getWorkspaceChatMemory(userId, chatId);
  const locked = lockClientRefIntoCaseMemory(current.caseMemory, {
    ...params.ref,
    resolutionOutcome: "RESOLVED_LOCKED",
  });
  // Identity-only durable write: keep prior non-identity facts if same client.
  await setWorkspaceChatMemory(userId, chatId, {
    ...current,
    caseMemory: locked,
  });
  return true;
}

type AgentToolResultLike = {
  name?: string;
  tool?: string;
  ok?: boolean;
  data?: unknown;
};

function toolNameOf(call: AgentToolResultLike): string {
  return (call.name ?? call.tool ?? "").trim();
}

function parseToolPayload(raw: unknown): AgentToolResultLike | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseToolPayload(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as AgentToolResultLike;
}

/**
 * Extract a unique questionnaire ClientRef from agent tool results.
 * - unique successful get_client → that UUID
 * - unique non-ambiguous search_clients match → that UUID
 * Never locks from AMBIGUOUS search results.
 */
export function clientRefFromAgentToolResults(
  toolCalls: AgentToolResultLike[],
): ClientRef | null {
  const getClientIds: string[] = [];
  let getClientLabel: string | null = null;
  let uniqueSearchRef: ClientRef | null = null;
  let searchAmbiguous = false;

  for (const call of toolCalls) {
    if (call.ok === false) continue;
    const data =
      call.data && typeof call.data === "object"
        ? (call.data as Record<string, unknown>)
        : null;
    if (!data) continue;
    const name = toolNameOf(call);

    if (name === "get_client") {
      const client = data.client;
      if (client && typeof client === "object") {
        const row = client as Record<string, unknown>;
        const id =
          typeof row.clientId === "string"
            ? row.clientId.trim()
            : typeof row.id === "string"
              ? row.id.trim()
              : "";
        if (isQuestionnaireUuid(id)) {
          getClientIds.push(id);
          const label =
            typeof row.displayName === "string"
              ? row.displayName.trim()
              : typeof row.name === "string"
                ? row.name.trim()
                : null;
          if (label) getClientLabel = label;
        }
      }
    }

    if (name === "search_clients") {
      if (data.ambiguous === true) {
        searchAmbiguous = true;
        continue;
      }
      const matches = Array.isArray(data.matches) ? data.matches : [];
      const uuids = matches
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const id = (m as { clientId?: string }).clientId?.trim() ?? "";
          return isQuestionnaireUuid(id) ? id : null;
        })
        .filter((id): id is string => Boolean(id));
      if (uuids.length === 1) {
        const only = uuids[0]!;
        const match = matches.find(
          (m) =>
            m &&
            typeof m === "object" &&
            (m as { clientId?: string }).clientId?.trim() === only,
        ) as { displayName?: string } | undefined;
        uniqueSearchRef = createClientRef({
          clientId: only,
          displayLabel: match?.displayName ?? null,
          resolutionOutcome: "RESOLVED",
        });
      }
    }
  }

  const uniqueGets = [...new Set(getClientIds)];
  if (uniqueGets.length === 1) {
    return createClientRef({
      clientId: uniqueGets[0]!,
      displayLabel: getClientLabel,
      resolutionOutcome: "RESOLVED",
    });
  }
  if (!searchAmbiguous && uniqueSearchRef) return uniqueSearchRef;
  return null;
}

/** Parse tool-role message contents from the agent loop transcript. */
export function clientRefFromAgentToolMessages(
  messages: Array<{ role: string; content?: string | null; name?: string }>,
): ClientRef | null {
  const parsed: AgentToolResultLike[] = [];
  for (const msg of messages) {
    if (msg.role !== "tool" || !msg.content) continue;
    const payload = parseToolPayload(msg.content);
    if (!payload) continue;
    // toolResultToMessageContent wraps { ok, tool, data, ... }
    parsed.push({
      name: payload.tool ?? payload.name ?? msg.name,
      ok: payload.ok !== false,
      data: payload.data ?? payload,
    });
  }
  return clientRefFromAgentToolResults(parsed);
}
