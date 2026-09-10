/**
 * Optional web search for AI Workspace ("internet last").
 * Used only when the query needs current external info — never for CRM client facts.
 */

import { getAiRuntimeConfig } from "@/lib/ai/config";
import { fetchWithTlsFallback } from "@/lib/google-fetch";
import { isDocFillIntent } from "@/lib/ai/workspace-doc-fill";
import { isPassportNumberLookupQuery } from "@/lib/ai/query-intent-signals";
import { isClientListQuery } from "@/lib/ai/client-search-intent";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WorkspaceWebSearchResult = {
  ok: boolean;
  configured: boolean;
  provider: "tavily" | "serper" | "openrouter" | "none";
  query: string;
  text: string;
  hits: WebSearchHit[];
  error?: string;
};

const EXPLICIT_INTERNET_RE =
  /(?:в\s+)?интернет\w*|погугл\w*|google\s+search|search\s+the\s+web|web\s+search|найди\s+в\s+сети|проверь\s+в\s+сети|актуальн\w*\s+(?:сейчас|на\s+сегодня|на\s+момент)|свеж\w*\s+(?:новост|требован|изменен)|latest\s+(?:news|requirements?)|official\s+site|официальн\w*\s+сайт|gov\.hr|mup\.hr|сайт\s+мвд|eur-lex/i;

const CURRENCY_EXTERNAL_RE =
  /(?:изменил|обновил|новые\s+требован|current\s+requirements?|as\s+of\s+20\d{2}|на\s+20(?:2[4-9]|3\d)|что\s+сейчас\s+(?:нужно|требу)|актуальн\w*\s+требован)/i;

const INTERNAL_ONLY_RE =
  /паспорт|букинг|formgrid|анкет[аыу]|память\s+кейс|клиент\w*\s+в\s+работ|список\s+клиент|таблица\s+«?клиент/i;

export function isWebSearchConfigured(): boolean {
  if (process.env.AI_WEB_SEARCH_ENABLED?.trim().toLowerCase() === "false") {
    return false;
  }
  return Boolean(
    process.env.TAVILY_API_KEY?.trim() ||
      process.env.SERPER_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim(),
  );
}

/**
 * Internet is last: only for explicit / currency-external asks,
 * never for CRM/list/passport/doc-fill.
 */
export function shouldUseInternetSearch(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (isDocFillIntent(trimmed)) return false;
  if (isPassportNumberLookupQuery(trimmed)) return false;
  if (isClientListQuery(trimmed)) return false;
  if (INTERNAL_ONLY_RE.test(trimmed) && !EXPLICIT_INTERNET_RE.test(trimmed)) {
    return false;
  }
  if (EXPLICIT_INTERNET_RE.test(trimmed)) return true;
  if (CURRENCY_EXTERNAL_RE.test(trimmed)) return true;
  return false;
}

function cleanText(value: unknown, max = 600): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function formatWebSearchBlock(params: {
  query: string;
  provider: string;
  hits: WebSearchHit[];
  extraNote?: string | null;
}): string {
  const lines = [
    "=== ИНТЕРНЕТ (web search) ===",
    "Приоритет НИЖЕ, чем CLIENT CONTEXT / Knowledge Base / Emigrant Drive для фактов о клиентах и внутренних документах.",
    "Используй только для внешних актуальных требований/законов/новостей. Указывай URL. Не выдумывай.",
    `Запрос поиска: ${params.query}`,
    `Провайдер: ${params.provider}`,
  ];
  if (params.extraNote) lines.push(params.extraNote);
  if (params.hits.length === 0) {
    lines.push("Результатов нет или поиск не вернул сниппеты.");
    return lines.join("\n");
  }
  lines.push("", "Результаты:");
  params.hits.forEach((hit, index) => {
    lines.push(
      `${index + 1}. ${hit.title || "без названия"}`,
      `   URL: ${hit.url || "—"}`,
      `   ${hit.snippet || "—"}`,
    );
  });
  return lines.join("\n");
}

async function searchWithTavily(query: string): Promise<WorkspaceWebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: "none",
      query,
      text: "",
      hits: [],
      error: "TAVILY_NOT_CONFIGURED",
    };
  }

  const response = await fetchWithTlsFallback("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      provider: "tavily",
      query,
      text: "",
      hits: [],
      error: `TAVILY_HTTP_${response.status}`,
    };
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const hits: WebSearchHit[] = (data.results ?? [])
    .slice(0, 5)
    .map((row) => ({
      title: cleanText(row.title, 160),
      url: cleanText(row.url, 400),
      snippet: cleanText(row.content, 500),
    }))
    .filter((hit) => hit.url || hit.snippet);

  return {
    ok: true,
    configured: true,
    provider: "tavily",
    query,
    hits,
    text: formatWebSearchBlock({ query, provider: "tavily", hits }),
  };
}

async function searchWithSerper(query: string): Promise<WorkspaceWebSearchResult> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: "none",
      query,
      text: "",
      hits: [],
      error: "SERPER_NOT_CONFIGURED",
    };
  }

  const response = await fetchWithTlsFallback("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      provider: "serper",
      query,
      text: "",
      hits: [],
      error: `SERPER_HTTP_${response.status}`,
    };
  }

  const data = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  const hits: WebSearchHit[] = (data.organic ?? [])
    .slice(0, 5)
    .map((row) => ({
      title: cleanText(row.title, 160),
      url: cleanText(row.link, 400),
      snippet: cleanText(row.snippet, 500),
    }))
    .filter((hit) => hit.url || hit.snippet);

  return {
    ok: true,
    configured: true,
    provider: "serper",
    query,
    hits,
    text: formatWebSearchBlock({ query, provider: "serper", hits }),
  };
}

async function searchWithOpenRouterPlugin(
  query: string,
): Promise<WorkspaceWebSearchResult> {
  const config = getAiRuntimeConfig();
  if (!config || config.provider !== "openrouter") {
    return {
      ok: false,
      configured: false,
      provider: "none",
      query,
      text: "",
      hits: [],
      error: "OPENROUTER_NOT_CONFIGURED",
    };
  }

  const response = await fetchWithTlsFallback(config.completionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER?.trim() || "http://localhost:3000",
      "X-OpenRouter-Title":
        process.env.OPENROUTER_APP_TITLE?.trim() ||
        "Sharp & Spice Team Platform",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      max_tokens: 900,
      plugins: [{ id: "web", max_results: 5 }],
      messages: [
        {
          role: "system",
          content:
            "Ты модуль web-search. Верни только краткий список источников для менеджера иммиграционного агентства: по каждому пункту Title | URL | 1–2 предложения факта. Без выдумок. Без преамбулы.",
        },
        {
          role: "user",
          content: `Найди актуальные внешние сведения по запросу:\n${query}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      provider: "openrouter",
      query,
      text: "",
      hits: [],
      error: `OPENROUTER_HTTP_${response.status}`,
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: Array<string | { url?: string; title?: string }>;
  };
  const content = cleanText(data.choices?.[0]?.message?.content, 3500);
  const citationHits: WebSearchHit[] = (data.citations ?? [])
    .slice(0, 5)
    .map((item) => {
      if (typeof item === "string") {
        return { title: item, url: item, snippet: "" };
      }
      return {
        title: cleanText(item.title, 160) || cleanText(item.url, 160),
        url: cleanText(item.url, 400),
        snippet: "",
      };
    })
    .filter((hit) => hit.url);

  const hits =
    citationHits.length > 0
      ? citationHits
      : content
        ? [{ title: "OpenRouter web summary", url: "", snippet: content }]
        : [];

  return {
    ok: Boolean(content || hits.length),
    configured: true,
    provider: "openrouter",
    query,
    hits,
    text: formatWebSearchBlock({
      query,
      provider: "openrouter",
      hits,
      extraNote: content && citationHits.length > 0 ? `Сводка:\n${content}` : null,
    }),
  };
}

export async function searchWebForWorkspace(
  query: string,
): Promise<WorkspaceWebSearchResult> {
  const trimmed = query.trim().slice(0, 400);
  if (!trimmed) {
    return {
      ok: false,
      configured: isWebSearchConfigured(),
      provider: "none",
      query: "",
      text: "",
      hits: [],
      error: "EMPTY_QUERY",
    };
  }

  if (!isWebSearchConfigured()) {
    return {
      ok: false,
      configured: false,
      provider: "none",
      query: trimmed,
      text: [
        "=== ИНТЕРНЕТ (web search) ===",
        "Поиск в интернете не настроен. Добавьте TAVILY_API_KEY или SERPER_API_KEY (или OPENROUTER_API_KEY для plugin fallback).",
      ].join("\n"),
      hits: [],
      error: "NOT_CONFIGURED",
    };
  }

  try {
    if (process.env.TAVILY_API_KEY?.trim()) {
      const tavily = await searchWithTavily(trimmed);
      if (tavily.ok) return tavily;
    }
    if (process.env.SERPER_API_KEY?.trim()) {
      const serper = await searchWithSerper(trimmed);
      if (serper.ok) return serper;
    }
    if (process.env.OPENROUTER_API_KEY?.trim()) {
      return searchWithOpenRouterPlugin(trimmed);
    }
  } catch (error) {
    console.error("[workspace-web-search]", error);
    return {
      ok: false,
      configured: true,
      provider: "none",
      query: trimmed,
      text: [
        "=== ИНТЕРНЕТ (web search) ===",
        "Поиск не удался из‑за сетевой/API ошибки. Ответь по внутренним источникам и скажи, что интернет временно недоступен.",
      ].join("\n"),
      hits: [],
      error: "SEARCH_FAILED",
    };
  }

  return {
    ok: false,
    configured: true,
    provider: "none",
    query: trimmed,
    text: [
      "=== ИНТЕРНЕТ (web search) ===",
      "Провайдеры поиска не вернули результат.",
    ].join("\n"),
    hits: [],
    error: "NO_PROVIDER_RESULT",
  };
}
