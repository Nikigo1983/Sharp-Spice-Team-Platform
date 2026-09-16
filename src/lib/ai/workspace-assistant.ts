import { streamTask } from "@/lib/ai/stream-task";
import {
  AiCompletionError,
  aiErrorMessage,
  classifyAiFailure,
} from "@/lib/ai/errors";
import { throwIfAiAborted } from "@/lib/ai/request-scope";
import {
  AUTHORITATIVE_EVIDENCE_BANNER,
  buildAttributionLabels,
  buildHistoryPrecedenceNote,
  formatClientProvenanceBlock,
  applyPostAnswerGroundingGuards,
} from "@/lib/ai/answer-grounding";
import { classifyCurrentTask, taskRequiresClientRef } from "@/lib/ai/current-task";
import {
  applyClientSwitch,
  bindClientBoundDraftToCaseMemory,
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  formatEvidencePackForModel,
  evidencePackTraceMeta,
  evidencePackFailureCode,
  isMigratedClientModelPath,
  selectClientModelIngress,
} from "@/lib/ai/evidence-pack";
import { assembleEvidencePack } from "@/lib/ai/evidence-pack-assemble";
import {
  planFollowUpTransform,
  formatFollowUpTransformContext,
} from "@/lib/ai/follow-up-transform";
import {
  resolveClient,
  clientRefFromResolved,
  querySuggestsDifferentClient,
  toTraceClientResolutionOutcome,
} from "@/lib/ai/resolve-client";
import type { ClientRef } from "@/lib/ai/client-ref";
import { queryRequiresVolatileRefetch } from "@/lib/ai/volatile-facts";
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
  markTraceDirect,
  markTraceProviderResult,
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
  isClientListQuery,
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
  formatFinanceClientDebtReply,
  formatFinanceDebtorsListReply,
  isFinancePaymentDebtQuery,
  isLockedClientDebtStatusQuery,
  isPronounDebtFollowUpQuery,
  resolveFinanceDebtNameHint,
  wantsDebtorEmails,
} from "@/lib/ai/finance-debt-query";
import {
  getPortalFinanceSnapshot,
  listPortalFinanceSnapshots,
} from "@/lib/ai/portal-finance-snapshot";
import {
  clipHistoryTurnsForModel,
  formatConversationSummaryForPrompt,
  historyNeedsClipping,
  selectRecentHistoryTurns,
  sanitizeConversationSummary,
} from "@/lib/ai/workspace-conversation-memory";
import {
  extractClientNameFromLetterQuery,
  formatDebtReminderLetter,
  isClientDebtReminderLetterQuery,
} from "@/lib/ai/client-debt-letter";
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
  prepareCaseMemoryForModelContext,
  sanitizeCaseMemory,
  selectAuthoritativeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";
import { queryLooksLikeClientPii } from "@/lib/ai/client-pii-signals";
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
import { parseRecentDaysFromQuery } from "@/lib/google-sheets/formgrid-dates";
import {
  getPortalIntakeCaseById,
  listPortalIntakeCasesForAi,
  portalCaseToContext,
  portalIntakeDisplayName,
} from "@/lib/ai/portal-intake-clients";

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
  /**
   * Omit from early SSE meta. Only set on the authoritative post-resolve meta.
   * `undefined` = no change; non-null = lock; explicit null = clear.
   */
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
        ? `Заявки портала Emigrant — недавние (${context.meta.formgridRows})`
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
  evidencePackText: string | null = null,
): string {
  const contextParts: string[] = [];

  if (clientSearchIntentNote) {
    contextParts.push(
      `=== CLIENT SEARCH INTENT ===\n${clientSearchIntentNote}`,
    );
  }

  // Phase 1: prefer purpose-bound EvidencePack over broad CLIENT CONTEXT preload.
  if (evidencePackText) {
    contextParts.push(evidencePackText);
  } else if (clientContext) {
    const header = isMergedClientContext(clientContext)
      ? "=== CLIENT CONTEXT (MERGED) ==="
      : "=== CLIENT CONTEXT (Заявки портала Emigrant) ===";
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
  if (intent.needsClients && !clientContext && !clientCandidates?.length && !evidencePackText) {
    contextParts.push(`=== КЛИЕНТЫ ===\n${context.clientsText}`);
  }
  if (intent.needsEmigrantDesk && !deskSlice) {
    contextParts.push(`=== EMIGRANT CROATIA DESK ===\n${context.emigrantDeskText}`);
  }
  if (intent.needsFormgrid && !clientContext) {
    contextParts.push(
      `=== ЗАЯВКИ ПОРТАЛА (недавние) ===\n${context.formgridText}`,
    );
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
  const historyMessages: ChatMessage[] = clipHistoryTurnsForModel(
    selectRecentHistoryTurns(history),
  ).map(
    (turn) => ({
      role: turn.role,
      content: turn.content,
    }),
  );

  const summaryBlock = formatConversationSummaryForPrompt(conversationSummary);
  const caseBlock = formatCaseMemoryForPrompt(
    prepareCaseMemoryForModelContext(caseMemory),
  );
  const memoryBlocks = [caseBlock, summaryBlock].filter(Boolean).join("\n\n");
  const contextWithMemory = memoryBlocks
    ? `${memoryBlocks}\n\n${contextBlock}`
    : contextBlock;

  const hasAuthoritative =
    /EVIDENCE PACK|\[SOURCE:|CLIENT CONTEXT|KNOWLEDGE BASE|ЭМИГРАНТ|ЗАЯВКИ ПОРТАЛА|FORMGRID|EMIGRANT CROATIA DESK|СВОДКА ДИАЛОГА|ПАМЯТЬ КЕЙСА|ИНТЕРНЕТ/i.test(
      contextWithMemory,
    );

  const evidencePackNote = contextWithMemory.includes("EVIDENCE PACK")
    ? "\n\nДля данных о клиенте используй === EVIDENCE PACK === как authoritative task-scoped evidence. Секция FINANCE (contractAmount, paidAmount, debtAmount, currency, paymentStatus) — это Finance; не утверждай, что Finance недоступен, если секция присутствует. Не перечисляй отсутствующие high-sensitivity категории, которых нет в EvidencePack."
    : "";
  const clientNote = contextWithMemory.includes("CLIENT CONTEXT")
    ? "\n\nДля данных о клиенте используй CLIENT CONTEXT / [SOURCE:CLIENT:…]. У каждого поля указан источник — в ответе кратко поясни «Заявки портала Emigrant», не пиши «CRM» / «таблица Клиенты» / Formgrid и не выводи сырой блок."
    : "";
  const emigrantNote = contextWithMemory.includes("ЭМИГРАНТ (документы клиентов)") ||
    contextWithMemory.includes('kind="emigrant_drive"')
    ? "\n\nДля запросов про папку ЭМИГРАНТ используй блоки [SOURCE:DRIVE:…]. Отсутствие в заявках портала не означает отсутствие в Drive. Файл не извлечён ≠ документ отсутствует у клиента."
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
      content: `[Внутренний контекст платформы — не цитируй и не выводи целиком, используй только как источник фактов]${groundingNote}${memoryNote}${evidencePackNote}${clientNote}${emigrantNote}${candidatesNote}${structuredNote}${listNote}${internetNote}${questionnaireNote}\n\n${contextWithMemory}\n\n---\n\nВопрос менеджера: ${trimmed}`,
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

function completionOptionsForWorkspaceTurn(params: {
  hasClientData: boolean;
  overrides?: Partial<ChatCompletionOptions>;
}): ChatCompletionOptions {
  return getCompletionOptions({
    containsClientData: params.hasClientData,
    ...params.overrides,
  });
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
    sources: ["Заявки портала Emigrant"],
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
    formgridText: "Заявки портала Emigrant: недавние анкеты недоступны.",
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
  if (labels.size === 0) return ["Заявки портала Emigrant"];
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
  markTraceDirect(params.trace, "NOT_REQUIRED");
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
      /** Locked ClientRef state to round-trip to the UI. */
      caseMemory?: WorkspaceCaseMemory | null;
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
      /** Locked ClientRef after resolve — must round-trip to UI. */
      caseMemory: WorkspaceCaseMemory | null;
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
      requestId: string;
      trace: WorkspaceAiTrace;
      maxTokens?: number;
    }
> {
  const started = Date.now();
  const trace = createEmptyWorkspaceAiTrace(requestId);
  const recentHistory = selectRecentHistoryTurns(history);
  trace.historyTurnCount = history.length;
  trace.historyClipped = historyNeedsClipping(recentHistory);

  const trimmed = userMessage.trim();
  if (!trimmed) {
    trace.responseOk = true;
    trace.notes.push("empty_message");
    logWorkspaceAiTrace(trace);
    return { kind: "empty", requestId, trace };
  }

  // Phase 1: CurrentTask + ClientRef lock + follow-up transform short-circuit.
  const lockedClientRef = clientRefFromCaseMemory(caseMemory);
  const transformPlan = planFollowUpTransform({
    query: trimmed,
    history: recentHistory,
    caseMemory,
  });
  const currentTask = classifyCurrentTask({
    query: trimmed,
    hasPriorDraft: Boolean(transformPlan),
  });
  trace.taskClass = currentTask.taskClass;
  trace.modelRequired = currentTask.modelRequired;
  trace.clientRefPresent = Boolean(lockedClientRef);

  if (transformPlan) {
    trace.selectedRoutes = ["follow_up_transform"];
    trace.requestClass = "FOLLOW_UP_GENERATION";
    trace.clientResolutionOutcome = "NOT_REQUIRED";
    trace.followUpReusedClientRef = Boolean(lockedClientRef);
    trace.followUpRefetchedFacts = false;
    trace.modelCalled = true;
    const transformBlock = formatFollowUpTransformContext(transformPlan);
    const messages = buildChatMessages(
      trimmed,
      transformBlock,
      history,
      mode,
      conversationSummary,
      caseMemory,
    );
    trace.contextCharsEstimate = estimateChars(transformBlock);
    trace.evidencePackChars = 0;
    trace.latencyMs.prepare = Date.now() - started;
    return {
      kind: "ai",
      messages,
      sources: [],
      context: emptyContextBundle(),
      contextBlock: transformBlock,
      trimmed,
      clientContext: null,
      caseMemory,
      requestId,
      trace,
    };
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
      sources: ["Заявки портала Emigrant"],
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

  const financeDebtNameHint =
    !followUp ? resolveFinanceDebtNameHint(trimmed, history) : null;
  const pronounDebtFollowUp =
    !followUp && isPronounDebtFollowUpQuery(trimmed);
  const lockedDebtStatusAsk =
    !followUp &&
    Boolean(lockedClientRef) &&
    (isLockedClientDebtStatusQuery(trimmed) || pronounDebtFollowUp);

  // Pronoun debt with no lock: never resolve «него» / «она» as a client name.
  if (pronounDebtFollowUp && !lockedClientRef && !financeDebtNameHint) {
    const reply =
      "Не выбран клиент для уточнения долга. Укажите ФИО или сначала найдите клиента, затем спросите про долг.";
    trace.selectedRoutes = ["finance_client_debt_missing_lock"];
    markTraceDirect(trace, "NOT_FOUND");
    trace.responseOk = true;
    trace.latencyMs.prepare = Date.now() - started;
    logWorkspaceAiTrace(trace);
    return {
      kind: "direct",
      reply: redactSensitiveText(reply),
      sources: ["Finance", "Заявки портала Emigrant"],
      requestId,
      trace,
      caseMemory,
    };
  }

  if (financeDebtNameHint || lockedDebtStatusAsk) {
    try {
      const hint = financeDebtNameHint;
      const resolvedDebt = await resolveClient({
        query: trimmed,
        lockedClientRef,
        pendingCandidates: safePendingCandidates,
        history: recentHistory,
      });
      trace.clientResolutionOutcome = toTraceClientResolutionOutcome(
        resolvedDebt.outcome,
      );
      trace.clientRefReused = resolvedDebt.reusedLock;
      trace.followUpReusedClientRef = resolvedDebt.reusedLock;
      trace.pipelineClass = "CANONICAL_PIPELINE";
      trace.duplicateResolutionUsed = false;

      if (
        (resolvedDebt.outcome === "RESOLVED" ||
          resolvedDebt.outcome === "RESOLVED_LOCKED") &&
        resolvedDebt.clientRef
      ) {
        const finance = await getPortalFinanceSnapshot(
          resolvedDebt.clientRef.clientId,
        );
        const record = await getPortalIntakeCaseById(
          resolvedDebt.clientRef.clientId,
        );
        const name =
          resolvedDebt.clientRef.displayLabel ||
          (record ? portalIntakeDisplayName(record) : hint || "клиент");
        const reply = formatFinanceClientDebtReply({
          name,
          email: finance?.email ?? record?.email ?? null,
          contractAmount: finance?.contractAmount ?? null,
          contractAmountCents: finance?.contractAmountCents ?? null,
          paidAmount: finance?.paidAmount ?? null,
          balance: finance?.balance ?? null,
          balanceCents: finance?.balanceCents ?? null,
          nameHint: hint || name,
        });
        const previousLock = clientRefFromCaseMemory(caseMemory);
        if (
          previousLock &&
          previousLock.clientId !== resolvedDebt.clientRef.clientId &&
          !resolvedDebt.reusedLock
        ) {
          const switched = applyClientSwitch({
            memory: caseMemory,
            previous: previousLock,
            next: resolvedDebt.clientRef,
          });
          caseMemory = switched.memory;
        } else {
          caseMemory = lockClientRefIntoCaseMemory(
            caseMemory,
            resolvedDebt.clientRef,
          );
        }
        trace.selectedRoutes = ["finance_client_debt_direct"];
        trace.clientRefPresent = true;
        trace.notes.push(
          resolvedDebt.reusedLock
            ? "finance_client_debt=locked_ref"
            : "finance_client_debt=resolve_client",
        );
        if (queryRequiresVolatileRefetch(trimmed)) {
          trace.volatileRefetch = true;
        }
        markTraceDirect(trace, "RESOLVED");
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: redactSensitiveText(reply),
          sources: ["Finance", "Заявки портала Emigrant"],
          requestId,
          trace,
          caseMemory,
        };
      }
      if (resolvedDebt.outcome === "AMBIGUOUS") {
        const names = resolvedDebt.candidates
          .slice(0, 8)
          .map((c) => c.displayLabel)
          .filter(Boolean)
          .join(", ");
        const reply = names
          ? `Нашёл несколько клиентов${hint ? ` по «${hint}»` : ""}: ${names}. Уточните, чей долг нужен.`
          : `Нашёл несколько клиентов. Уточните, чей долг нужен.`;
        trace.selectedRoutes = ["finance_client_debt_ambiguous"];
        markTraceDirect(trace, "AMBIGUOUS");
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: redactSensitiveText(reply),
          sources: ["Заявки портала Emigrant"],
          requestId,
          trace,
        };
      }
      const reply = hint
        ? `Клиент «${hint}» не найден в заявках портала Emigrant — долг в Finance не проверить.`
        : `Клиент не найден в заявках портала Emigrant — долг в Finance не проверить.`;
      trace.selectedRoutes = ["finance_client_debt_not_found"];
      markTraceDirect(trace, "NOT_FOUND");
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return {
        kind: "direct",
        reply: redactSensitiveText(reply),
        sources: ["Заявки портала Emigrant"],
        requestId,
        trace,
      };
    } catch (error) {
      console.error(
        `[workspace-ai][${requestId}] finance client debt failed`,
        error,
      );
      trace.notes.push("FINANCE_CLIENT_DEBT_ERROR");
    }
  }

  if (!followUp && isFinancePaymentDebtQuery(trimmed)) {
    try {
      const listed = await listPortalFinanceSnapshots({
        onlyWithDebt: true,
        limit: 100,
      });
      const reply = formatFinanceDebtorsListReply({
        debtors: listed.items.map((row) => ({
          name: row.name,
          email: row.email?.trim() || null,
          balance: row.balance,
          contractAmount: row.contractAmount,
          paidAmount: row.paidAmount,
        })),
        totalCases: listed.totalCases,
        withContract: listed.withContract,
        withoutContract: listed.withoutContract,
        focusEmails: wantsDebtorEmails(trimmed),
      });
      trace.selectedRoutes = ["finance_debtors_direct"];
      markTraceDirect(trace, "NOT_REQUIRED");
      trace.responseOk = true;
      trace.latencyMs.prepare = Date.now() - started;
      trace.notes.push(
        `finance_debtors=${listed.items.length};with_contract=${listed.withContract};emails=${wantsDebtorEmails(trimmed) ? "focus" : "inline"}`,
      );
      logWorkspaceAiTrace(trace);
      return {
        kind: "direct",
        reply: redactSensitiveText(reply),
        sources: ["Finance", "Заявки портала Emigrant"],
        requestId,
        trace,
      };
    } catch (error) {
      console.error(
        `[workspace-ai][${requestId}] finance debtors list failed`,
        error,
      );
      trace.notes.push("FINANCE_DEBTORS_ERROR");
    }
  }

  if (!followUp && isClientDebtReminderLetterQuery(trimmed)) {
    try {
      const hint =
        extractClientNameFromLetterQuery(trimmed) ||
        resolveFinanceDebtNameHint(trimmed, history);
      const resolvedLetter = await resolveClient({
        query: trimmed,
        lockedClientRef,
        pendingCandidates: safePendingCandidates,
        history: recentHistory,
      });
      trace.clientResolutionOutcome = toTraceClientResolutionOutcome(
        resolvedLetter.outcome,
      );
      trace.clientRefReused = resolvedLetter.reusedLock;
      trace.followUpReusedClientRef = resolvedLetter.reusedLock;
      trace.pipelineClass = "CANONICAL_PIPELINE";
      trace.duplicateResolutionUsed = false;

      if (
        (resolvedLetter.outcome === "RESOLVED" ||
          resolvedLetter.outcome === "RESOLVED_LOCKED") &&
        resolvedLetter.clientRef
      ) {
        const finance = await getPortalFinanceSnapshot(
          resolvedLetter.clientRef.clientId,
        );
        const record = await getPortalIntakeCaseById(
          resolvedLetter.clientRef.clientId,
        );
        const name =
          resolvedLetter.clientRef.displayLabel ||
          (record ? portalIntakeDisplayName(record) : hint || "клиент");
        const reply = formatDebtReminderLetter({
          displayName: name,
          email: finance?.email ?? record?.email ?? null,
          contractAmount: finance?.contractAmount ?? null,
          contractAmountCents: finance?.contractAmountCents ?? null,
          paidAmount: finance?.paidAmount ?? null,
          balance: finance?.balance ?? null,
          balanceCents: finance?.balanceCents ?? null,
          nameHint: hint || name,
          mentionResidencePermit: /внж|residence|вид\s+на\s+жител/i.test(
            trimmed,
          ),
        });
        const previousLock = clientRefFromCaseMemory(caseMemory);
        if (
          previousLock &&
          previousLock.clientId !== resolvedLetter.clientRef.clientId
        ) {
          const switched = applyClientSwitch({
            memory: caseMemory,
            previous: previousLock,
            next: resolvedLetter.clientRef,
          });
          caseMemory = bindClientBoundDraftToCaseMemory(
            switched.memory,
            resolvedLetter.clientRef.clientId,
          );
        } else {
          caseMemory = bindClientBoundDraftToCaseMemory(
            lockClientRefIntoCaseMemory(caseMemory, resolvedLetter.clientRef),
            resolvedLetter.clientRef.clientId,
          );
        }
        trace.selectedRoutes = ["client_debt_letter_direct"];
        trace.clientRefPresent = true;
        trace.notes.push(
          resolvedLetter.reusedLock
            ? "debt_letter=locked_ref"
            : "debt_letter=resolve_client",
        );
        markTraceDirect(trace, "RESOLVED");
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: redactSensitiveText(reply),
          sources: ["Finance", "Заявки портала Emigrant"],
          requestId,
          trace,
          caseMemory,
        };
      }
      if (resolvedLetter.outcome === "AMBIGUOUS") {
        const names = resolvedLetter.candidates
          .slice(0, 8)
          .map((c) => c.displayLabel)
          .filter(Boolean)
          .join(", ");
        const reply = names
          ? `Нашёл несколько клиентов${hint ? ` по «${hint}»` : ""}: ${names}. Уточните, кому писать письмо.`
          : `Нашёл несколько клиентов. Уточните, кому писать письмо.`;
        trace.selectedRoutes = ["client_debt_letter_ambiguous"];
        markTraceDirect(trace, "AMBIGUOUS");
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: redactSensitiveText(reply),
          sources: ["Заявки портала Emigrant"],
          requestId,
          trace,
          caseMemory,
        };
      }
      if (hint || resolvedLetter.outcome === "NOT_FOUND") {
        const reply = hint
          ? `Клиент «${hint}» не найден в заявках портала Emigrant — письмо с суммой долга составить нельзя.`
          : `Клиент не найден в заявках портала Emigrant — письмо с суммой долга составить нельзя.`;
        trace.selectedRoutes = ["client_debt_letter_not_found"];
        markTraceDirect(trace, "NOT_FOUND");
        trace.responseOk = true;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: redactSensitiveText(reply),
          sources: ["Заявки портала Emigrant"],
          requestId,
          trace,
          caseMemory,
        };
      }
    } catch (error) {
      console.error(
        `[workspace-ai][${requestId}] debt letter draft failed`,
        error,
      );
      trace.notes.push("DEBT_LETTER_ERROR");
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
    const selectedRef = clientRefFromResolved(clientContext);
    if (
      selectedRef &&
      lockedClientRef &&
      selectedRef.clientId !== lockedClientRef.clientId
    ) {
      const switched = applyClientSwitch({
        memory: caseMemory,
        previous: lockedClientRef,
        next: selectedRef,
      });
      caseMemory = switched.memory;
      trace.notes.push("client_ref_switched_via_selection");
    }
  }

  const isListLike =
    isClientListQuery(trimmed) || isClientListContinuationQuery(trimmed);

  const explicitDifferentClient =
    Boolean(lockedClientRef) &&
    querySuggestsDifferentClient(trimmed, lockedClientRef);

  const needsClientResolve =
    !followUp &&
    !isListLike &&
    (taskRequiresClientRef(currentTask) ||
      intent.needsClients ||
      intent.fastClientLookup ||
      isDocFillIntent(trimmed) ||
      explicitDifferentClient);

  const volatileRefetch = queryRequiresVolatileRefetch(trimmed);
  if (volatileRefetch) {
    trace.volatileRefetch = true;
  }

  if (needsClientResolve && !clientContext) {
    try {
      const resolved = await resolveClient({
        query: trimmed,
        lockedClientRef,
        pendingCandidates: safePendingCandidates,
        history: recentHistory,
        // Volatile asks re-fetch Finance/case facts; do not re-resolve identity.
        forceResolve: false,
      });
      trace.clientResolutionOutcome = toTraceClientResolutionOutcome(
        resolved.outcome,
      );
      trace.clientRefReused = resolved.reusedLock;
      trace.followUpReusedClientRef = resolved.reusedLock;
      trace.pipelineClass = "CANONICAL_PIPELINE";

      if (
        (resolved.outcome === "RESOLVED" ||
          resolved.outcome === "RESOLVED_LOCKED") &&
        resolved.clientRef
      ) {
        if (
          lockedClientRef &&
          resolved.clientRef.clientId !== lockedClientRef.clientId &&
          !resolved.reusedLock
        ) {
          const switched = applyClientSwitch({
            memory: caseMemory,
            previous: lockedClientRef,
            next: resolved.clientRef,
          });
          caseMemory = switched.memory;
          trace.notes.push("client_ref_switched");
        } else {
          caseMemory = lockClientRefIntoCaseMemory(
            caseMemory,
            resolved.clientRef,
          );
        }
        trace.clientRefPresent = true;
        if (resolved.client) {
          clientContext = resolved.client;
        } else {
          const record = await getPortalIntakeCaseById(
            resolved.clientRef.clientId,
          );
          if (record) {
            clientContext = portalCaseToContext(record, 100, ["resolve_client"]);
          }
        }
      } else if (resolved.outcome === "AMBIGUOUS") {
        clientCandidates = [];
        // Fall through to structured search for candidate UI below.
        trace.notes.push("resolve_client_ambiguous");
      } else if (resolved.outcome === "NOT_FOUND") {
        trace.notes.push("resolve_client_not_found");
      }
    } catch (error) {
      console.error(
        `[workspace-ai][${requestId}] resolveClient failed`,
        error,
      );
      trace.notes.push("RESOLVE_CLIENT_ERROR");
    }
  }

  // List / structured search still uses lookup when no locked single client,
  // or when list intent / ambiguity needs candidate presentation.
  if (
    !clientContext &&
    !followUp &&
    (intent.needsClients ||
      intent.needsFormgrid ||
      intent.needsEmigrantDrive ||
      intent.fastClientLookup ||
      isDocFillIntent(trimmed))
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
        `[workspace-ai][${requestId}] clientSearch foundClients=${aiSearch.foundClients} sentToModel=${aiSearch.sentToClaude} intentType=${aiSearch.intentType}`,
      );

      if (
        aiSearch.intentType === "list" &&
        clientLookup.kind === "single"
      ) {
        clientCandidates = [clientLookup.client];
        candidateScenario = "structured";
      } else if (clientLookup.kind === "single") {
        clientContext = clientLookup.client;
        const searchRef = clientRefFromResolved(clientContext);
        if (searchRef) {
          const previousLock = clientRefFromCaseMemory(caseMemory);
          if (
            previousLock &&
            previousLock.clientId !== searchRef.clientId
          ) {
            const switched = applyClientSwitch({
              memory: caseMemory,
              previous: previousLock,
              next: searchRef,
            });
            caseMemory = switched.memory;
            trace.notes.push("client_ref_switched_from_search_single");
          } else {
            caseMemory = lockClientRefIntoCaseMemory(caseMemory, searchRef);
            trace.notes.push("client_ref_locked_from_search_single");
          }
          trace.clientRefPresent = true;
          if (trace.clientResolutionOutcome === "UNKNOWN") {
            trace.clientResolutionOutcome = "RESOLVED";
          }
        }
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
    markTraceDirect(trace, clientContext ? "RESOLVED" : "NOT_REQUIRED");
    trace.responseOk = true;
    trace.latencyMs.prepare = Date.now() - started;
    logWorkspaceAiTrace(trace);
    return {
      kind: "direct",
      reply: structuredFact,
      sources: ["Заявки портала Emigrant"],
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
                  ? "Клиенты + заявки портала"
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
        sources: ["Заявки портала Emigrant"],
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

  // Phase 1/2.1: purpose-bound EvidencePack for generative client tasks.
  // Migrated path invariant: BROAD_CLIENT_CONTEXT_ALLOWED = false.
  let evidencePackText: string | null = null;
  let activeClientRef: ClientRef | null = lockedClientRef;
  if (clientContext) {
    const fromCtx = clientRefFromResolved(clientContext, "RESOLVED");
    if (fromCtx) {
      activeClientRef = fromCtx;
      trace.clientRefPresent = true;
      if (trace.clientResolutionOutcome === "UNKNOWN") {
        trace.clientResolutionOutcome = "RESOLVED";
      }
    }
  }
  const migratedClientModelPath = isMigratedClientModelPath({
    hasClientRef: Boolean(activeClientRef),
    modelRequired: currentTask.modelRequired,
    requiredProjectionCount: currentTask.requiredProjections.length,
  });
  trace.evidencePackAssemblyOutcome = migratedClientModelPath
    ? "SKIPPED"
    : "NOT_REQUIRED";

  if (migratedClientModelPath && activeClientRef) {
    try {
      const pack = await assembleEvidencePack({
        task: currentTask,
        clientRef: activeClientRef,
        freshnessClass:
          volatileRefetch || trace.followUpReusedClientRef
            ? "LOCKED_REFETCH"
            : "LIVE_FETCH",
      });
      if (pack) {
        evidencePackText = formatEvidencePackForModel(pack);
        const meta = evidencePackTraceMeta(pack, currentTask);
        trace.evidenceProjectionNames = meta.evidenceProjectionNames;
        trace.evidenceFactCount = meta.evidenceFactCount;
        trace.evidencePackChars = meta.evidenceChars;
        trace.evidenceFreshnessClass = meta.evidenceFreshnessClass;
        trace.evidencePackUsed = true;
        trace.evidencePackAssemblyOutcome = "SUCCESS";
        trace.pipelineClass = "CANONICAL_PIPELINE";
        trace.legacyPreloadUsed = false;
        trace.notes.push("evidence_pack_attached");
      } else {
        const code = evidencePackFailureCode("null_pack");
        trace.evidencePackAssemblyOutcome = "FAILED";
        trace.evidencePackUsed = false;
        trace.legacyPreloadUsed = false;
        trace.pipelineClass = "CANONICAL_PIPELINE";
        trace.failureClass = classifyAiFailure(code);
        trace.selectedRoutes = ["evidence_pack_unavailable"];
        trace.notes.push("EVIDENCE_PACK_NULL");
        markTraceDirect(trace);
        trace.responseOk = false;
        trace.latencyMs.prepare = Date.now() - started;
        logWorkspaceAiTrace(trace);
        return {
          kind: "direct",
          reply: aiErrorMessage(code),
          sources: [],
          requestId,
          trace,
        };
      }
    } catch (error) {
      console.error(
        `[workspace-ai][${requestId}] EvidencePack assemble failed`,
        error,
      );
      const code = evidencePackFailureCode("throw");
      trace.evidencePackAssemblyOutcome = "FAILED";
      trace.evidencePackUsed = false;
      trace.legacyPreloadUsed = false;
      trace.pipelineClass = "CANONICAL_PIPELINE";
      trace.failureClass = classifyAiFailure(code);
      trace.selectedRoutes = ["evidence_pack_error"];
      trace.notes.push("EVIDENCE_PACK_ERROR");
      markTraceDirect(trace);
      trace.responseOk = false;
      trace.latencyMs.prepare = Date.now() - started;
      logWorkspaceAiTrace(trace);
      return {
        kind: "direct",
        reply: aiErrorMessage(code),
        sources: [],
        requestId,
        trace,
      };
    }
  }

  const ingress = selectClientModelIngress({
    migratedClientModelPath,
    evidencePackText,
  });
  // Defense-in-depth: never attach broad CLIENT CONTEXT on migrated model paths.
  const modelClientContext = ingress.allowBroadClientContext
    ? clientContext
    : null;

  const sources = buildSources(context, intent, {
    clientLabel:
      evidencePackText || modelClientContext || clientCandidates?.length
        ? clientAttrLabel
        : intent.needsClients && context.meta.clientsTotal > 0
          ? clientAttrLabel
          : null,
    deskLabel:
      intent.needsEmigrantDesk &&
      !modelClientContext &&
      context.meta.emigrantDeskTotal > 0
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
    modelClientContext,
    clientCandidates,
    candidateScenario,
    clientSearchIntentNote,
    clientCandidatesTotalFound,
    deskSlice,
    webSearch?.text ?? null,
    evidencePackText,
  );
  if (evidencePackText) {
    trace.legacyPreloadUsed = false;
  } else if (modelClientContext) {
    trace.legacyPreloadUsed = true;
    trace.notes.push("legacy_client_context_preload");
  } else {
    trace.legacyPreloadUsed = false;
  }

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
    caseMemory,
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

  // Phase 2: canonical questionnaire UUID only — never Sheets-style row keys.
  const ref = clientRefFromResolved(client);
  const canonicalId = ref?.clientId ?? null;

  return {
    id: canonicalId,
    name: client.name ?? null,
    citizenship: pick(/^(гражданств|citizenship)$/i),
    latinName: pick(/латиниц|latinName|^latin$/i),
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
  const recent = clipHistoryTurnsForModel(
    selectRecentHistoryTurns(prepared.history),
  ).map((turn) => ({
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
      content: formatCaseMemoryForPrompt(
        prepareCaseMemoryForModelContext(prepared.caseMemory),
      ),
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
  prepared.trace.modelCalled = true;

  try {
    const loop = await runWorkspaceAgentToolLoop({
      messages,
      context: toolContext,
      completionOptions: completionOptionsForWorkspaceTurn({
        hasClientData: true,
      }),
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
            tag === "KB" ? "Knowledge Base" : "Заявки портала Emigrant",
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
        "Напишите вопрос — подключу Knowledge Base и заявки портала Emigrant.",
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
      conversationSummary: memory.conversationSummary,
      summaryThroughMessageCount: memory.summaryThroughMessageCount,
      // Prefer prepare lock over store refresh — never drop a just-created ClientRef.
      caseMemory: selectAuthoritativeCaseMemory({ prepared: prepared.caseMemory, refreshed: memory.caseMemory }),
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
        completionOptionsForWorkspaceTurn({
          hasClientData:
            Boolean(legacy.clientContext) ||
            queryLooksLikeClientPii(legacy.trimmed),
          overrides: legacy.maxTokens
            ? { maxTokens: legacy.maxTokens }
            : undefined,
        }),
      );
      legacy.trace.requestedModel = completion.requestedModel;
      legacy.trace.returnedModel = completion.returnedModel;
      legacy.trace.usageInputTokens = completion.usage.inputTokens;
      legacy.trace.usageOutputTokens = completion.usage.outputTokens;
      legacy.trace.latencyMs.model = completion.latencyMs;
      legacy.trace.openRouterOk = completion.ok;
      legacy.trace.astraCalled = true;
      legacy.trace.modelCalled = true;
      legacy.trace.latencyMs.total = Date.now() - totalStarted;
      if (!completion.ok) {
        markTraceProviderResult(legacy.trace, {
          ok: false,
          errorCode: completion.error,
        });
        logWorkspaceAiTrace(legacy.trace);
        throw new AiCompletionError(completion.error);
      }
      if (completion.content) {
        const guarded = applyPostAnswerGroundingGuards({
          answer: completion.content,
          contextBlock: legacy.contextBlock,
          query: legacy.trimmed,
        });
        legacy.trace.responseOk = true;
        markTraceProviderResult(legacy.trace, { ok: true });
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
    completionOptionsForWorkspaceTurn({
      hasClientData:
        Boolean(prepared.clientContext) ||
        queryLooksLikeClientPii(prepared.trimmed),
      overrides: prepared.maxTokens
        ? { maxTokens: prepared.maxTokens }
        : undefined,
    }),
  );
  prepared.trace.requestedModel = completion.requestedModel;
  prepared.trace.returnedModel = completion.returnedModel;
  prepared.trace.usageInputTokens = completion.usage.inputTokens;
  prepared.trace.usageOutputTokens = completion.usage.outputTokens;
  prepared.trace.latencyMs.model = completion.latencyMs;
  prepared.trace.openRouterOk = completion.ok;
  prepared.trace.astraCalled = true;
  prepared.trace.modelCalled = true;
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
    markTraceProviderResult(prepared.trace, { ok: true });
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
      conversationSummary: memory.conversationSummary,
      summaryThroughMessageCount: memory.summaryThroughMessageCount,
      caseMemory: selectAuthoritativeCaseMemory({ prepared: prepared.caseMemory, refreshed: memory.caseMemory }),
    };
  }

  prepared.trace.fallbackActivated = true;
  prepared.trace.fallbackReason =
    completion.error === "EMPTY_MODEL_RESPONSE" ||
    completion.error === "MODEL_EMPTY_RESPONSE"
      ? "MODEL_EMPTY_RESPONSE"
      : "OPENROUTER_ERROR";
  prepared.trace.responseOk = false;
  prepared.trace.notes.push(completion.error ?? "OPENROUTER_ERROR");
  markTraceProviderResult(prepared.trace, {
    ok: false,
    errorCode: completion.error,
  });
  logWorkspaceAiTrace(prepared.trace);

  throw new AiCompletionError(completion.error ?? "INTERNAL_AI_ERROR");
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
    yield "Напишите вопрос — подключу Knowledge Base и заявки портала Emigrant.";
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
      conversationSummary: memory.conversationSummary,
      summaryThroughMessageCount: memory.summaryThroughMessageCount,
      caseMemory: selectAuthoritativeCaseMemory({ prepared: prepared.caseMemory, refreshed: memory.caseMemory }),
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
      completionOptionsForWorkspaceTurn({
        hasClientData:
          Boolean(legacy.clientContext) ||
          queryLooksLikeClientPii(legacy.trimmed),
        overrides: legacy.maxTokens
          ? { maxTokens: legacy.maxTokens }
          : undefined,
      }),
    )) {
      if (event.type === "delta") {
        streamed += event.content;
        yield event.content;
        continue;
      }
      if (!event.result.ok) throw new AiCompletionError(event.result.error);
      legacy.trace.notes.push("agent_fallback_legacy_stream");
      legacy.trace.astraCalled = true;
      legacy.trace.modelCalled = true;
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
    completionOptionsForWorkspaceTurn({
      hasClientData:
        Boolean(prepared.clientContext) ||
        queryLooksLikeClientPii(prepared.trimmed),
      overrides: prepared.maxTokens
        ? { maxTokens: prepared.maxTokens }
        : undefined,
    }),
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
    prepared.trace.astraCalled = true;
    prepared.trace.modelCalled = true;
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
      const caseMemory = selectAuthoritativeCaseMemory({ prepared: prepared.caseMemory, refreshed: memory.caseMemory });
      // Always emit final meta when a ClientRef lock exists — never rely only on
      // store refresh succeeding. Early meta intentionally omits caseMemory.
      yield {
        sources: prepared.sources,
        demo: false,
        requestId: prepared.requestId,
        pendingClientCandidates: prepared.pendingClientCandidates,
        needsClientSelection: prepared.needsClientSelection,
        conversationSummary: memory.conversationSummary,
        summaryThroughMessageCount: memory.summaryThroughMessageCount,
        caseMemory,
      };
    }
  }

  if (!hasContent) {
    yield {
      sources: prepared.sources,
      demo: true,
      requestId: prepared.requestId,
    };
    throw new AiCompletionError("EMPTY_MODEL_RESPONSE");
  }
}

async function tryDirectFormgridRecentAnswer(
  message: string,
): Promise<string | null> {
  const days = parseRecentDaysFromQuery(message);
  if (days === null) return null;
  if (!/анкет|formgrid|заявк|новые\s+клиент/i.test(message)) return null;

  const cases = await listPortalIntakeCasesForAi();
  if (cases.length === 0) return null;

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days);
  const sinceMs = since.getTime();

  const recent = cases.filter((record) => {
    const raw = record.submittedAt || record.createdAt;
    if (!raw) return false;
    const ts = Date.parse(raw);
    return Number.isFinite(ts) && ts >= sinceMs;
  });

  if (recent.length === 0) {
    return `За последние **${days}** дн. в заявках портала Emigrant новых заявок нет.`;
  }

  const lines = recent
    .slice(0, 40)
    .map((record) => `- ${portalIntakeDisplayName(record)}`);

  return [
    `За последние **${days}** дн. в заявках портала Emigrant — **${recent.length}** заявок:`,
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

  const cases = await listPortalIntakeCasesForAi();
  const record = cases.find((entry) => {
    const nameLower = portalIntakeDisplayName(entry).toLowerCase();
    return tokens.every((token) => nameLower.includes(token.toLowerCase()));
  });
  if (!record) return null;

  const ctx = portalCaseToContext(record, 100);
  const passport = ctx.debugRow.passport?.trim();
  if (passport && passport !== "—" && looksLikePassportNumber(passport)) {
    return formatPassportLookupReply(ctx.name, passport, 0);
  }

  return formatPassportMissingReply(ctx.name, 0);
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

  // Authoritative portal pass: unique surname match only (never silent pick).
  if (hint) {
    const cases = await listPortalIntakeCasesForAi();
    const matches = cases.filter((record) =>
      clientFactSurnameMatches(portalIntakeDisplayName(record), hint),
    );
    if (matches.length === 1) {
      const ctx = portalCaseToContext(matches[0], 100);
      const fact = readClientFactFromCrmContext(ctx, fieldId);
      return formatStructuredClientFactReply({
        clientName: ctx.name,
        fieldId,
        value: fact.value,
        present: fact.present,
        rowIndex: 0,
      });
    }
    // Still ambiguous after surname filter — do not invent a pick.
    if (matches.length > 1) return null;
  }

  // No unique row: if we had a single resolved portal client, report empty honestly.
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
