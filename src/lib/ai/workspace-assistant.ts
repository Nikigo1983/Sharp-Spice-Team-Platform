import {
  AUTHORITATIVE_EVIDENCE_BANNER,
  buildAttributionLabels,
  buildHistoryPrecedenceNote,
  formatClientProvenanceBlock,
  applyPostAnswerGroundingGuards,
} from "@/lib/ai/answer-grounding";
import { getAiRuntimeConfig, getAiSetupHint, isAiConfigured } from "@/lib/ai/config";
import { decideKbGrounding } from "@/lib/ai/kb-grounding";
import {
  createChatCompletionResult,
  streamChatCompletionResult,
  type ChatCompletionOptions,
  type ChatMessage,
} from "@/lib/ai/openai";
import {
  isPassportNumberLookupQuery,
  type WorkspaceQueryIntent,
} from "@/lib/ai/query-intent";
import { resolveWorkspaceRouting } from "@/lib/ai/workspace-router";
import {
  applyRoutingDecisionToTrace,
  createAiRequestId,
  createEmptyWorkspaceAiTrace,
  estimateChars,
  logWorkspaceAiTrace,
  skippedDriveMeta,
  type WorkspaceAiTrace,
} from "@/lib/ai/workspace-trace";
import { extractPersonNameTokens } from "@/lib/ai/name-matching";
import { extractPassportFromClientRecord } from "@/lib/ai/client-passport";
import {
  formatPassportLookupReply,
  formatPassportMissingReply,
  looksLikePassportNumber,
} from "@/lib/ai/format-client";
import {
  clientNameMatchesQueryToken,
  crmPartFromResolved,
  detectRequestedClientFactField,
  extractClientNameHintFromFactQuery,
  formatStructuredClientFactReply,
  readClientFactFromClientRecord,
  readClientFactFromCrmContext,
} from "@/lib/ai/client-fact-lookup";
import {
  getWorkspaceAiConfig,
  type WorkspaceResponseMode,
} from "@/lib/ai/workspace-config";
import {
  formatClientCandidatesForAi,
  formatClientContextBlock,
  formatDebugClientReply,
  formatMergedClientContextBlock,
  isMergedClientContext,
  type ClientCandidateScenario,
  type ClientContext,
  type EmigrantDeskContextSlice,
  type ResolvedClientContext,
} from "@/lib/ai/client-context";
import {
  formatClientSearchIntentForAi,
  shouldOfferClientSelection,
} from "@/lib/ai/client-search-intent";
import {
  buildClientSearchQuery,
  groupDuplicateClients,
  isDebugClientCommand,
  lookupAllClientMatches,
  lookupClientsWithAiSearch,
  lookupFuzzyClientCandidates,
  parseDebugClientQuery,
  scanRawRowsForTokens,
} from "@/lib/ai/client-lookup";
import {
  followUpToClientContext,
  resolveClientSelectionFollowUp,
} from "@/lib/ai/client-selection-followup";
import { mergeClientContexts } from "@/lib/ai/client-deduplication";
import {
  redactSensitiveText,
  sanitizeClientContextsForTransport,
} from "@/lib/ai/context-redaction";
import { buildWorkspaceSystemPrompt } from "@/lib/ai/workspace-prompt";
import { buildWorkspaceContext } from "@/lib/ai/workspace-context";
import {
  emigrantDeskClientToContextSlice,
  findEmigrantDeskClientByQuery,
} from "@/lib/emigrant-desk/clients";
import {
  formatFormgridRowSummary,
  listFormgridRowsSince,
  parseRecentDaysFromQuery,
} from "@/lib/google-sheets/formgrid-dates";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listClients } from "@/lib/google-sheets/service";

export type { WorkspaceResponseMode } from "@/lib/ai/workspace-config";

export type WorkspaceChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type WorkspaceAiResult = {
  reply: string;
  sources: string[];
  demo: boolean;
  requestId: string;
  pendingClientCandidates?: ClientContext[];
  needsClientSelection?: boolean;
};

export type WorkspaceAiStreamMeta = {
  sources: string[];
  demo: boolean;
  requestId: string;
  pendingClientCandidates?: ClientContext[];
  needsClientSelection?: boolean;
};

export type WorkspaceAiStreamStatus = {
  status: "context" | "generating";
};

function pendingCandidatesForTransport(
  pending: ClientContext[] | null | undefined,
): ClientContext[] | undefined {
  return sanitizeClientContextsForTransport(pending ?? undefined);
}

function buildSources(
  context: Awaited<ReturnType<typeof buildWorkspaceContext>>,
  intent: WorkspaceQueryIntent,
  options?: {
    clientLabel?: string | null;
    deskLabel?: string | null;
    formgridLabel?: string | null;
    kbBlockedInsufficient?: boolean;
  },
): string[] {
  return buildAttributionLabels({
    kbMeta: intent.needsKb ? context.kbRetrieval : null,
    emigrantMeta: intent.needsEmigrantDrive ? context.emigrantDriveRetrieval : null,
    clientLabel: options?.clientLabel ?? null,
    deskLabel: options?.deskLabel ?? null,
    formgridLabel:
      options?.formgridLabel ??
      (intent.needsFormgrid && context.meta.formgridRows > 0
        ? `Formgrid — анкеты (${context.meta.formgridRows})`
        : null),
    kbBlockedInsufficient: options?.kbBlockedInsufficient ?? false,
  });
}

function buildContextBlock(
  context: Awaited<ReturnType<typeof buildWorkspaceContext>>,
  intent: WorkspaceQueryIntent,
  clientContext: ResolvedClientContext | null,
  clientCandidates: ResolvedClientContext[] | null = null,
  candidateScenario: ClientCandidateScenario | null = null,
  clientSearchIntentNote: string | null = null,
  clientCandidatesTotalFound: number | null = null,
  deskSlice: EmigrantDeskContextSlice | null = null,
): string {
  const contextParts: string[] = [];

  if (clientSearchIntentNote) {
    contextParts.push(
      `=== CLIENT SEARCH INTENT ===\n${clientSearchIntentNote}`,
    );
  }

  if (clientContext) {
    const header = isMergedClientContext(clientContext)
      ? "=== CLIENT CONTEXT (MERGED) ==="
      : "=== CLIENT CONTEXT (Google Sheets) ===";
    const clientBody = formatClientContextBlock(clientContext, { desk: deskSlice });
    const titled = isMergedClientContext(clientContext)
      ? clientContext.parts.map((p) => p.name).filter(Boolean).join(" / ") ||
        "merged client"
      : clientContext.name || "client";
    const { block } = formatClientProvenanceBlock({
      index: 1,
      title: titled,
      body: `${header}\n${clientBody}`,
    });
    contextParts.push(block);
  }

  if (clientCandidates && clientCandidates.length > 0 && candidateScenario) {
    const header =
      candidateScenario === "not_found"
        ? "=== CLIENT CANDIDATES (fuzzy, точного совпадения нет) ==="
        : candidateScenario === "weak"
          ? "=== CLIENT CANDIDATES (похожие совпадения) ==="
          : candidateScenario === "structured"
            ? "=== CLIENT CANDIDATES (структурированный поиск) ==="
            : "=== CLIENT CANDIDATES (найдено несколько) ===";
    contextParts.push(
      `${header}\n${formatClientCandidatesForAi(
        clientCandidates,
        candidateScenario,
        clientCandidatesTotalFound ?? clientCandidates.length,
      )}`,
    );
  }

  if (intent.needsKb) {
    contextParts.push(`=== KNOWLEDGE BASE ===\n${context.knowledgeBaseText}`);
  }
  if (intent.needsEmigrantDrive) {
    contextParts.push(`=== ЭМИГРАНТ (документы клиентов) ===\n${context.emigrantDriveText}`);
  }
  if (intent.needsClients && !clientContext && !clientCandidates?.length) {
    contextParts.push(`=== КЛИЕНТЫ ===\n${context.clientsText}`);
  }
  if (intent.needsEmigrantDesk && !deskSlice) {
    contextParts.push(`=== EMIGRANT CROATIA DESK ===\n${context.emigrantDeskText}`);
  }
  if (intent.needsFormgrid && !clientContext) {
    contextParts.push(`=== FORMGRID ===\n${context.formgridText}`);
  }
  return contextParts.join("\n\n");
}

function buildChatMessages(
  trimmed: string,
  contextBlock: string,
  history: WorkspaceChatTurn[],
  mode: WorkspaceResponseMode,
): ChatMessage[] {
  const historyMessages: ChatMessage[] = history.slice(-4).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const hasAuthoritative =
    /\[SOURCE:|CLIENT CONTEXT|KNOWLEDGE BASE|ЭМИГРАНТ|FORMGRID|EMIGRANT CROATIA DESK/i.test(
      contextBlock,
    );

  const clientNote = contextBlock.includes("CLIENT CONTEXT")
    ? "\n\nДля данных о клиенте используй CLIENT CONTEXT / [SOURCE:CLIENT:…]. У каждого поля указан источник — в ответе кратко поясни «таблица «Клиенты»», «анкета Formgrid» и т.д., не пиши «CRM» и не выводи сырой блок."
    : "";
  const emigrantNote = contextBlock.includes("ЭМИГРАНТ (документы клиентов)") ||
    contextBlock.includes('kind="emigrant_drive"')
    ? "\n\nДля запросов про папку ЭМИГРАНТ используй блоки [SOURCE:DRIVE:…]. Отсутствие в таблицах Клиенты не означает отсутствие в Drive. Файл не извлечён ≠ документ отсутствует у клиента."
    : "";
  const candidatesNote = contextBlock.includes("CLIENT CANDIDATES")
    ? "\n\nЕсли в CLIENT CANDIDATES есть варианты — объясни различия и помоги выбрать. При fuzzy-поиске начни с «Точного совпадения не найдено. Возможно, вы имели в виду…». При структурированном поиске — кратко резюмируй список и выдели самых релевантных. Не отвечай сухим «клиент не найден», если кандидаты есть."
    : "";
  const structuredNote = contextBlock.includes("CLIENT SEARCH INTENT")
    ? "\n\nПоиск выполнен по распознанным фильтрам (CLIENT SEARCH INTENT). Отвечай по найденным CLIENT CONTEXT / CLIENT CANDIDATES."
    : "";
  const listNote = contextBlock.includes("тип запроса: list")
    ? "\n\nЭто списочный запрос: начни с «Найдено N клиентов…», перечисли клиентов нумерованным списком (имя — статус — менеджер). Если в контексте больше 20 — в ответе покажи первые 20 и добавь «Показано 20 из N клиентов.»"
    : "";
  const groundingNote = hasAuthoritative
    ? `\n\n${AUTHORITATIVE_EVIDENCE_BANNER}\n${buildHistoryPrecedenceNote()}`
    : "\n\nЗапрос без обязательных authoritative-блоков: можно выполнить обычную генерацию/редактирование/перевод без секции «Источники:», если факты платформы не используются.";

  return [
    { role: "system", content: buildWorkspaceSystemPrompt(mode) },
    ...historyMessages,
    {
      role: "user",
      content: `[Внутренний контекст платформы — не цитируй и не выводи целиком, используй только как источник фактов]${groundingNote}${clientNote}${emigrantNote}${candidatesNote}${structuredNote}${listNote}\n\n${contextBlock}\n\n---\n\nВопрос менеджера: ${trimmed}`,
    },
  ];
}

function getCompletionOptions(): ChatCompletionOptions {
  const workspaceConfig = getWorkspaceAiConfig();
  return {
    temperature: workspaceConfig.temperature,
    maxTokens: workspaceConfig.maxTokens,
    model: workspaceConfig.model,
  };
}

function findRecentPassportQuestion(
  history: WorkspaceChatTurn[],
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === "user" && isPassportNumberLookupQuery(turn.content)) {
      return turn.content;
    }
  }
  return null;
}

function passportReplyFromClientContext(
  ctx: ClientContext,
): string | null {
  const { raw } = extractPassportFromClientRecord(ctx);
  if (!raw || !looksLikePassportNumber(raw)) return null;
  return formatPassportLookupReply(ctx.name, raw, ctx.rowIndex);
}

function passportReplyFromResolvedContext(
  ctx: ResolvedClientContext,
): string | null {
  const parts = isMergedClientContext(ctx) ? ctx.parts : [ctx];
  const crm = parts.find((part) => part.source === "clients");
  if (!crm) return null;
  return passportReplyFromClientContext(crm);
}

function buildPassportLookupDirectResult(reply: string) {
  return {
    kind: "direct" as const,
    reply,
    sources: ["Клиенты"],
    pendingClientCandidates: [] as ClientContext[],
    needsClientSelection: false,
    groundingBlocked: false,
  };
}

function emptyContextBundle(): Awaited<ReturnType<typeof buildWorkspaceContext>> {
  return {
    clientsText: "Клиенты: не удалось загрузить таблицу.",
    emigrantDeskText: "Emigrant Croatia Desk: не удалось загрузить статусы дел.",
    emigrantDriveText: "Папка ЭМИГРАНТ: не удалось загрузить Google Drive.",
    formgridText: "Formgrid: не удалось загрузить анкеты.",
    knowledgeBaseText: "Knowledge Base: не удалось загрузить Drive.",
    kbRetrieval: {
      ...skippedDriveMeta("knowledge_base"),
      attempted: true,
      configured: true,
      mode: "failed",
      groundingState: "KB_ERROR",
      errorMessage: "CONTEXT_BUILD_ERROR",
    },
    emigrantDriveRetrieval: {
      ...skippedDriveMeta("emigrant_drive"),
      attempted: true,
      configured: true,
      mode: "failed",
      groundingState: "KB_ERROR",
      errorMessage: "CONTEXT_BUILD_ERROR",
    },
    meta: {
      clientsTotal: 0,
      emigrantDeskTotal: 0,
      emigrantDriveConfigured: false,
      formgridRows: 0,
    },
  };
}

async function resolvePassportLookupReply(
  query: string,
  clientContext: ResolvedClientContext | null,
  clientCandidates: ResolvedClientContext[] | null,
  pendingForUi: ClientContext[] | undefined,
): Promise<string | null> {
  if (clientContext) {
    const fromContext = passportReplyFromResolvedContext(clientContext);
    if (fromContext) return fromContext;
  }
  if (clientCandidates?.length === 1) {
    const fromCandidate = passportReplyFromResolvedContext(clientCandidates[0]);
    if (fromCandidate) return fromCandidate;
  }
  if (pendingForUi?.length === 1) {
    const fromPending = passportReplyFromClientContext(pendingForUi[0]);
    if (fromPending) return fromPending;
  }
  return tryDirectPassportAnswer(query);
}

async function prepareWorkspaceRequest(
  userMessage: string,
  history: WorkspaceChatTurn[],
  mode: WorkspaceResponseMode,
  pendingClientCandidates: ClientContext[] | null = null,
  requestId: string = createAiRequestId(),
): Promise<
  | { kind: "empty"; requestId: string; trace: WorkspaceAiTrace }
  | {
      kind: "direct";
      reply: string;
      sources: string[];
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
      requestId: string;
      trace: WorkspaceAiTrace;
      groundingBlocked?: boolean;
    }
  | {
      kind: "ai";
      messages: ChatMessage[];
      sources: string[];
      context: Awaited<ReturnType<typeof buildWorkspaceContext>>;
      contextBlock: string;
      trimmed: string;
      clientContext: ResolvedClientContext | null;
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
      requestId: string;
      trace: WorkspaceAiTrace;
    }
> {
  const started = Date.now();
  const trace = createEmptyWorkspaceAiTrace(requestId);
  trace.historyTurnCount = history.length;

  const trimmed = userMessage.trim();
  if (!trimmed) {
    trace.responseOk = true;
    trace.notes.push("empty_message");
    logWorkspaceAiTrace(trace);
    return { kind: "empty", requestId, trace };
  }

  const safePendingCandidates =
    sanitizeClientContextsForTransport(pendingClientCandidates ?? undefined) ??
    null;

  if (isDebugClientCommand(trimmed)) {
    const debugQuery = parseDebugClientQuery(trimmed) || trimmed;
    const searchQuery = buildClientSearchQuery(debugQuery);
    const [matches, rawHits] = await Promise.all([
      lookupAllClientMatches(debugQuery),
      scanRawRowsForTokens(debugQuery),
    ]);
    const dedupGroups = groupDuplicateClients(matches);
    const dedupInfo = dedupGroups.map((group) => ({
      parts: group.parts,
      mergeReasons: group.mergeReasons,
      mergedName: group.merged.name,
    }));
    let debugReply = formatDebugClientReply(
      debugQuery,
      matches,
      searchQuery.morphology,
      rawHits,
      dedupInfo,
    );
    const mergedGroups = dedupGroups.filter((group) => group.parts.length > 1);
    if (mergedGroups.length > 0) {
      debugReply += `\n\n**Merged context preview:**\n\n${mergedGroups
        .map((group) => formatMergedClientContextBlock(group.merged))
        .join("\n\n---\n\n")}`;
    }
    trace.selectedRoutes = ["debug_client"];
    trace.responseOk = true;
    trace.latencyMs.prepare = Date.now() - started;
    logWorkspaceAiTrace(trace);
    return {
      kind: "direct",
      reply: redactSensitiveText(debugReply),
      sources: ["Клиенты", "Новые клиенты"],
      requestId,
      trace,
    };
  }

  const followUp = resolveClientSelectionFollowUp(
    trimmed,
    safePendingCandidates,
    history,
  );

  if (followUp?.kind === "select" && findRecentPassportQuestion(history)) {
    const fromSelected = passportReplyFromClientContext(followUp.client);
    if (fromSelected) {
      const direct = buildPassportLookupDirectResult(fromSelected);
      trace.selectedRoutes = ["passport_direct"];
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return { ...direct, requestId, trace };
    }
    const passportQuery = findRecentPassportQuestion(history);
    if (passportQuery) {
      const retry = await tryDirectPassportAnswer(passportQuery);
      if (retry) {
        const direct = buildPassportLookupDirectResult(retry);
        trace.selectedRoutes = ["passport_direct"];
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return { ...direct, requestId, trace };
      }
    }
  }

  const routing = await resolveWorkspaceRouting(trimmed);
  const intent = routing.workspaceIntent;
  applyRoutingDecisionToTrace(trace, routing);

  if (isPassportNumberLookupQuery(trimmed)) {
    const early = await tryDirectPassportAnswer(trimmed);
    if (early) {
      const direct = buildPassportLookupDirectResult(early);
      trace.selectedRoutes = ["passport_direct"];
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return { ...direct, requestId, trace };
    }
  }

  let clientContext: ResolvedClientContext | null = null;
  let clientCandidates: ResolvedClientContext[] | null = null;
  let candidateScenario: ClientCandidateScenario | null = null;
  let pendingForUi: ClientContext[] | undefined;
  let needsClientSelection = false;
  let clientSearchIntentNote: string | null = null;
  let clientCandidatesTotalFound: number | null = null;

  if (followUp) {
    clientContext = followUpToClientContext(followUp);
  } else if (
    intent.needsClients ||
    intent.needsFormgrid ||
    intent.needsEmigrantDrive ||
    intent.fastClientLookup
  ) {
    try {
      const aiSearch = await lookupClientsWithAiSearch(trimmed);
      const clientLookup = aiSearch.lookup;
      clientSearchIntentNote = formatClientSearchIntentForAi(aiSearch.intent);
      clientCandidatesTotalFound = aiSearch.foundClients;
      const runtime = getAiRuntimeConfig();
      if (runtime) {
        trace.auxiliaryModel = runtime.model;
      }

      console.log(
        `[workspace-ai][${requestId}] Found clients: ${aiSearch.foundClients}, Sent to Claude: ${aiSearch.sentToClaude}, Intent type: ${aiSearch.intentType}`,
      );

      if (
        aiSearch.intentType === "list" &&
        clientLookup.kind === "single"
      ) {
        clientCandidates = [clientLookup.client];
        candidateScenario = "structured";
      } else if (clientLookup.kind === "single") {
        clientContext = clientLookup.client;
      } else if (clientLookup.kind === "multiple") {
        clientCandidates = clientLookup.clients;
        candidateScenario = aiSearch.usedStructuredSearch ? "structured" : "multiple";
        if (
          shouldOfferClientSelection(
            aiSearch.intentType,
            clientLookup.kind,
            clientLookup.clients.length,
          )
        ) {
          pendingForUi = clientLookup.pendingParts;
          needsClientSelection = true;
        }
      } else if (clientLookup.kind === "weak") {
        clientCandidates = clientLookup.clients;
        candidateScenario = "weak";
        if (aiSearch.intentType !== "list") {
          pendingForUi = clientLookup.clients.flatMap((client) =>
            isMergedClientContext(client) ? client.parts : [client],
          );
        }
      } else if (clientLookup.kind === "not_found") {
        const fuzzy = await lookupFuzzyClientCandidates(trimmed, 10);
        if (fuzzy.length > 0 && aiSearch.intentType !== "list") {
          clientCandidates = fuzzy;
          candidateScenario = "not_found";
          pendingForUi = fuzzy.flatMap((client) =>
            isMergedClientContext(client) ? client.parts : [client],
          );
        }
      }
    } catch (error) {
      console.error(`[workspace-ai][${requestId}] client search failed`, error);
      trace.notes.push("CLIENT_SEARCH_ERROR");
    }
  }

  if (isPassportNumberLookupQuery(trimmed)) {
    const passportReply = await resolvePassportLookupReply(
      trimmed,
      clientContext,
      clientCandidates,
      pendingForUi,
    );
    if (passportReply) {
      const direct = buildPassportLookupDirectResult(passportReply);
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return { ...direct, requestId, trace };
    }
    needsClientSelection = false;
    pendingForUi = undefined;
  }

  const structuredFact = await resolveStructuredClientFactReply(
    trimmed,
    clientContext,
    clientCandidates,
  );
  if (structuredFact) {
    trace.selectedRoutes = ["client_fact_direct"];
    trace.responseOk = true;
    trace.latencyMs.prepare = Date.now() - started;
    logWorkspaceAiTrace(trace);
    return {
      kind: "direct",
      reply: structuredFact,
      sources: ["Клиенты"],
      requestId,
      trace,
    };
  }

  if (intent.needsEmigrantDesk && /статус/iu.test(trimmed)) {
    const direct = await tryDirectEmigrantStatusAnswer(trimmed);
    if (direct) {
      trace.selectedRoutes = ["emigrant_desk_direct"];
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return {
        kind: "direct",
        reply: direct,
        sources: ["Emigrant Desk"],
        requestId,
        trace,
      };
    }
  }

  if (intent.needsFormgrid) {
    const direct = await tryDirectFormgridRecentAnswer(trimmed);
    if (direct) {
      trace.selectedRoutes = ["formgrid_direct"];
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return {
        kind: "direct",
        reply: direct,
        sources: ["Анкеты Formgrid"],
        requestId,
        trace,
      };
    }
  }

  const contextStarted = Date.now();
  let context: Awaited<ReturnType<typeof buildWorkspaceContext>>;
  try {
    context = await buildWorkspaceContext(trimmed, intent);
  } catch (error) {
    console.error(`[workspace-ai][${requestId}] context build failed`, error);
    context = emptyContextBundle();
    trace.fallbackActivated = true;
    trace.fallbackReason = "CONTEXT_BUILD_ERROR";
    trace.notes.push("CONTEXT_BUILD_ERROR");
  }
  trace.latencyMs.context = Date.now() - contextStarted;

  trace.kbMode = context.kbRetrieval.mode;
  trace.kbConfigured = context.kbRetrieval.configured;
  trace.kbGroundingState = context.kbRetrieval.groundingState;
  trace.kbRetrievedFileCount = context.kbRetrieval.selectedFiles.length;
  trace.kbSelectedFiles = context.kbRetrieval.selectedFiles;
  trace.kbRetrievalScores = context.kbRetrieval.selectedFiles.map((f) => f.score);
  trace.kbContextChars = context.kbRetrieval.textCharCount;
  trace.kbQueryTokens = context.kbRetrieval.queryTokens ?? [];
  trace.kbFilenameSearchAttempted =
    context.kbRetrieval.filenameSearchAttempted ?? false;
  trace.kbContentSearchAttempted =
    context.kbRetrieval.contentSearchAttempted ?? false;
  trace.kbRejectedOutsideRootCount =
    context.kbRetrieval.rejectedOutsideRootCount ?? 0;
  trace.kbRetrievalLatencyMs =
    context.kbRetrieval.retrievalLatencyMs ?? null;
  trace.emigrantDriveMode = context.emigrantDriveRetrieval.mode;
  trace.emigrantDriveFileCount =
    context.emigrantDriveRetrieval.selectedFiles.length;

  const grounding = decideKbGrounding({
    intent,
    kbMeta: context.kbRetrieval,
  });
  if (grounding.blockModel && grounding.reply) {
    if (trace.fallbackReason === "NONE") {
      trace.fallbackReason = grounding.reason;
    }
    trace.fallbackActivated = true;
    trace.responseOk = true;
    trace.notes.push(`kb_grounding:${grounding.state}`);
    trace.latencyMs.prepare = Date.now() - started;
    logWorkspaceAiTrace(trace);
    return {
      kind: "direct",
      reply: grounding.reply,
      sources: intent.needsKb
        ? buildAttributionLabels({ kbBlockedInsufficient: true })
        : [],
      requestId,
      trace,
      groundingBlocked: true,
    };
  }

  let deskSlice: EmigrantDeskContextSlice | null = null;
  if (clientContext && intent.needsEmigrantDesk) {
    try {
      const deskClient = await findEmigrantDeskClientByQuery(clientContext.name);
      if (deskClient) {
        deskSlice = emigrantDeskClientToContextSlice(deskClient);
      }
    } catch (error) {
      console.error(
        `[workspace-ai][${requestId}] desk lookup for client context failed`,
        error,
      );
    }
  }

  const clientAttrLabel = clientContext
    ? isMergedClientContext(clientContext)
      ? deskSlice
        ? "Client record — merged + Emigrant Desk"
        : "Client record — merged"
      : deskSlice
        ? `Client record — ${clientContext.name || clientContext.sourceLabel} + Emigrant Desk`
        : `Client record — ${clientContext.name || clientContext.sourceLabel}`
    : clientCandidates?.length
      ? `Client record — candidates (${clientCandidates.length})`
      : intent.needsClients && context.meta.clientsTotal > 0
        ? `Client record — table (${context.meta.clientsTotal})`
        : null;

  const sources = buildSources(context, intent, {
    clientLabel: clientAttrLabel,
    deskLabel:
      intent.needsEmigrantDesk && !clientContext && context.meta.emigrantDeskTotal > 0
        ? `Emigrant Desk — cases (${context.meta.emigrantDeskTotal})`
        : null,
  });
  const contextBlock = buildContextBlock(
    context,
    intent,
    clientContext,
    clientCandidates,
    candidateScenario,
    clientSearchIntentNote,
    clientCandidatesTotalFound,
    deskSlice,
  );

  trace.clientContextCount = clientContext ? 1 : 0;
  trace.clientCandidatesCount = clientCandidates?.length ?? 0;
  trace.clientContextChars = estimateChars(
    clientContext ? formatClientContextBlock(clientContext, { desk: deskSlice }) : "",
    clientCandidates?.length
      ? formatClientCandidatesForAi(
          clientCandidates,
          candidateScenario ?? "multiple",
          clientCandidatesTotalFound ?? clientCandidates.length,
        )
      : "",
  );
  trace.contextCharsEstimate = estimateChars(contextBlock);
  trace.latencyMs.prepare = Date.now() - started;

  const messages = buildChatMessages(trimmed, contextBlock, history, mode);

  return {
    kind: "ai",
    messages,
    sources,
    context,
    contextBlock,
    trimmed,
    clientContext,
    pendingClientCandidates: pendingCandidatesForTransport(pendingForUi),
    needsClientSelection,
    requestId,
    trace,
  };
}

export async function runWorkspaceAi(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
  pendingClientCandidates: ClientContext[] | null = null,
  requestId: string = createAiRequestId(),
): Promise<WorkspaceAiResult> {
  const totalStarted = Date.now();
  const prepared = await prepareWorkspaceRequest(
    userMessage,
    history,
    mode,
    pendingClientCandidates,
    requestId,
  );

  if (prepared.kind === "empty") {
    return {
      reply:
        "Напишите вопрос — подключу Knowledge Base, клиентов и анкеты Formgrid.",
      sources: [],
      demo: true,
      requestId: prepared.requestId,
    };
  }

  if (prepared.kind === "direct") {
    return {
      reply: prepared.reply,
      sources: prepared.sources,
      demo: false,
      requestId: prepared.requestId,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
    };
  }

  const completion = await createChatCompletionResult(
    prepared.messages,
    getCompletionOptions(),
  );
  prepared.trace.requestedModel = completion.requestedModel;
  prepared.trace.returnedModel = completion.returnedModel;
  prepared.trace.usageInputTokens = completion.usage.inputTokens;
  prepared.trace.usageOutputTokens = completion.usage.outputTokens;
  prepared.trace.latencyMs.model = completion.latencyMs;
  prepared.trace.openRouterOk = completion.ok;
  prepared.trace.latencyMs.total = Date.now() - totalStarted;

  if (completion.content) {
    const guarded = applyPostAnswerGroundingGuards({
      answer: completion.content,
      contextBlock: prepared.contextBlock,
      query: prepared.trimmed,
    });
    for (const note of guarded.notes) {
      prepared.trace.notes.push(note);
    }
    prepared.trace.responseOk = true;
    logWorkspaceAiTrace(prepared.trace);
    return {
      reply: guarded.answer,
      sources: prepared.sources,
      demo: false,
      requestId: prepared.requestId,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
    };
  }

  prepared.trace.fallbackActivated = true;
  prepared.trace.fallbackReason =
    completion.error === "MODEL_EMPTY_RESPONSE"
      ? "MODEL_EMPTY_RESPONSE"
      : "OPENROUTER_ERROR";
  prepared.trace.responseOk = false;
  prepared.trace.notes.push(completion.error ?? "OPENROUTER_ERROR");
  logWorkspaceAiTrace(prepared.trace);

  return {
    reply: buildDemoReply(prepared.trimmed, prepared.context),
    sources: prepared.sources,
    demo: true,
    requestId: prepared.requestId,
    pendingClientCandidates: prepared.pendingClientCandidates,
    needsClientSelection: prepared.needsClientSelection,
  };
}

export async function* runWorkspaceAiStream(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
  pendingClientCandidates: ClientContext[] | null = null,
  requestId: string = createAiRequestId(),
): AsyncGenerator<string | WorkspaceAiStreamMeta | WorkspaceAiStreamStatus> {
  const totalStarted = Date.now();
  yield { status: "context" };

  const prepared = await prepareWorkspaceRequest(
    userMessage,
    history,
    mode,
    pendingClientCandidates,
    requestId,
  );

  if (prepared.kind === "empty") {
    yield {
      sources: [],
      demo: true,
      requestId: prepared.requestId,
    };
    yield "Напишите вопрос — подключу Knowledge Base, клиентов и анкеты Formgrid.";
    return;
  }

  if (prepared.kind === "direct") {
    yield {
      sources: prepared.sources,
      demo: false,
      requestId: prepared.requestId,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
    };
    yield prepared.reply;
    return;
  }

  yield {
    sources: prepared.sources,
    demo: false,
    requestId: prepared.requestId,
    pendingClientCandidates: prepared.pendingClientCandidates,
    needsClientSelection: prepared.needsClientSelection,
  };

  yield { status: "generating" };

  const mayNeedGroundingGuard =
    prepared.contextBlock.includes("NOT_FOUND_IN_RETRIEVED_CONTEXT") ||
    prepared.contextBlock.includes("UNKNOWN_INSUFFICIENT") ||
    /доход|income|минимал/i.test(prepared.trimmed);
  let buffered = "";
  let hasContent = false;
  for await (const event of streamChatCompletionResult(
    prepared.messages,
    getCompletionOptions(),
  )) {
    if (event.type === "delta") {
      hasContent = true;
      if (mayNeedGroundingGuard) {
        buffered += event.content;
      } else {
        yield event.content;
      }
      continue;
    }

    prepared.trace.requestedModel = event.result.requestedModel;
    prepared.trace.returnedModel = event.result.returnedModel;
    prepared.trace.usageInputTokens = event.result.usage.inputTokens;
    prepared.trace.usageOutputTokens = event.result.usage.outputTokens;
    prepared.trace.latencyMs.model = event.result.latencyMs;
    prepared.trace.openRouterOk = event.result.ok;
    prepared.trace.latencyMs.total = Date.now() - totalStarted;

    if (!event.result.ok) {
      prepared.trace.fallbackActivated = true;
      prepared.trace.fallbackReason =
        event.result.error === "MODEL_EMPTY_RESPONSE"
          ? "MODEL_EMPTY_RESPONSE"
          : "OPENROUTER_ERROR";
      prepared.trace.notes.push(event.result.error ?? "OPENROUTER_ERROR");
    } else {
      prepared.trace.responseOk = true;
    }

    if (mayNeedGroundingGuard && buffered) {
      const guarded = applyPostAnswerGroundingGuards({
        answer: buffered,
        contextBlock: prepared.contextBlock,
        query: prepared.trimmed,
      });
      for (const note of guarded.notes) {
        prepared.trace.notes.push(note);
      }
      yield guarded.answer;
    }

    logWorkspaceAiTrace(prepared.trace);
  }

  if (!hasContent) {
    yield {
      sources: prepared.sources,
      demo: true,
      requestId: prepared.requestId,
    };
    yield buildDemoReply(prepared.trimmed, prepared.context);
  }
}

async function tryDirectFormgridRecentAnswer(
  message: string,
): Promise<string | null> {
  const days = parseRecentDaysFromQuery(message);
  if (days === null) return null;
  if (!/анкет|formgrid|заявк|новые\s+клиент/i.test(message)) return null;

  const table = await getFormgridLeadsTable();
  if (table.rows.length === 0) return null;

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days);

  const recent = listFormgridRowsSince(table.headers, table.rows, since);
  if (recent.length === 0) {
    return `За последние **${days}** дн. в анкете Formgrid новых заявок нет.`;
  }

  const lines = recent.map((row) =>
    `- ${formatFormgridRowSummary(table.headers, row)}`,
  );

  return [
    `За последние **${days}** дн. в анкете Formgrid — **${recent.length}** заявок:`,
    ...lines,
  ].join("\n");
}

async function tryDirectEmigrantStatusAnswer(
  message: string,
): Promise<string | null> {
  const client = await findEmigrantDeskClientByQuery(message);
  if (!client) return null;

  const name = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const status = client.currentStatus?.trim() || "не указан";
  const parts = [
    `**${name || client.email}** в Emigrant Croatia Desk: статус дела — **${status}**.`,
  ];

  if (client.caseNumber) {
    parts.push(`№ дела / паспорт в кабинете: ${client.caseNumber}.`);
  }
  if (client.statusUpdatedAt) {
    parts.push(`Статус обновлён: ${client.statusUpdatedAt.slice(0, 10)}.`);
  }
  if (client.consulate) {
    parts.push(`Консульство: ${client.consulate}.`);
  }

  return parts.join(" ");
}

async function tryDirectPassportAnswer(message: string): Promise<string | null> {
  const tokens = extractPersonNameTokens(message);
  if (tokens.length === 0) return null;

  const { items } = await listClients(1, 500);
  const client = items.find((entry) => {
    const nameLower = entry.name.toLowerCase();
    return tokens.every((token) => nameLower.includes(token.toLowerCase()));
  });
  if (!client) return null;

  const passport = client.passportNumber?.trim();
  if (passport && passport !== "—" && looksLikePassportNumber(passport)) {
    return formatPassportLookupReply(
      client.name,
      passport,
      client.rowIndex,
    );
  }

  return formatPassportMissingReply(client.name, client.rowIndex);
}

async function resolveStructuredClientFactReply(
  message: string,
  clientContext: ResolvedClientContext | null,
  clientCandidates: ResolvedClientContext[] | null,
): Promise<string | null> {
  const fieldId = detectRequestedClientFactField(message);
  if (!fieldId) return null;

  // Ambiguous multi-match: never silently pick one client for a field fact.
  if (!clientContext && clientCandidates && clientCandidates.length > 1) {
    return null;
  }

  const fromResolved =
    clientContext ??
    (clientCandidates?.length === 1 ? clientCandidates[0] : null);
  if (fromResolved) {
    const crm = crmPartFromResolved(fromResolved);
    if (crm) {
      const fact = readClientFactFromCrmContext(crm, fieldId);
      return formatStructuredClientFactReply({
        clientName: crm.name || fromResolved.name,
        fieldId,
        value: fact.value,
        present: fact.present,
        rowIndex: crm.rowIndex,
      });
    }
  }

  const hint = extractClientNameHintFromFactQuery(message);
  if (!hint) return null;

  const { items } = await listClients(1, 500);
  const matches = items.filter((client) =>
    clientNameMatchesQueryToken(client.name, hint),
  );
  if (matches.length !== 1) return null;

  const client = matches[0];
  const fact = readClientFactFromClientRecord(client, fieldId);
  return formatStructuredClientFactReply({
    clientName: client.name,
    fieldId,
    value: fact.value,
    present: fact.present,
    rowIndex: client.rowIndex,
  });
}

const STOP_WORDS = new Set([
  "найди",
  "найти",
  "покажи",
  "клиент",
  "клиента",
  "адрес",
  "букинг",
  "букинга",
  "у",
  "мне",
  "для",
  "что",
  "где",
]);

function extractNameTokens(query: string): string[] {
  const lower = query.toLowerCase();
  const afterClient = lower.match(
    /(?:клиент[а-я]*|у)\s+([а-яё\-]+(?:\s+[а-яё\-]+)?)/iu,
  );
  const focus = afterClient?.[1] ?? lower;

  return focus
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function findClientLines(clientsText: string, query: string): string[] {
  const nameTokens = extractNameTokens(query);

  if (clientsText.includes("---") && nameTokens.length > 0) {
    const blocks = clientsText
      .split("---")
      .map((b) => b.trim())
      .filter(Boolean);
    const byName = blocks.filter((block) => {
      const hay = block.toLowerCase();
      return nameTokens.some((t) => hay.includes(t));
    });
    if (byName.length > 0) return byName.slice(0, 2);
  }

  const lines = clientsText.split("\n").filter((line) => line.startsWith("- "));
  if (lines.length === 0) return [];

  if (nameTokens.length > 0) {
    const byName = lines.filter((line) => {
      const hay = line.toLowerCase();
      return nameTokens.some((t) => hay.includes(t));
    });
    if (byName.length > 0) return byName.slice(0, 3);
  }

  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));

  return lines
    .filter((line) => {
      const hay = line.toLowerCase();
      return tokens.some((t) => hay.includes(t));
    })
    .slice(0, 3);
}

function summarizeClientMatch(block: string): string {
  const nameLine = block
    .split("\n")
    .find((line) => /имя|name|клиент/i.test(line) || line.startsWith("- "));
  const compact = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ");
  return nameLine?.trim() || compact || block.slice(0, 200);
}

function buildDemoReply(
  message: string,
  context: Awaited<ReturnType<typeof buildWorkspaceContext>>,
): string {
  const lower = message.toLowerCase();
  const aiConfigured = isAiConfigured();
  const modelHint = aiConfigured
    ? `Сейчас модель недоступна — подождите ~10 сек и повторите. Модель: **${getAiRuntimeConfig()?.model ?? getWorkspaceAiConfig().model ?? "?"}**.`
    : `Добавьте **${getAiSetupHint()}**.`;

  const clientMatches = findClientLines(context.clientsText, message);
  if (
    clientMatches.length > 0 &&
    (lower.includes("букинг") ||
      lower.includes("адрес") ||
      lower.includes("клиент"))
  ) {
    const summary = clientMatches
      .map((block) => summarizeClientMatch(block))
      .join("\n\n");
    return `${aiConfigured ? "Пока AI недоступен — кратко по таблице:\n\n" : ""}${summary}\n\n${modelHint}`;
  }

  if (lower.includes("сколько") && lower.includes("клиент")) {
    return `В таблице «Клиенты» сейчас **${context.meta.clientsTotal}** записей.\n\n${modelHint}`;
  }

  if (lower.includes("анкет") || lower.includes("formgrid")) {
    return `В анкетах Formgrid **${context.meta.formgridRows}** строк. Откройте раздел «Эмиграция» или уточните, какую анкету разобрать.\n\n${modelHint}`;
  }

  if (
    lower.includes("статус") &&
    (lower.includes("emigrant") || lower.includes("кабинет") || lower.includes("дело"))
  ) {
    return `В Emigrant Croatia Desk сейчас **${context.meta.emigrantDeskTotal}** клиентов со статусами дел. Уточните имя клиента.\n\n${modelHint}`;
  }

  return `Контекст собран (Клиенты: ${context.meta.clientsTotal}, Emigrant Desk: ${context.meta.emigrantDeskTotal}, Formgrid: ${context.meta.formgridRows}), но ответ от AI не получен.\n\n${modelHint}`;
}
