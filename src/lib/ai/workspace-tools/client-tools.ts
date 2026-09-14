/**
 * Read-only client tools wrapping portal intake (Заявки Emigrant).
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
import {
  getPortalIntakeCaseById,
  portalCaseToContext,
  PORTAL_INTAKE_SOURCE_LABEL,
} from "@/lib/ai/portal-intake-clients";
import { readStaffDocuments } from "@/lib/client-portal/staff-case-meta";
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
    for (const part of client.parts) {
      const id = part.debugRow?.id?.trim();
      if (id) return id;
    }
    return null;
  }
  return client.debugRow?.id?.trim() || null;
}

function latinNameFromResolved(client: ResolvedClientContext): string | null {
  if (isMergedClientContext(client)) {
    for (const part of client.parts) {
      const latin = display(part.debugRow?.latinName);
      if (latin) return latin;
    }
    return display(client.name);
  }
  return display(client.debugRow?.latinName);
}

function partnerFromResolved(client: ResolvedClientContext): string | null {
  if (isMergedClientContext(client)) {
    for (const part of client.parts) {
      const partner = display(part.debugRow?.partner);
      if (partner) return partner;
    }
    return null;
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

export function projectSafeFromResolved(
  client: ResolvedClientContext,
): SafeClientRecord | null {
  const clientId = resolvedClientId(client);
  if (!clientId) return null;
  const row = isMergedClientContext(client)
    ? client.parts[0]?.debugRow ?? client.debugRow
    : client.debugRow;
  const notesRaw = display(row.notes ?? client.surveyData?.slice(0, 1500));
  const notes =
    notesRaw == null ? null : truncateChars(notesRaw, 1500).text;
  const contract = display(row.contract);
  return {
    clientId,
    name: display(client.name),
    latinName: display(row.latinName),
    email: display(client.email),
    phone: display(client.phone),
    status: display(client.status),
    manager: display(client.manager),
    partner: display(row.partner),
    submittedAt: display(row.submittedAt ?? client.lastActivity),
    bookingAddress: display(row.bookingAddress),
    bookingRange: display(row.bookingRange),
    approvalAt: display(row.approvalAt),
    residenceCardIssuedAt: display(row.residenceCardIssuedAt),
    expectedApprovalAt: display(row.expectedApprovalAt),
    notes,
    direction: display(client.direction),
    citizenship: display(row.latinName),
    hasContract: contract != null,
    contractLabel: contract ? "указан" : null,
    source: PORTAL_INTAKE_SOURCE_LABEL,
  };
}

/** Test/compat helper: project a legacy Sheets Client shape without loading Sheets. */
export function projectSafeClient(client: {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  country?: string;
  citizenship?: string;
  direction?: string;
  status?: string;
  manager?: string;
  lastActivity?: string;
  createdAt?: string;
  bookingAddress?: string;
  bookingRange?: string;
  approvalAt?: string;
  residenceCardIssuedAt?: string;
  expectedApprovalAt?: string;
  partnerName?: string;
  notes?: string;
  contract?: string;
  submittedAt?: string;
}): SafeClientRecord {
  const notesRaw = display(client.notes);
  const notes =
    notesRaw == null ? null : truncateChars(notesRaw, 1500).text;
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
    source: PORTAL_INTAKE_SOURCE_LABEL,
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
            : "portal_intake",
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
    const record = await getPortalIntakeCaseById(validated.value.clientId);
    if (!record) {
      return baseResult("get_client", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Client not found",
        data: { clientId: validated.value.clientId },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    const safe = projectSafeFromResolved(portalCaseToContext(record, 100));
    if (!safe) {
      return baseResult("get_client", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Client lacked stable id",
        data: { clientId: validated.value.clientId },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }
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
    const record = await getPortalIntakeCaseById(validated.value.clientId);
    if (!record) {
      return baseResult("get_case_context", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Client not found",
        data: { clientId: validated.value.clientId },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    const resolved = portalCaseToContext(record, 100);
    const client = projectSafeFromResolved(resolved);
    if (!client) {
      return baseResult("get_case_context", started, {
        ok: false,
        errorCode: "NOT_FOUND",
        errorMessage: "Client lacked stable id",
        data: { clientId: validated.value.clientId },
        resultCount: 0,
        sourceTags: ["CLIENT"],
      });
    }

    const staffDocs = readStaffDocuments(record.answers);
    const documentsInventory = staffDocs.slice(0, 25).map((doc) => ({
      documentId: doc.id,
      title: doc.fileName,
      category: null as string | null,
      uploadedAt: doc.createdAt || null,
      source: "portal_documents" as const,
      textAvailable: false,
      extractionStatus: "not_fetched" as const,
    }));

    const notesPreview =
      client.notes == null ? null : truncateChars(client.notes, 800).text;

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
        clients: true,
        formgrid: false,
        portalIntake: true,
        sheetsDocuments: false,
        emigrantDrive: false,
        knowledgeBase: false,
      },
      limitations: [
        "Клиентские данные — только из заявок портала Emigrant.",
        "Formgrid / Google Sheets CRM отключены для AI Workspace.",
        "Phase 1: Emigrant Drive and KB full content not included in get_case_context.",
        "Use search_knowledge_base for program requirements.",
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
