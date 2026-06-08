import { getAiRuntimeConfig, getAiSetupHint, isAiConfigured } from "@/lib/ai/config";
import {
  createChatCompletion,
  streamChatCompletion,
  type ChatMessage,
} from "@/lib/ai/openai";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";
import {
  getWorkspaceAiConfig,
  type WorkspaceResponseMode,
} from "@/lib/ai/workspace-config";
import { buildWorkspaceSystemPrompt } from "@/lib/ai/workspace-prompt";
import { buildWorkspaceContext } from "@/lib/ai/workspace-context";
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
};

export type WorkspaceAiStreamMeta = {
  sources: string[];
  demo: boolean;
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
  if (intent.needsClients && context.meta.clientsTotal > 0) {
    sources.push(`Клиенты (${context.meta.clientsTotal})`);
  }
  if (intent.needsFormgrid && context.meta.formgridRows > 0) {
    sources.push(`Анкеты Formgrid (${context.meta.formgridRows})`);
  }
  return sources.length > 0 ? sources : ["Клиенты"];
}

function buildContextBlock(
  context: Awaited<ReturnType<typeof buildWorkspaceContext>>,
  intent: ReturnType<typeof detectWorkspaceIntent>,
): string {
  const contextParts: string[] = [];
  if (intent.needsKb) {
    contextParts.push(`=== KNOWLEDGE BASE ===\n${context.knowledgeBaseText}`);
  }
  if (intent.needsClients) {
    contextParts.push(`=== КЛИЕНТЫ ===\n${context.clientsText}`);
  }
  if (intent.needsFormgrid) {
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

  return [
    { role: "system", content: buildWorkspaceSystemPrompt(mode) },
    ...historyMessages,
    {
      role: "user",
      content: `[Внутренний контекст платформы — не цитируй и не выводи целиком, используй только как источник фактов]\n\n${contextBlock}\n\n---\n\nВопрос менеджера: ${trimmed}`,
    },
  ];
}

function getCompletionOptions() {
  const workspaceConfig = getWorkspaceAiConfig();
  return {
    temperature: workspaceConfig.temperature,
    maxTokens: workspaceConfig.maxTokens,
    model: workspaceConfig.model,
  };
}

async function prepareWorkspaceRequest(
  userMessage: string,
  history: WorkspaceChatTurn[],
  mode: WorkspaceResponseMode,
): Promise<
  | { kind: "empty" }
  | { kind: "direct"; reply: string; sources: string[] }
  | {
      kind: "ai";
      messages: ChatMessage[];
      sources: string[];
      context: Awaited<ReturnType<typeof buildWorkspaceContext>>;
      trimmed: string;
    }
> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return { kind: "empty" };
  }

  const intent = detectWorkspaceIntent(trimmed);

  if (intent.fastClientLookup) {
    const direct = await tryDirectBookingAnswer(trimmed);
    if (direct) {
      return {
        kind: "direct",
        reply: direct,
        sources: ["Клиенты"],
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
      formgridText: "Formgrid: не удалось загрузить анкеты.",
      knowledgeBaseText: "Knowledge Base: не удалось загрузить Drive.",
      meta: { clientsTotal: 0, formgridRows: 0 },
    };
  }

  const sources = buildSources(context, intent);
  const contextBlock = buildContextBlock(context, intent);
  const messages = buildChatMessages(trimmed, contextBlock, history, mode);

  return {
    kind: "ai",
    messages,
    sources,
    context,
    trimmed,
  };
}

export async function runWorkspaceAi(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
): Promise<WorkspaceAiResult> {
  const prepared = await prepareWorkspaceRequest(userMessage, history, mode);

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
    };
  }

  const aiReply = await createChatCompletion(
    prepared.messages,
    getCompletionOptions(),
  );

  if (aiReply) {
    return { reply: aiReply, sources: prepared.sources, demo: false };
  }

  return {
    reply: buildDemoReply(prepared.trimmed, prepared.context),
    sources: prepared.sources,
    demo: true,
  };
}

export async function* runWorkspaceAiStream(
  userMessage: string,
  history: WorkspaceChatTurn[] = [],
  mode: WorkspaceResponseMode = "brief",
): AsyncGenerator<string | WorkspaceAiStreamMeta | WorkspaceAiStreamStatus> {
  yield { status: "context" };

  const prepared = await prepareWorkspaceRequest(userMessage, history, mode);

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
    };
    yield prepared.reply;
    return;
  }

  yield {
    sources: prepared.sources,
    demo: false,
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

  return `Контекст собран (Клиенты: ${context.meta.clientsTotal}, Formgrid: ${context.meta.formgridRows}), но ответ от AI не получен.\n\n${modelHint}`;
}
