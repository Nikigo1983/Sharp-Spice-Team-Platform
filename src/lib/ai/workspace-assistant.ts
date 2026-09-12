import { streamTask } from "@/lib/ai/stream-task";
import { AiCompletionError } from "@/lib/ai/errors";
import { throwIfAiAborted } from "@/lib/ai/request-scope";
import {
  AUTHORITATIVE_EVIDENCE_BANNER,
  buildAttributionLabels,
  buildHistoryPrecedenceNote,
  formatClientProvenanceBlock,
  applyPostAnswerGroundingGuards,
} from "@/lib/ai/answer-grounding";
import { getAiRuntimeConfig } from "@/lib/ai/config";
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
  clientFactSurnameMatches,
  crmPartFromResolved,
  detectRequestedClientFactField,
  extractClientNameHintFromFactQuery,
  formatStructuredClientFactReply,
  readClientFactFromClientRecord,
  readClientFactFromCrmContext,
} from "@/lib/ai/client-fact-lookup";
import {
  getWorkspaceAiConfig,
  shouldEnterWorkspaceAgentPath,
  type WorkspaceAgentActor,
  type WorkspaceResponseMode,
} from "@/lib/ai/workspace-config";
import {
  buildWorkspaceAgentMessages,
  incrementWorkspaceToolMetric,
  runWorkspaceAgentToolLoop,
  type AgentToolStatusEvent,
} from "@/lib/ai/workspace-tools/index";
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
  analyzeClientSearchIntent,
  formatClientSearchIntentForAi,
  resolveClientSearchIntentType,
  shouldOfferClientSelection,
  type ClientSearchIntent,
} from "@/lib/ai/client-search-intent";
import {
  buildClientListFilterLabel,
  formatStructuredClientListReply,
  isClientListContinuationQuery,
  LIST_QUERY_FULL_RETURN_LIMIT,
  resolveTextFallbackListContinuation,
  sanitizeClientListContinuation,
  type ClientListContinuationState,
} from "@/lib/ai/client-list-reply";
import {
  formatConversationSummaryForPrompt,
  selectRecentHistoryTurns,
  sanitizeConversationSummary,
} from "@/lib/ai/workspace-conversation-memory";
import {
  buildDocFillPack,
  buildDocFillPromptAddon,
  formatDocFillAskClientReply,
  formatDocFillReply,
  isDocFillIntent,
} from "@/lib/ai/workspace-doc-fill";
import {
  buildQuestionnaireAnswerPromptAddon,
  isQuestionnaireAnswerIntent,
  WORKSPACE_QUESTIONNAIRE_MAX_TOKENS,
} from "@/lib/ai/workspace-questionnaire-answers";
import {
  caseMemoryHasFacts,
  formatCaseMemoryForPrompt,
  sanitizeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import {
  searchWebForWorkspace,
  shouldUseInternetSearch,
  type WorkspaceWebSearchResult,
} from "@/lib/ai/workspace-web-search";
import { maybeRefreshWorkspaceConversationMemory } from "@/lib/ai/workspace-conversation-summary";
import { getWorkspaceChatMemory } from "@/lib/ai/workspace-chat-memory-store";
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
import { executeStructuredClientSearch } from "@/lib/ai/structured-client-search";
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
  /** Optional structured list pagination meta (not shown in UI text). */
  clientListContinuation?: ClientListContinuationState | null;
};

export type WorkspaceAiResult = {
  reply: string;
  sources: string[];
  demo: boolean;
  requestId: string;
  pendingClientCandidates?: ClientContext[];
  needsClientSelection?: boolean;
  clientListContinuation?: ClientListContinuationState | null;
  conversationSummary?: string | null;
  summaryThroughMessageCount?: number;
  caseMemory?: WorkspaceCaseMemory | null;
};

/** Server-side identity for conversation memory + internal agent eligibility. */
export type WorkspaceMemoryContext = {
  userId: string;
  chatId: string | null;
  email?: string;
  role?: WorkspaceAgentActor["role"];
};

function actorFromMemoryContext(
  memoryContext: WorkspaceMemoryContext | null,
): WorkspaceAgentActor | null {
  if (!memoryContext?.userId || !memoryContext.email || !memoryContext.role) {
    return null;
  }
  return {
    id: memoryContext.userId,
    userId: memoryContext.userId,
    email: memoryContext.email,
    role: memoryContext.role,
  };
}

export type WorkspaceAiStreamMeta = {
  sources: string[];
  demo: boolean;
  requestId: string;
  pendingClientCandidates?: ClientContext[];
  needsClientSelection?: boolean;
  clientListContinuation?: ClientListContinuationState | null;
  conversationSummary?: string | null;
  summaryThroughMessageCount?: number;
  caseMemory?: WorkspaceCaseMemory | null;
};

export type WorkspaceAiStreamStatus = {
  status:
    | "context"
    | "generating"
    | "tool_started"
    | "tool_completed"
    | "tool_failed";
  tool?: string;
  label?: string;
  ok?: boolean;
  errorCode?: string | null;
  resultCount?: number | null;
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
    internetLabel?: string | null;
  },
): string[] {
  const labels = buildAttributionLabels({
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
  if (options?.internetLabel) {
    labels.push(options.internetLabel);
  }
  return labels;
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
  webSearchText: string | null = null,
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
  if (webSearchText) {
    contextParts.push(webSearchText);
  }
  return contextParts.join("\n\n");
}

function buildChatMessages(
  trimmed: string,
  contextBlock: string,
  history: WorkspaceChatTurn[],
  mode: WorkspaceResponseMode,
  conversationSummary: string | null = null,
  caseMemory: WorkspaceCaseMemory | null = null,
): ChatMessage[] {
  const historyMessages: ChatMessage[] = selectRecentHistoryTurns(history).map(
    (turn) => ({
      role: turn.role,
      content: turn.content,
    }),
  );

  const summaryBlock = formatConversationSummaryForPrompt(conversationSummary);
  const caseBlock = formatCaseMemoryForPrompt(caseMemory);
  const memoryBlocks = [caseBlock, summaryBlock].filter(Boolean).join("\n\n");
  const contextWithMemory = memoryBlocks
    ? `${memoryBlocks}\n\n${contextBlock}`
    : contextBlock;

  const hasAuthoritative =
    /\[SOURCE:|CLIENT CONTEXT|KNOWLEDGE BASE|ЭМИГРАНТ|FORMGRID|EMIGRANT CROATIA DESK|СВОДКА ДИАЛОГА|ПАМЯТЬ КЕЙСА|ИНТЕРНЕТ/i.test(
      contextWithMemory,
    );

  const clientNote = contextWithMemory.includes("CLIENT CONTEXT")
    ? "\n\nДля данных о клиенте используй CLIENT CONTEXT / [SOURCE:CLIENT:…]. У каждого поля указан источник — в ответе кратко поясни «таблица «Клиенты»», «анкета Formgrid» и т.д., не пиши «CRM» и не выводи сырой блок."
    : "";
  const emigrantNote = contextWithMemory.includes("ЭМИГРАНТ (документы клиентов)") ||
    contextWithMemory.includes('kind="emigrant_drive"')
    ? "\n\nДля запросов про папку ЭМИГРАНТ используй блоки [SOURCE:DRIVE:…]. Отсутствие в таблицах Клиенты не означает отсутствие в Drive. Файл не извлечён ≠ документ отсутствует у клиента."
    : "";
  const candidatesNote = contextWithMemory.includes("CLIENT CANDIDATES")
    ? "\n\nЕсли в CLIENT CANDIDATES есть варианты — объясни различия и помоги выбрать. При fuzzy-поиске начни с «Точного совпадения не найдено. Возможно, вы имели в виду…». При структурированном поиске — кратко резюмируй список и выдели самых релевантных. Не отвечай сухим «клиент не найден», если кандидаты есть."
    : "";
  const structuredNote = contextWithMemory.includes("CLIENT SEARCH INTENT")
    ? "\n\nПоиск выполнен по распознанным фильтрам (CLIENT SEARCH INTENT). Отвечай по найденным CLIENT CONTEXT / CLIENT CANDIDATES."
    : "";
  const listNote = contextWithMemory.includes("тип запроса: list")
    ? "\n\nЭто списочный запрос: начни с «Найдено N клиентов…», перечисли клиентов нумерованным списком (имя — статус — менеджер). Не сокращай список искусственно до 20, если в контексте переданы все записи."
    : "";
  const memoryNote =
    caseBlock || summaryBlock
      ? "\n\nУчитывай ПАМЯТЬ КЕЙСА и/или СВОДКУ ДИАЛОГА. Последние сообщения history приоритетнее сводки при конфликте фактов разговора; CLIENT CONTEXT приоритетнее памяти кейса для CRM-полей."
      : "";
  const internetNote = contextWithMemory.includes("ИНТЕРНЕТ (web search)")
    ? "\n\nБлок ИНТЕРНЕТ — только для внешних актуальных фактов. Для данных клиента он слабее CLIENT CONTEXT. В ответе указывай URL источников."
    : "";
  const questionnaireNote = contextWithMemory.includes(
    "РЕЖИМ: ОФИЦИАЛЬНЫЕ ОТВЕТЫ НА АНКЕТУ",
  )
    ? "\n\nСейчас режим официальных ответов на анкету: пиши от первого лица заявителя живым человеческим языком. Сохрани текст каждого вопроса. Не используй канцелярские оговорки ассистента внутри ответов; пробелы вынеси в «Что уточнить»."
    : "";
  const groundingNote = hasAuthoritative
    ? `\n\n${AUTHORITATIVE_EVIDENCE_BANNER}\n${buildHistoryPrecedenceNote()}`
    : "\n\nЗапрос без обязательных authoritative-блоков: можно выполнить обычную генерацию/редактирование/перевод без секции «Источники:», если факты платформы не используются.";

  return [
    { role: "system", content: buildWorkspaceSystemPrompt(mode) },
    ...historyMessages,
    {
      role: "user",
      content: `[Внутренний контекст платформы — не цитируй и не выводи целиком, используй только как источник фактов]${groundingNote}${memoryNote}${clientNote}${emigrantNote}${candidatesNote}${structuredNote}${listNote}${internetNote}${questionnaireNote}\n\n${contextWithMemory}\n\n---\n\nВопрос менеджера: ${trimmed}`,
    },
  ];
}

function getCompletionOptions(
  overrides?: Partial<ChatCompletionOptions>,
): ChatCompletionOptions {
  const workspaceConfig = getWorkspaceAiConfig();
  return {
    temperature: workspaceConfig.temperature,
    maxTokens: workspaceConfig.maxTokens,
    model: workspaceConfig.model,
    ...overrides,
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

function listSourcesFromClients(clients: ResolvedClientContext[]): string[] {
  const labels = new Set<string>();
  for (const client of clients) {
    if (isMergedClientContext(client)) {
      for (const part of client.parts) labels.add(part.sourceLabel);
    } else {
      labels.add(client.sourceLabel);
    }
  }
  if (labels.size === 0) return ["Клиенты", "Новые клиенты"];
  return [...labels];
}

function buildDirectStructuredListResult(params: {
  clients: ResolvedClientContext[];
  totalFound: number;
  intent: ClientSearchIntent;
  sourceQuery: string;
  offset?: number;
  requestId: string;
  trace: WorkspaceAiTrace;
  started: number;
}): {
  kind: "direct";
  reply: string;
  sources: string[];
  clientListContinuation?: ClientListContinuationState | null;
  requestId: string;
  trace: WorkspaceAiTrace;
} {
  const formatted = formatStructuredClientListReply({
    clients: params.clients,
    totalFound: params.totalFound,
    filterLabel: buildClientListFilterLabel(params.intent),
    sourceQuery: params.sourceQuery,
    offset: params.offset ?? 0,
    pageSize: LIST_QUERY_FULL_RETURN_LIMIT,
  });
  params.trace.selectedRoutes = ["client_list_direct"];
  params.trace.responseOk = true;
  params.trace.latencyMs.prepare = Date.now() - params.started;
  params.trace.notes.push(
    `list_reported=${formatted.reportedCount};list_rendered=${formatted.renderedCount}`,
  );
  logWorkspaceAiTrace(params.trace);
  return {
    kind: "direct",
    reply: redactSensitiveText(formatted.reply),
    sources: listSourcesFromClients(params.clients),
    clientListContinuation: formatted.continuation,
    requestId: params.requestId,
    trace: params.trace,
  };
}

async function prepareWorkspaceRequest(
  userMessage: string,
  history: WorkspaceChatTurn[],
  mode: WorkspaceResponseMode,
  pendingClientCandidates: ClientContext[] | null = null,
  requestId: string = createAiRequestId(),
  clientListContinuation: ClientListContinuationState | null = null,
  conversationSummary: string | null = null,
  caseMemory: WorkspaceCaseMemory | null = null,
  forceLegacy = false,
  actor: WorkspaceAgentActor | null = null,
): Promise<
  | { kind: "empty"; requestId: string; trace: WorkspaceAiTrace }
  | {
      kind: "direct";
      reply: string;
      sources: string[];
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
      clientListContinuation?: ClientListContinuationState | null;
      requestId: string;
      trace: WorkspaceAiTrace;
      groundingBlocked?: boolean;
    }
  | {
      kind: "agent";
      trimmed: string;
      mode: WorkspaceResponseMode;
      history: WorkspaceChatTurn[];
      conversationSummary: string | null;
      caseMemory: WorkspaceCaseMemory | null;
      clientContext: ResolvedClientContext | null;
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
      requestId: string;
      trace: WorkspaceAiTrace;
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
      maxTokens?: number;
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
  let listAiSearch: Awaited<ReturnType<typeof lookupClientsWithAiSearch>> | null =
    null;

  if (!followUp && isClientListContinuationQuery(trimmed)) {
    const structuredContinuation = sanitizeClientListContinuation(
      clientListContinuation,
    );
    const textFallback = structuredContinuation
      ? null
      : resolveTextFallbackListContinuation(history, trimmed);
    const prior =
      structuredContinuation?.sourceQuery ?? textFallback?.sourceQuery ?? null;
    const offset =
      structuredContinuation?.offset ?? textFallback?.offset ?? null;
    if (prior && offset !== null) {
      const listIntent = await analyzeClientSearchIntent(prior);
      if (resolveClientSearchIntentType(listIntent, prior) === "list") {
        const structured = await executeStructuredClientSearch(
          { ...listIntent, isListQuery: true },
          prior,
          offset + LIST_QUERY_FULL_RETURN_LIMIT,
        );
        return buildDirectStructuredListResult({
          clients: structured.clients,
          totalFound: structured.totalFound,
          intent: listIntent,
          sourceQuery: prior,
          offset,
          requestId,
          trace,
          started,
        });
      }
    }
  }

  if (followUp) {
    clientContext = followUpToClientContext(followUp);
  } else if (
    intent.needsClients ||
    intent.needsFormgrid ||
    intent.needsEmigrantDrive ||
    intent.fastClientLookup ||
    isDocFillIntent(trimmed)
  ) {
    try {
      const aiSearch = await lookupClientsWithAiSearch(trimmed);
      listAiSearch = aiSearch;
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

  if (
    listAiSearch &&
    listAiSearch.intentType === "list" &&
    listAiSearch.usedStructuredSearch
  ) {
    const lookup = listAiSearch.lookup;
    const clients =
      lookup.kind === "multiple"
        ? lookup.clients
        : lookup.kind === "single"
          ? [lookup.client]
          : [];
    return buildDirectStructuredListResult({
      clients,
      totalFound: listAiSearch.foundClients,
      intent: listAiSearch.intent,
      sourceQuery: trimmed,
      offset: 0,
      requestId,
      trace,
      started,
    });
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

  if (
    isDocFillIntent(trimmed) &&
    !isQuestionnaireAnswerIntent(trimmed) &&
    !needsClientSelection
  ) {
    if (clientContext || caseMemoryHasFacts(caseMemory)) {
      const pack = buildDocFillPack({
        query: trimmed,
        client: clientContext,
        caseMemory,
      });
      if (clientContext || pack.filledCount > 0) {
        const sources = [
          ...(clientContext
            ? [
                isMergedClientContext(clientContext)
                  ? "Клиенты + Formgrid"
                  : clientContext.sourceLabel,
              ]
            : []),
          ...(caseMemoryHasFacts(caseMemory) ? ["Память кейса"] : []),
        ];
        trace.selectedRoutes = ["doc_fill_direct"];
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: formatDocFillReply(pack),
          sources,
          requestId,
          trace,
        };
      }
    }
    if (!clientContext && !clientCandidates?.length) {
      trace.selectedRoutes = ["doc_fill_need_client"];
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return {
        kind: "direct",
        reply: formatDocFillAskClientReply(),
        sources: [],
        requestId,
        trace,
      };
    }
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

  // Phase 1 agent path: after deterministic directs only. Default flag = off.
  // Requires mode=internal (staff) or mode=on. Shadow is non-executing.
  if (!forceLegacy && !isQuestionnaireAnswerIntent(trimmed)) {
    const cfg = getWorkspaceAiConfig();
    if (
      shouldEnterWorkspaceAgentPath({
        mode: cfg.agentToolsMode,
        actor,
        forceLegacy,
      })
    ) {
      incrementWorkspaceToolMetric("agent_path_entered");
      trace.agentMode = true;
      trace.selectedRoutes = ["agent_tools"];
      trace.latencyMs.prepare = Date.now() - started;
      return {
        kind: "agent",
        trimmed,
        mode,
        history,
        conversationSummary,
        caseMemory,
        clientContext,
        pendingClientCandidates: pendingCandidatesForTransport(pendingForUi),
        needsClientSelection,
        requestId,
        trace,
      };
    }
    if (cfg.agentToolsMode === "internal") {
      incrementWorkspaceToolMetric("agent_path_skipped_ineligible");
      trace.notes.push("agent_path_skipped_ineligible");
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

  let webSearch: WorkspaceWebSearchResult | null = null;
  const needsInternet =
    intent.needsInternet || shouldUseInternetSearch(trimmed);
  if (needsInternet) {
    try {
      webSearch = await searchWebForWorkspace(trimmed);
      if (webSearch.ok) {
        trace.notes.push(`web_search:${webSearch.provider};hits=${webSearch.hits.length}`);
      } else {
        trace.notes.push(
          `web_search_skip:${webSearch.provider};${webSearch.error ?? "none"}`,
        );
      }
    } catch (error) {
      console.error(`[workspace-ai][${requestId}] web search failed`, error);
      trace.notes.push("web_search_error");
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
    internetLabel:
      webSearch && (webSearch.ok || webSearch.text)
        ? webSearch.ok
          ? `Интернет — ${webSearch.provider} (${webSearch.hits.length})`
          : "Интернет — недоступен"
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
    webSearch?.text ?? null,
  );

  const questionnaireMode = isQuestionnaireAnswerIntent(trimmed);
  const effectiveMode: WorkspaceResponseMode = questionnaireMode
    ? "detailed"
    : mode;

  const fillAwareContextBlock = questionnaireMode
    ? [buildQuestionnaireAnswerPromptAddon(trimmed), contextBlock]
        .filter(Boolean)
        .join("\n\n")
    : isDocFillIntent(trimmed)
      ? [
          buildDocFillPromptAddon(
            clientContext || caseMemoryHasFacts(caseMemory)
              ? buildDocFillPack({
                  query: trimmed,
                  client: clientContext,
                  caseMemory,
                })
              : null,
          ),
          contextBlock,
        ]
          .filter(Boolean)
          .join("\n\n")
      : contextBlock;

  if (questionnaireMode) {
    trace.notes.push("questionnaire_answers_mode");
    trace.selectedRoutes = [
      ...(trace.selectedRoutes ?? []),
      "questionnaire_answers",
    ];
  }

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
  trace.contextCharsEstimate = estimateChars(fillAwareContextBlock);
  trace.latencyMs.prepare = Date.now() - started;

  const messages = buildChatMessages(
    trimmed,
    fillAwareContextBlock,
    history,
    effectiveMode,
    conversationSummary,
    caseMemory,
  );

  return {
    kind: "ai",
    messages,
    sources,
    context,
    contextBlock: fillAwareContextBlock,
    trimmed,
    clientContext,
    pendingClientCandidates: pendingCandidatesForTransport(pendingForUi),
    needsClientSelection,
    requestId,
    trace,
    maxTokens: questionnaireMode
      ? Math.max(
          getWorkspaceAiConfig().maxTokens,
          WORKSPACE_QUESTIONNAIRE_MAX_TOKENS,
        )
      : undefined,
  };
}

async function attachRefreshedConversationMemory(params: {
  userId?: string | null;
  chatId?: string | null;
  history: WorkspaceChatTurn[];
  userMessage: string;
  assistantReply: string;
  clientSnapshot?: {
    id?: string | null;
    name?: string | null;
    citizenship?: string | null;
    passportNumber?: string | null;
    country?: string | null;
    direction?: string | null;
    bookingAddress?: string | null;
    bookingRange?: string | null;
    submittedAt?: string | null;
    approvalAt?: string | null;
    notes?: string | null;
  } | null;
}): Promise<{
  conversationSummary?: string | null;
  summaryThroughMessageCount?: number;
  caseMemory?: WorkspaceCaseMemory | null;
}> {
  throwIfAiAborted();
  const userId = params.userId?.trim();
  const chatId = params.chatId?.trim();
  if (!userId || !chatId || !params.assistantReply.trim()) return {};

  const turns = [
    ...params.history,
    { role: "user" as const, content: params.userMessage },
    { role: "assistant" as const, content: params.assistantReply },
  ];

  const refreshed = await maybeRefreshWorkspaceConversationMemory({
    userId,
    chatId,
    turns,
    clientSnapshot: params.clientSnapshot ?? null,
  });
  if (refreshed) {
    return {
      conversationSummary: refreshed.conversationSummary,
      summaryThroughMessageCount: refreshed.summaryThroughMessageCount,
      caseMemory: refreshed.caseMemory,
    };
  }

  const current = await getWorkspaceChatMemory(userId, chatId);
  if (!current.conversationSummary && !current.caseMemory) return {};
  return {
    conversationSummary: current.conversationSummary,
    summaryThroughMessageCount: current.summaryThroughMessageCount,
    caseMemory: current.caseMemory,
  };
}

function clientSnapshotFromResolved(
  client: ResolvedClientContext | null | undefined,
) {
  if (!client) return null;
  const debugRows = isMergedClientContext(client)
    ? client.parts.flatMap((part) => Object.entries(part.debugRow))
    : Object.entries(client.debugRow);

  const pick = (...patterns: RegExp[]) => {
    for (const [key, value] of debugRows) {
      if (!value?.trim()) continue;
      if (patterns.some((pattern) => pattern.test(key))) return value.trim();
    }
    return null;
  };

  return {
    id:
      client.source === "merged"
        ? `merged:${client.rowIndex}`
        : `${client.source}:${client.rowIndex}`,
    name: client.name ?? null,
    citizenship: pick(/гражданств|citizenship|латиниц/i),
    passportNumber: pick(/паспорт|passport/i),
    country: client.country ?? null,
    direction: client.direction ?? null,
    bookingAddress: pick(/адрес\s*букинг|booking.*address/i),
    bookingRange: pick(/дата\s*букинг|booking.*date|booking.*range/i),
    submittedAt: pick(/дата\s*подач|submitted/i),
    approvalAt: pick(/одобрен|approval/i),
    notes: pick(/^заметк|notes$/i),
  };
}

async function executeAgentPrepared(params: {
  prepared: {
    kind: "agent";
    trimmed: string;
    mode: WorkspaceResponseMode;
    history: WorkspaceChatTurn[];
    conversationSummary: string | null;
    caseMemory: WorkspaceCaseMemory | null;
    clientContext: ResolvedClientContext | null;
    pendingClientCandidates?: ClientContext[];
    needsClientSelection?: boolean;
    requestId: string;
    trace: WorkspaceAiTrace;
  };
  memoryContext: WorkspaceMemoryContext | null;
  userMessage: string;
  history: WorkspaceChatTurn[];
  stream: boolean;
  onStatus?: (event: AgentToolStatusEvent) => void | Promise<void>;
  onFinalDelta?: (delta: string) => void | Promise<void>;
}): Promise<{
  result: WorkspaceAiResult;
  statusEvents: AgentToolStatusEvent[];
} | null> {
  const { prepared } = params;
  const recent = selectRecentHistoryTurns(prepared.history).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const activeClientId =
    prepared.clientContext && !isMergedClientContext(prepared.clientContext)
      ? prepared.clientContext.debugRow?.id?.trim() || null
      : prepared.clientContext && isMergedClientContext(prepared.clientContext)
        ? prepared.clientContext.parts.find((p) => p.source === "clients")
            ?.debugRow?.id?.trim() || null
        : null;

  const messages = buildWorkspaceAgentMessages({
    userMessage: prepared.trimmed,
    history: recent,
    baseSystemPrompt: buildWorkspaceSystemPrompt(prepared.mode),
    conversationSummary: prepared.conversationSummary,
    activeClientId,
  });

  if (caseMemoryHasFacts(prepared.caseMemory)) {
    messages.splice(1, 0, {
      role: "system",
      content: formatCaseMemoryForPrompt(prepared.caseMemory!),
    });
  }

  const toolContext = {
    requestId: prepared.requestId,
    userId: params.memoryContext?.userId ?? "anonymous",
    chatId: params.memoryContext?.chatId ?? null,
    activeClientId,
  };

  prepared.trace.agentMode = true;
  prepared.trace.astraCalled = true;

  try {
    const loop = await runWorkspaceAgentToolLoop({
      messages,
      context: toolContext,
      completionOptions: getCompletionOptions(),
      streamFinalAnswer: params.stream,
      onStatus: params.onStatus,
      onFinalDelta: params.onFinalDelta,
    });

    prepared.trace.astraRounds = loop.astraRounds;
    prepared.trace.toolCallCount = loop.toolCalls.length;
    prepared.trace.toolCalls = loop.toolCalls;
    prepared.trace.loopStopReason = loop.stopReason;
    prepared.trace.totalToolChars = loop.totalToolChars;
    prepared.trace.finalSourceSet = loop.finalSourceSet;
    if (loop.lastCompletion) {
      prepared.trace.requestedModel = loop.lastCompletion.requestedModel;
      prepared.trace.returnedModel = loop.lastCompletion.returnedModel;
      prepared.trace.usageInputTokens = loop.lastCompletion.usage.inputTokens;
      prepared.trace.usageOutputTokens = loop.lastCompletion.usage.outputTokens;
      prepared.trace.latencyMs.model = loop.lastCompletion.latencyMs;
      prepared.trace.openRouterOk = loop.lastCompletion.ok;
    }

    if (loop.stopReason !== "final_answer" || !loop.answer) {
      throw new AiCompletionError(loop.lastCompletion?.error || (loop.stopReason === "timeout" ? "AI_TIMEOUT" : "MODEL_STREAM_INTERRUPTED"));
    }

    const guarded = applyPostAnswerGroundingGuards({
      answer: loop.answer,
      contextBlock: "",
      query: prepared.trimmed,
    });
    for (const note of guarded.notes) {
      prepared.trace.notes.push(note);
    }
    prepared.trace.responseOk = true;
    logWorkspaceAiTrace(prepared.trace);

    const memory = await attachRefreshedConversationMemory({
      userId: params.memoryContext?.userId,
      chatId: params.memoryContext?.chatId,
      history: params.history,
      userMessage: params.userMessage,
      assistantReply: guarded.answer,
      clientSnapshot: clientSnapshotFromResolved(prepared.clientContext),
    });

    const sources =
      loop.finalSourceSet.length > 0
        ? loop.finalSourceSet.map((tag) =>
            tag === "KB" ? "Knowledge Base" : "Клиенты",
          )
        : ["Агент"];

    return {
      result: {
        reply: guarded.answer,
        sources,
        demo: false,
        requestId: prepared.requestId,
        pendingClientCandidates: prepared.pendingClientCandidates,
        needsClientSelection: prepared.needsClientSelection,
        ...memory,
      },
      statusEvents: loop.statusEvents,
    };
  } catch (error) {
    console.error(
      `[workspace-ai][${prepared.requestId}] agent loop failed`,
      error,
    );
    prepared.trace.notes.push("agent_loop_error");
    prepared.trace.fallbackActivated = true;
    logWorkspaceAiTrace(prepared.trace);
    throw error;
  }
}

export async function runWorkspaceAi(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
  pendingClientCandidates: ClientContext[] | null = null,
  requestId: string = createAiRequestId(),
  clientListContinuation: ClientListContinuationState | null = null,
  conversationSummary: string | null = null,
  memoryContext: WorkspaceMemoryContext | null = null,
  caseMemory: WorkspaceCaseMemory | null = null,
): Promise<WorkspaceAiResult> {
  const totalStarted = Date.now();
  const actor = actorFromMemoryContext(memoryContext);
  const prepared = await prepareWorkspaceRequest(
    userMessage,
    history,
    mode,
    pendingClientCandidates,
    requestId,
    clientListContinuation,
    sanitizeConversationSummary(conversationSummary),
    sanitizeCaseMemory(caseMemory),
    false,
    actor,
  );

  throwIfAiAborted();
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
    const memory = await attachRefreshedConversationMemory({
      userId: memoryContext?.userId,
      chatId: memoryContext?.chatId,
      history,
      userMessage,
      assistantReply: prepared.reply,
    });
    return {
      reply: prepared.reply,
      sources: prepared.sources,
      demo: false,
      requestId: prepared.requestId,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
      clientListContinuation: prepared.clientListContinuation ?? null,
      ...memory,
    };
  }

  if (prepared.kind === "agent") {
    const agentResult = await executeAgentPrepared({
      prepared,
      memoryContext,
      userMessage,
      history,
      stream: false,
    });
    if (agentResult) return agentResult.result;

    // Shadow / failure: fall back to legacy fixed-context path.
    const legacy = await prepareWorkspaceRequest(
      userMessage,
      history,
      mode,
      pendingClientCandidates,
      requestId,
      clientListContinuation,
      sanitizeConversationSummary(conversationSummary),
      sanitizeCaseMemory(caseMemory),
      true,
      actor,
    );
    if (legacy.kind === "ai") {
      legacy.trace.notes.push("agent_fallback_legacy");
      legacy.trace.fallbackActivated = true;
      const completion = await createChatCompletionResult(
        legacy.messages,
        getCompletionOptions(
          legacy.maxTokens ? { maxTokens: legacy.maxTokens } : undefined,
        ),
      );
      legacy.trace.requestedModel = completion.requestedModel;
      legacy.trace.returnedModel = completion.returnedModel;
      legacy.trace.usageInputTokens = completion.usage.inputTokens;
      legacy.trace.usageOutputTokens = completion.usage.outputTokens;
      legacy.trace.latencyMs.model = completion.latencyMs;
      legacy.trace.openRouterOk = completion.ok;
      legacy.trace.astraCalled = true;
      legacy.trace.latencyMs.total = Date.now() - totalStarted;
      if (!completion.ok) throw new AiCompletionError(completion.error);
      if (completion.content) {
        const guarded = applyPostAnswerGroundingGuards({
          answer: completion.content,
          contextBlock: legacy.contextBlock,
          query: legacy.trimmed,
        });
        legacy.trace.responseOk = true;
        logWorkspaceAiTrace(legacy.trace);
        const memory = await attachRefreshedConversationMemory({
          userId: memoryContext?.userId,
          chatId: memoryContext?.chatId,
          history,
          userMessage,
          assistantReply: guarded.answer,
          clientSnapshot: clientSnapshotFromResolved(legacy.clientContext),
        });
        return {
          reply: guarded.answer,
          sources: legacy.sources,
          demo: false,
          requestId: legacy.requestId,
          pendingClientCandidates: legacy.pendingClientCandidates,
          needsClientSelection: legacy.needsClientSelection,
          ...memory,
        };
      }
    }
    return {
      reply:
        "Не удалось получить ответ агента. Повторите запрос или отключите AI_WORKSPACE_AGENT_TOOLS.",
      sources: [],
      demo: false,
      requestId: prepared.requestId,
    };
  }

  const completion = await createChatCompletionResult(
    prepared.messages,
    getCompletionOptions(
      prepared.maxTokens ? { maxTokens: prepared.maxTokens } : undefined,
    ),
  );
  prepared.trace.requestedModel = completion.requestedModel;
  prepared.trace.returnedModel = completion.returnedModel;
  prepared.trace.usageInputTokens = completion.usage.inputTokens;
  prepared.trace.usageOutputTokens = completion.usage.outputTokens;
  prepared.trace.latencyMs.model = completion.latencyMs;
  prepared.trace.openRouterOk = completion.ok;
  prepared.trace.astraCalled = true;
  prepared.trace.latencyMs.total = Date.now() - totalStarted;

  if (completion.ok && completion.content) {
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
    const memory = await attachRefreshedConversationMemory({
      userId: memoryContext?.userId,
      chatId: memoryContext?.chatId,
      history,
      userMessage,
      assistantReply: guarded.answer,
      clientSnapshot: clientSnapshotFromResolved(prepared.clientContext),
    });
    return {
      reply: guarded.answer,
      sources: prepared.sources,
      demo: false,
      requestId: prepared.requestId,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
      ...memory,
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

  throw new AiCompletionError(completion.error);
}

export async function* runWorkspaceAiStream(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
  pendingClientCandidates: ClientContext[] | null = null,
  requestId: string = createAiRequestId(),
  clientListContinuation: ClientListContinuationState | null = null,
  conversationSummary: string | null = null,
  memoryContext: WorkspaceMemoryContext | null = null,
  caseMemory: WorkspaceCaseMemory | null = null,
): AsyncGenerator<string | WorkspaceAiStreamMeta | WorkspaceAiStreamStatus> {
  const totalStarted = Date.now();
  yield { status: "context" };

  const actor = actorFromMemoryContext(memoryContext);
  const prepared = await prepareWorkspaceRequest(
    userMessage,
    history,
    mode,
    pendingClientCandidates,
    requestId,
    clientListContinuation,
    sanitizeConversationSummary(conversationSummary),
    sanitizeCaseMemory(caseMemory),
    false,
    actor,
  );

  throwIfAiAborted();
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
    const memory = await attachRefreshedConversationMemory({
      userId: memoryContext?.userId,
      chatId: memoryContext?.chatId,
      history,
      userMessage,
      assistantReply: prepared.reply,
    });
    yield {
      sources: prepared.sources,
      demo: false,
      requestId: prepared.requestId,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
      clientListContinuation: prepared.clientListContinuation ?? null,
      ...memory,
    };
    yield prepared.reply;
    return;
  }

  if (prepared.kind === "agent") {
    yield { status: "generating" };

    let agentOutcome: Awaited<ReturnType<typeof executeAgentPrepared>> = null;
    for await (const item of streamTask<
      Awaited<ReturnType<typeof executeAgentPrepared>>,
      AgentToolStatusEvent
    >(emit => executeAgentPrepared({
      prepared, memoryContext, userMessage, history, stream: true,
      onStatus: emit,
    }))) {
      if ("result" in item) { agentOutcome = item.result; continue; }
      const event = item.event;
      if (event.type === "tool_started") {
        yield { status: "tool_started", tool: event.tool, label: event.label };
      } else if (event.type === "tool_completed") {
        yield { status: "tool_completed", tool: event.tool, ok: event.ok, resultCount: event.resultCount };
      } else {
        yield { status: "tool_failed", tool: event.tool, errorCode: event.errorCode };
      }
    }
    if (agentOutcome) {
      const agentResult = agentOutcome.result;
      yield {
        sources: agentResult.sources,
        demo: false,
        requestId: agentResult.requestId,
        pendingClientCandidates: agentResult.pendingClientCandidates,
        needsClientSelection: agentResult.needsClientSelection,
        conversationSummary: agentResult.conversationSummary,
        summaryThroughMessageCount: agentResult.summaryThroughMessageCount,
        caseMemory: agentResult.caseMemory,
      };
      // Expose the guarded final answer, never intermediate tool-round text.
      yield agentResult.reply;
      return;
    }

    // Shadow fallback to legacy stream path
    const legacy = await prepareWorkspaceRequest(
      userMessage,
      history,
      mode,
      pendingClientCandidates,
      requestId,
      clientListContinuation,
      sanitizeConversationSummary(conversationSummary),
      sanitizeCaseMemory(caseMemory),
      true,
      actor,
    );
    if (legacy.kind !== "ai") {
      yield {
        sources: [],
        demo: false,
        requestId: prepared.requestId,
      };
      yield "Не удалось получить ответ агента.";
      return;
    }
    yield {
      sources: legacy.sources,
      demo: false,
      requestId: legacy.requestId,
      pendingClientCandidates: legacy.pendingClientCandidates,
      needsClientSelection: legacy.needsClientSelection,
    };
    yield { status: "generating" };
    let streamed = "";
    for await (const event of streamChatCompletionResult(
      legacy.messages,
      getCompletionOptions(
        legacy.maxTokens ? { maxTokens: legacy.maxTokens } : undefined,
      ),
    )) {
      if (event.type === "delta") {
        streamed += event.content;
        yield event.content;
        continue;
      }
      if (!event.result.ok) throw new AiCompletionError(event.result.error);
      legacy.trace.notes.push("agent_fallback_legacy_stream");
      legacy.trace.astraCalled = true;
      legacy.trace.openRouterOk = event.result.ok;
      legacy.trace.responseOk = event.result.ok;
      logWorkspaceAiTrace(legacy.trace);
    }
    if (!streamed.trim()) {
      throw new AiCompletionError("MODEL_EMPTY_RESPONSE");
    }
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
  let streamed = "";
  let hasContent = false;
  for await (const event of streamChatCompletionResult(
    prepared.messages,
    getCompletionOptions(
      prepared.maxTokens ? { maxTokens: prepared.maxTokens } : undefined,
    ),
  )) {
    if (event.type === "delta") {
      hasContent = true;
      if (mayNeedGroundingGuard) {
        buffered += event.content;
      } else {
        streamed += event.content;
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
      prepared.trace.notes.push(event.result.error ?? "AI_REQUEST_FAILED");
      prepared.trace.responseOk = false;
      logWorkspaceAiTrace(prepared.trace);
      throw new AiCompletionError(event.result.error);
    } else {
      prepared.trace.responseOk = true;
    }

    let finalAnswer = streamed;
    if (mayNeedGroundingGuard && buffered) {
      const guarded = applyPostAnswerGroundingGuards({
        answer: buffered,
        contextBlock: prepared.contextBlock,
        query: prepared.trimmed,
      });
      for (const note of guarded.notes) {
        prepared.trace.notes.push(note);
      }
      finalAnswer = guarded.answer;
      yield guarded.answer;
    }

    logWorkspaceAiTrace(prepared.trace);

    if (finalAnswer.trim()) {
      const memory = await attachRefreshedConversationMemory({
        userId: memoryContext?.userId,
        chatId: memoryContext?.chatId,
        history,
        userMessage,
        assistantReply: finalAnswer,
        clientSnapshot: clientSnapshotFromResolved(prepared.clientContext),
      });
      if (
        memory.conversationSummary != null ||
        memory.summaryThroughMessageCount != null ||
        memory.caseMemory != null
      ) {
        yield {
          sources: prepared.sources,
          demo: false,
          requestId: prepared.requestId,
          pendingClientCandidates: prepared.pendingClientCandidates,
          needsClientSelection: prepared.needsClientSelection,
          ...memory,
        };
      }
    }
  }

  if (!hasContent) {
    yield {
      sources: prepared.sources,
      demo: true,
      requestId: prepared.requestId,
    };
    throw new AiCompletionError("MODEL_EMPTY_RESPONSE");
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

  const hint = extractClientNameHintFromFactQuery(message);

  // Prefer a single resolved client. If fuzzy search returned several
  // candidates, narrow by surname hint first — do NOT bail early, or the
  // authoritative CRM listClients fallback never runs (prod Antonova bug).
  let fromResolved: ResolvedClientContext | null =
    clientContext ??
    (clientCandidates?.length === 1 ? clientCandidates[0] : null);

  if (
    !fromResolved &&
    hint &&
    clientCandidates &&
    clientCandidates.length > 1
  ) {
    const narrowed = clientCandidates.filter((candidate) =>
      clientFactSurnameMatches(candidate.name, hint),
    );
    if (narrowed.length === 1) {
      fromResolved = narrowed[0];
    }
  }

  if (fromResolved) {
    const crm = crmPartFromResolved(fromResolved);
    if (crm) {
      const fact = readClientFactFromCrmContext(crm, fieldId);
      // Only short-circuit on a present value. Empty/missing must still try
      // authoritative listClients — fuzzy candidate rows can omit fields.
      if (fact.present) {
        return formatStructuredClientFactReply({
          clientName: crm.name || fromResolved.name,
          fieldId,
          value: fact.value,
          present: true,
          rowIndex: crm.rowIndex,
        });
      }
    }
  }

  // Authoritative CRM pass: unique surname match only (never silent pick).
  if (hint) {
    const { items } = await listClients(1, 500);
    const matches = items.filter((client) =>
      clientFactSurnameMatches(client.name, hint),
    );
    if (matches.length === 1) {
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
    // Still ambiguous after surname filter — do not invent a pick.
    if (matches.length > 1) return null;
  }

  // No unique CRM row: if we had a single resolved CRM client, report empty honestly.
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

  return null;
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
