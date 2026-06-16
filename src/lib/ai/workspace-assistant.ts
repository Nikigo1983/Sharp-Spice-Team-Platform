import { getAiRuntimeConfig, getAiSetupHint, isAiConfigured } from "@/lib/ai/config";
import {
  createChatCompletion,
  streamChatCompletion,
  type ChatCompletionOptions,
  type ChatMessage,
} from "@/lib/ai/openai";
import {
  detectWorkspaceIntent,
  isPassportNumberLookupQuery,
} from "@/lib/ai/query-intent";
import { extractPersonNameTokens } from "@/lib/ai/name-matching";
import { extractPassportFromClientRecord } from "@/lib/ai/client-passport";
import {
  formatPassportLookupReply,
  formatPassportMissingReply,
  looksLikePassportNumber,
} from "@/lib/ai/format-client";
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
import { formatClientSearchIntentForAi } from "@/lib/ai/client-search-intent";
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
  pendingClientCandidates?: ClientContext[];
  needsClientSelection?: boolean;
};

export type WorkspaceAiStreamMeta = {
  sources: string[];
  demo: boolean;
  pendingClientCandidates?: ClientContext[];
  needsClientSelection?: boolean;
};

export type WorkspaceAiStreamStatus = {
  status: "context" | "generating";
};

function buildSources(
  context: Awaited<ReturnType<typeof buildWorkspaceContext>>,
  intent: ReturnType<typeof detectWorkspaceIntent>,
): string[] {
  const sources: string[] = [];
  if (intent.needsKb) sources.push("Knowledge Base");
  if (intent.needsEmigrantDrive && context.meta.emigrantDriveConfigured) {
    sources.push("ЭМИГРАНТ (Google Drive)");
  }
  if (intent.needsClients && context.meta.clientsTotal > 0) {
    sources.push(`Клиенты (${context.meta.clientsTotal})`);
  }
  if (intent.needsEmigrantDesk && context.meta.emigrantDeskTotal > 0) {
    sources.push(`Emigrant Desk (${context.meta.emigrantDeskTotal})`);
  }
  if (intent.needsFormgrid && context.meta.formgridRows > 0) {
    sources.push(`Анкеты Formgrid (${context.meta.formgridRows})`);
  }
  return sources.length > 0 ? sources : ["Клиенты"];
}

function buildContextBlock(
  context: Awaited<ReturnType<typeof buildWorkspaceContext>>,
  intent: ReturnType<typeof detectWorkspaceIntent>,
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
    contextParts.push(
      `${header}\n${formatClientContextBlock(clientContext, { desk: deskSlice })}`,
    );
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

  const clientNote = contextBlock.includes("CLIENT CONTEXT")
    ? "\n\nДля данных о клиенте используй CLIENT CONTEXT. У каждого поля указан источник — в ответе кратко поясни «таблица «Клиенты»», «анкета Formgrid» и т.д., не пиши «CRM» и не выводи сырой блок."
    : "";
  const emigrantNote = contextBlock.includes("ЭМИГРАНТ (документы клиентов)")
    ? "\n\nДля запросов про папку ЭМИГРАНТ используй блок «ЭМИГРАНТ (документы клиентов)». Отсутствие в таблицах Клиенты не означает отсутствие в Drive."
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

  return [
    { role: "system", content: buildWorkspaceSystemPrompt(mode) },
    ...historyMessages,
    {
      role: "user",
      content: `[Внутренний контекст платформы — не цитируй и не выводи целиком, используй только как источник фактов]${clientNote}${emigrantNote}${candidatesNote}${structuredNote}${listNote}\n\n${contextBlock}\n\n---\n\nВопрос менеджера: ${trimmed}`,
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
): Promise<
  | { kind: "empty" }
  | {
      kind: "direct";
      reply: string;
      sources: string[];
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
    }
  | {
      kind: "ai";
      messages: ChatMessage[];
      sources: string[];
      context: Awaited<ReturnType<typeof buildWorkspaceContext>>;
      trimmed: string;
      clientContext: ResolvedClientContext | null;
      pendingClientCandidates?: ClientContext[];
      needsClientSelection?: boolean;
    }
> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return { kind: "empty" };
  }

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
    return {
      kind: "direct",
      reply: debugReply,
      sources: ["Клиенты", "Новые клиенты"],
    };
  }

  const followUp = resolveClientSelectionFollowUp(
    trimmed,
    pendingClientCandidates,
    history,
  );

  if (followUp?.kind === "select" && findRecentPassportQuestion(history)) {
    const fromSelected = passportReplyFromClientContext(followUp.client);
    if (fromSelected) {
      return buildPassportLookupDirectResult(fromSelected);
    }
    const passportQuery = findRecentPassportQuestion(history);
    if (passportQuery) {
      const retry = await tryDirectPassportAnswer(passportQuery);
      if (retry) {
        return buildPassportLookupDirectResult(retry);
      }
    }
  }

  const intent = detectWorkspaceIntent(trimmed);

  if (isPassportNumberLookupQuery(trimmed)) {
    const early = await tryDirectPassportAnswer(trimmed);
    if (early) {
      return buildPassportLookupDirectResult(early);
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
  } else {
    const aiSearch = await lookupClientsWithAiSearch(trimmed);
    const clientLookup = aiSearch.lookup;
    clientSearchIntentNote = formatClientSearchIntentForAi(aiSearch.intent);
    clientCandidatesTotalFound = aiSearch.foundClients;

    console.log(
      `[workspace-ai] Found clients: ${aiSearch.foundClients}, Sent to Claude: ${aiSearch.sentToClaude}, Intent type: ${aiSearch.intentType}`,
    );

    if (
      aiSearch.intentType === "list" &&
      clientLookup.kind === "single"
    ) {
      clientCandidates = [clientLookup.client];
      candidateScenario = "structured";
      pendingForUi = isMergedClientContext(clientLookup.client)
        ? clientLookup.client.parts
        : [clientLookup.client];
    } else if (clientLookup.kind === "single") {
      clientContext = clientLookup.client;
    } else if (clientLookup.kind === "multiple") {
      clientCandidates = clientLookup.clients;
      candidateScenario = aiSearch.usedStructuredSearch ? "structured" : "multiple";
      pendingForUi = clientLookup.pendingParts;
      needsClientSelection = clientLookup.clients.length > 1;
    } else if (clientLookup.kind === "weak") {
      clientCandidates = clientLookup.clients;
      candidateScenario = "weak";
      pendingForUi = clientLookup.clients.flatMap((client) =>
        isMergedClientContext(client) ? client.parts : [client],
      );
    } else if (clientLookup.kind === "not_found") {
      const fuzzy = await lookupFuzzyClientCandidates(trimmed, 10);
      if (fuzzy.length > 0) {
        clientCandidates = fuzzy;
        candidateScenario = "not_found";
        pendingForUi = fuzzy.flatMap((client) =>
          isMergedClientContext(client) ? client.parts : [client],
        );
      }
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
      return buildPassportLookupDirectResult(passportReply);
    }
    needsClientSelection = false;
    pendingForUi = undefined;
  }

  if (intent.fastClientLookup && !clientContext) {
    const direct = await tryDirectBookingAnswer(trimmed);
    if (direct) {
      return {
        kind: "direct",
        reply: direct,
        sources: ["Клиенты"],
      };
    }
  }

  if (intent.needsEmigrantDesk && /статус/iu.test(trimmed)) {
    const direct = await tryDirectEmigrantStatusAnswer(trimmed);
    if (direct) {
      return {
        kind: "direct",
        reply: direct,
        sources: ["Emigrant Desk"],
      };
    }
  }

  if (intent.needsFormgrid) {
    const direct = await tryDirectFormgridRecentAnswer(trimmed);
    if (direct) {
      return {
        kind: "direct",
        reply: direct,
        sources: ["Анкеты Formgrid"],
      };
    }
  }

  let context: Awaited<ReturnType<typeof buildWorkspaceContext>>;
  try {
    context = await buildWorkspaceContext(trimmed, intent);
  } catch (error) {
    console.error("[workspace-ai] context build failed", error);
    context = {
      clientsText: "Клиенты: не удалось загрузить таблицу.",
      emigrantDeskText: "Emigrant Croatia Desk: не удалось загрузить статусы дел.",
      emigrantDriveText: "Папка ЭМИГРАНТ: не удалось загрузить Google Drive.",
      formgridText: "Formgrid: не удалось загрузить анкеты.",
      knowledgeBaseText: "Knowledge Base: не удалось загрузить Drive.",
      meta: {
        clientsTotal: 0,
        emigrantDeskTotal: 0,
        emigrantDriveConfigured: false,
        formgridRows: 0,
      },
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
      console.error("[workspace-ai] desk lookup for client context failed", error);
    }
  }

  const sources = clientContext
    ? [
        isMergedClientContext(clientContext)
          ? deskSlice
            ? "Клиенты + Новые клиенты + Emigrant Desk"
            : "Клиенты + Новые клиенты"
          : deskSlice
            ? `${clientContext.sourceLabel} + Emigrant Desk`
            : clientContext.sourceLabel,
        ...buildSources(context, intent).filter(
          (source) =>
            !/^Клиенты|^Анкеты Formgrid|^Emigrant Desk/i.test(source),
        ),
      ]
    : clientCandidates?.length
      ? [`Клиенты (кандидаты: ${clientCandidates.length})`, ...buildSources(context, intent)]
      : buildSources(context, intent);
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
  const messages = buildChatMessages(trimmed, contextBlock, history, mode);

  return {
    kind: "ai",
    messages,
    sources,
    context,
    trimmed,
    clientContext,
    pendingClientCandidates: pendingForUi,
    needsClientSelection,
  };
}

export async function runWorkspaceAi(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
  pendingClientCandidates: ClientContext[] | null = null,
): Promise<WorkspaceAiResult> {
  const prepared = await prepareWorkspaceRequest(
    userMessage,
    history,
    mode,
    pendingClientCandidates,
  );

  if (prepared.kind === "empty") {
    return {
      reply:
        "Напишите вопрос — подключу Knowledge Base, клиентов и анкеты Formgrid.",
      sources: [],
      demo: true,
    };
  }

  if (prepared.kind === "direct") {
    return {
      reply: prepared.reply,
      sources: prepared.sources,
      demo: false,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
    };
  }

  const aiReply = await createChatCompletion(
    prepared.messages,
    getCompletionOptions(),
  );

  if (aiReply) {
    return {
      reply: aiReply,
      sources: prepared.sources,
      demo: false,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
    };
  }

  return {
    reply: buildDemoReply(prepared.trimmed, prepared.context),
    sources: prepared.sources,
    demo: true,
    pendingClientCandidates: prepared.pendingClientCandidates,
    needsClientSelection: prepared.needsClientSelection,
  };
}

export async function* runWorkspaceAiStream(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
  pendingClientCandidates: ClientContext[] | null = null,
): AsyncGenerator<string | WorkspaceAiStreamMeta | WorkspaceAiStreamStatus> {
  yield { status: "context" };

  const prepared = await prepareWorkspaceRequest(
    userMessage,
    history,
    mode,
    pendingClientCandidates,
  );

  if (prepared.kind === "empty") {
    yield {
      sources: [],
      demo: true,
    };
    yield "Напишите вопрос — подключу Knowledge Base, клиентов и анкеты Formgrid.";
    return;
  }

  if (prepared.kind === "direct") {
    yield {
      sources: prepared.sources,
      demo: false,
      pendingClientCandidates: prepared.pendingClientCandidates,
      needsClientSelection: prepared.needsClientSelection,
    };
    yield prepared.reply;
    return;
  }

  yield {
    sources: prepared.sources,
    demo: false,
    pendingClientCandidates: prepared.pendingClientCandidates,
    needsClientSelection: prepared.needsClientSelection,
  };

  yield { status: "generating" };

  let hasContent = false;
  for await (const chunk of streamChatCompletion(
    prepared.messages,
    getCompletionOptions(),
  )) {
    hasContent = true;
    yield chunk;
  }

  if (!hasContent) {
    yield {
      sources: prepared.sources,
      demo: true,
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

async function tryDirectBookingAnswer(message: string): Promise<string | null> {
  const lower = message.toLowerCase();
  if (!lower.includes("букинг") && !lower.includes("адрес")) {
    return null;
  }

  const { items } = await listClients(1, 300);
  const nameMatch = lower.match(/(?:клиент[а-я]*|у)\s+([а-яё\-]+)/iu);
  const needle = nameMatch?.[1]?.toLowerCase();
  if (!needle) return null;

  const client = items.find((c) => c.name.toLowerCase().includes(needle));
  if (!client) return null;

  const hasAddress =
    client.bookingAddress && client.bookingAddress !== "—";
  const hasDates = client.bookingRange && client.bookingRange !== "—";

  if (!hasAddress && !hasDates) return null;

  const parts = [
    `По **${client.name}** в таблице есть букинг.`,
  ];
  if (hasAddress) parts.push(`Адрес: **${client.bookingAddress}**.`);
  if (hasDates) parts.push(`Даты: ${client.bookingRange}.`);
  if (client.passportNumber && client.passportNumber !== "—") {
    parts.push(`Паспорт в базе: ${client.passportNumber}.`);
  }
  parts.push(
    "\n**Что дальше:** сверьте даты с клиентом и проверьте, всё ли готово к заезду.",
  );
  return parts.join(" ");
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
