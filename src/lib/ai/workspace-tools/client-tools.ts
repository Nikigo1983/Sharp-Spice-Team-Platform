/**
 * Read-only client tools wrapping existing CRM search/loaders.
 */

import {
  EMPTY_CLIENT_SEARCH_INTENT,
  type ClientSearchIntent,
} from "@/lib/ai/client-search-intent";
import { executeStructuredClientSearch } from "@/lib/ai/structured-client-search";
import {
  isMergedClientContext,
  type ResolvedClientContext,
} from "@/lib/ai/client-context";
import {
  extractEmailFromQuery,
  extractPhoneFromQuery,
} from "@/lib/ai/client-search";
import { looksLikePassportNumber } from "@/lib/ai/format-client";
import { getClientDetail } from "@/lib/google-sheets/service";
import {
  getFormgridClientById,
  isFormgridClientId,
} from "@/lib/google-sheets/formgrid-lookup";
import type { Client } from "@/lib/google-sheets/types";
import {
  deepRedactToolPayload,
  isDeniedClientFieldKey,
  truncateChars,
} from "@/lib/ai/workspace-tools/security";
import {
  validateGetCaseContextArgs,
  validateGetClientArgs,
  validateSearchClientsArgs,
} from "@/lib/ai/workspace-tools/schemas";
import type {
  WorkspaceToolContext,
  WorkspaceToolResult,
} from "@/lib/ai/workspace-tools/types";

function display(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "—") return null;
  return trimmed;
}

/** Exact full-name class vs weaker morph hits. */
function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 90) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function resolvedClientId(client: ResolvedClientContext): string | null {
  if (isMergedClientContext(client)) {
    const crm = client.parts.find((p) => p.source === "clients");
    const crmId = crm?.debugRow?.id?.trim();
    if (crmId) return crmId;
    const formgrid = client.parts.find((p) => p.source === "new_clients");
    const fgId = formgrid?.debugRow?.id?.trim();
    if (fgId) return fgId;
    const prefixed = client.debugRow?.["Клиенты:id"]?.trim();
    return prefixed || null;
  }
  return client.debugRow?.id?.trim() || null;
}

function latinNameFromResolved(client: ResolvedClientContext): string | null {
  if (isMergedClientContext(client)) {
    const crm = client.parts.find((p) => p.source === "clients");
    return display(crm?.debugRow?.latinName) ?? display(client.name);
  }
  return display(client.debugRow?.latinName);
}

function partnerFromResolved(client: ResolvedClientContext): string | null {
  if (isMergedClientContext(client)) {
    const crm = client.parts.find((p) => p.source === "clients");
    return display(crm?.debugRow?.partner) ?? null;
  }
  return display(client.debugRow?.partner);
}

function buildSearchIntent(query: string): ClientSearchIntent {
  const email = extractEmailFromQuery(query);
  const phone = extractPhoneFromQuery(query);
  const passport = looksLikePassportNumber(query) ? query.trim() : null;
  return {
    ...EMPTY_CLIENT_SEARCH_INTENT,
    clientName: email || phone || passport ? null : query.trim(),
    email,
    phone,
    passport,
    freeText: [],
    isListQuery: false,
  };
}

export type SafeClientRecord = {
  clientId: string;
  name: string | null;
  latinName: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  manager: string | null;
  partner: string | null;
  submittedAt: string | null;
  bookingAddress: string | null;
  bookingRange: string | null;
  approvalAt: string | null;
  residenceCardIssuedAt: string | null;
  expectedApprovalAt: string | null;
  notes: string | null;
  direction: string | null;
  citizenship: string | null;
  hasContract: boolean | null;
  contractLabel: string | null;
  source: string;
};

export function projectSafeClient(client: Client): SafeClientRecord {
  const notesRaw = display(client.notes);
  const notes =
    notesRaw == null
      ? null
      : truncateChars(notesRaw, 1500).text;
  const contract = display(client.contract);
  return {
    clientId: client.id,
    name: display(client.name),
    latinName: display(client.citizenship),
    email: display(client.email),
    phone: display(client.phone),
    status: display(client.status),
    manager: display(client.manager),
    partner: display(client.partnerName),
    submittedAt: display(client.submittedAt ?? client.createdAt),
    bookingAddress: display(client.bookingAddress),
    bookingRange: display(client.bookingRange),
    approvalAt: display(client.approvalAt),
    residenceCardIssuedAt: display(client.residenceCardIssuedAt),
    expectedApprovalAt: display(client.expectedApprovalAt),
    notes,
    direction: display(client.direction),
    citizenship: display(client.citizenship),
    hasContract: contract != null,
    contractLabel: contract ? "указан" : null,
    source: "clients",
  };
}

function assertNoSensitiveKeys(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (isDeniedClientFieldKey(key)) {
      throw new Error(`Sensitive key leaked into tool payload: ${key}`);
    }
  }
}

function baseResult(
  tool: string,
  started: number,
  partial: Partial<WorkspaceToolResult> &
    Pick<WorkspaceToolResult, "ok" | "errorCode" | "data">,
): Omit<WorkspaceToolResult, "toolCallId" | "cacheHit"> {
  const data = deepRedactToolPayload(partial.data);
  const serialized = JSON.stringify(data ?? null);
  return {
    ok: partial.ok,
    tool,
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    data,
    latencyMs: Date.now() - started,
    resultCount: partial.resultCount ?? null,
    outputChars: serialized.length,
    sourceTags: partial.sourceTags ?? [],
  };
}

export async function executeSearchClients(
  rawArgs: unknown,
  _ctx: WorkspaceToolContext,
): Promise<Omit<WorkspaceToolResult, "toolCallId" | "cacheHit">> {
  const started = Date.now();
  const validated = validateSearchClientsArgs(rawArgs);
  if (!validated.ok) {
    return baseResult("search_clients", started, {
      ok: false,
      errorCode: validated.errorCode,
      errorMessage: validated.message,
      data: { error: validated.message },
    });
  }

  try {
    const intent = buildSearchIntent(validated.value.query);
    const { clients, totalFound } = await executeStructuredClientSearch(
      intent,
      validated.value.query,
      validated.value.limit,
    );

    if (totalFound === 0 || clients.length === 0) {
      return baseResult("search_clients", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "No clients matched the query",
        data: { matches: [], ambiguous: false, totalMatches: 0 },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    const matches = clients
      .map((client) => {
        const clientId = resolvedClientId(client);
        if (!clientId) return null;
        return {
          clientId,
          displayName: display(client.name) ?? clientId,
          latinName: latinNameFromResolved(client),
          status: display(client.status),
          partner: partnerFromResolved(client),
          manager: display(client.manager),
          score: client.score,
          confidence: confidenceFromScore(client.score),
          matchReasons: (client.matchedFields ?? []).slice(0, 6),
          source: isMergedClientContext(client)
            ? "merged"
            : client.source === "clients"
              ? "clients"
              : "new_clients",
        };
      })
      .filter(Boolean);

    if (matches.length === 0) {
      return baseResult("search_clients", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Matches lacked stable clientId",
        data: { matches: [], ambiguous: false, totalMatches: totalFound },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    // One strong exact full-name match outranks weak morph candidates.
    const bestScore = Math.max(...matches.map((m) => m!.score));
    let ranked = matches;
    if (bestScore >= 90) {
      ranked = matches.filter((m) => m!.score >= 80);
    }

    const publicMatches = ranked.map((m) => {
      const { score: _score, ...rest } = m!;
      return rest;
    });

    const highOrMed = publicMatches.filter(
      (m) => m.confidence === "high" || m.confidence === "medium",
    );
    const ambiguous = highOrMed.length > 1;

    return baseResult("search_clients", started, {
      ok: true,
      errorCode: ambiguous ? "AMBIGUOUS" : null,
      errorMessage: ambiguous
        ? "Multiple credible matches — ask the user which client"
        : null,
      data: {
        matches: publicMatches,
        ambiguous,
        totalMatches: totalFound,
      },
      resultCount: publicMatches.length,
      sourceTags: ["CLIENT"],
    });
  } catch (error) {
    return baseResult("search_clients", started, {
      ok: false,
      errorCode: "SOURCE_UNAVAILABLE",
      errorMessage:
        error instanceof Error ? error.message : "Client search failed",
      data: { error: "SOURCE_UNAVAILABLE" },
      sourceTags: ["CLIENT"],
    });
  }
}

export async function executeGetClient(
  rawArgs: unknown,
  _ctx: WorkspaceToolContext,
): Promise<Omit<WorkspaceToolResult, "toolCallId" | "cacheHit">> {
  const started = Date.now();
  const validated = validateGetClientArgs(rawArgs);
  if (!validated.ok) {
    return baseResult("get_client", started, {
      ok: false,
      errorCode: validated.errorCode,
      errorMessage: validated.message,
      data: { error: validated.message },
    });
  }

  try {
    let client: Client | null = null;
    if (isFormgridClientId(validated.value.clientId)) {
      client = await getFormgridClientById(validated.value.clientId);
    } else {
      const detail = await getClientDetail(validated.value.clientId);
      client = detail?.client ?? null;
    }

    if (!client) {
      return baseResult("get_client", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Client not found",
        data: { clientId: validated.value.clientId },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    const safe = projectSafeClient(client);
    assertNoSensitiveKeys(safe as unknown as Record<string, unknown>);

    return baseResult("get_client", started, {
      ok: true,
      errorCode: null,
      errorMessage: null,
      data: { client: safe },
      resultCount: 1,
      sourceTags: ["CLIENT"],
    });
  } catch (error) {
    return baseResult("get_client", started, {
      ok: false,
      errorCode: "SOURCE_UNAVAILABLE",
      errorMessage:
        error instanceof Error ? error.message : "get_client failed",
      data: { error: "SOURCE_UNAVAILABLE" },
      sourceTags: ["CLIENT"],
    });
  }
}

const CASE_CONTEXT_MAX_CHARS = 7500;

export async function executeGetCaseContext(
  rawArgs: unknown,
  _ctx: WorkspaceToolContext,
): Promise<Omit<WorkspaceToolResult, "toolCallId" | "cacheHit">> {
  const started = Date.now();
  const validated = validateGetCaseContextArgs(rawArgs);
  if (!validated.ok) {
    return baseResult("get_case_context", started, {
      ok: false,
      errorCode: validated.errorCode,
      errorMessage: validated.message,
      data: { error: validated.message },
    });
  }

  try {
    let clientRecord: Client | null = null;
    let documents: Array<{
      id: string;
      name: string;
      category: string;
      uploadedAt: string;
    }> = [];

    if (isFormgridClientId(validated.value.clientId)) {
      clientRecord = await getFormgridClientById(validated.value.clientId);
    } else {
      const detail = await getClientDetail(validated.value.clientId);
      clientRecord = detail?.client ?? null;
      documents = detail?.documents ?? [];
    }

    if (!clientRecord) {
      return baseResult("get_case_context", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Client not found",
        data: { clientId: validated.value.clientId },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    const client = projectSafeClient(clientRecord);
    const documentsInventory = documents.slice(0, 25).map((doc) => ({
      documentId: doc.id,
      title: doc.name,
      category: doc.category || null,
      uploadedAt: doc.uploadedAt || null,
      source: "sheets_documents" as const,
      textAvailable: false,
      extractionStatus: "not_fetched" as const,
    }));

    const notesPreview =
      client.notes == null
        ? null
        : truncateChars(client.notes, 800).text;

    const formgridOnly = isFormgridClientId(validated.value.clientId);

    let payload: Record<string, unknown> = {
      client,
      summary: {
        displayName: client.name,
        status: client.status,
        manager: client.manager,
        partner: client.partner,
        direction: client.direction,
        submittedAt: client.submittedAt,
        bookingAddress: client.bookingAddress,
        bookingRange: client.bookingRange,
        approvalAt: client.approvalAt,
        residenceCardIssuedAt: client.residenceCardIssuedAt,
        expectedApprovalAt: client.expectedApprovalAt,
      },
      notesPreview,
      documentsInventory,
      documentCount: documentsInventory.length,
      sourcesAvailable: {
        clients: !formgridOnly,
        formgrid: formgridOnly,
        sheetsDocuments: documentsInventory.length > 0,
        emigrantDrive: false,
        knowledgeBase: false,
      },
      limitations: [
        "Phase 1: Emigrant Drive and KB full content not included in get_case_context.",
        "Use search_knowledge_base for program requirements.",
        ...(formgridOnly
          ? [
              "Client resolved from Formgrid lead row (not yet in CRM Clients sheet).",
            ]
          : []),
      ],
      partial: false,
    };

    let serialized = JSON.stringify(deepRedactToolPayload(payload));
    let partial = false;
    if (serialized.length > CASE_CONTEXT_MAX_CHARS) {
      payload = {
        ...payload,
        notesPreview:
          notesPreview == null
            ? null
            : truncateChars(notesPreview, 200).text,
        documentsInventory: documentsInventory.slice(0, 10),
        partial: true,
        limitations: [
          ...(payload.limitations as string[]),
          "Case context truncated to size cap.",
        ],
      };
      serialized = JSON.stringify(deepRedactToolPayload(payload));
      partial = true;
      if (serialized.length > CASE_CONTEXT_MAX_CHARS) {
        payload = {
          client,
          summary: payload.summary,
          documentCount: documentsInventory.length,
          sourcesAvailable: payload.sourcesAvailable,
          limitations: payload.limitations,
          partial: true,
        };
        partial = true;
      }
    }

    assertNoSensitiveKeys(client as unknown as Record<string, unknown>);

    return baseResult("get_case_context", started, {
      ok: true,
      errorCode: partial ? "PARTIAL_RESULTS" : null,
      errorMessage: partial ? "Case context truncated" : null,
      data: payload,
      resultCount: 1,
      sourceTags: ["CLIENT"],
    });
  } catch (error) {
    return baseResult("get_case_context", started, {
      ok: false,
      errorCode: "SOURCE_UNAVAILABLE",
      errorMessage:
        error instanceof Error ? error.message : "get_case_context failed",
      data: { error: "SOURCE_UNAVAILABLE" },
      sourceTags: ["CLIENT"],
    });
  }
}
