"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

import type {
  WorkspaceChatTurn,
  WorkspaceResponseMode,
} from "@/lib/ai/workspace-assistant";

import type {

  WorkspaceChatSession,

  WorkspaceChatSummary,

} from "@/lib/ai/workspace-chat-types";



import styles from "./AiWorkspaceView.module.css";



const PRESETS = [

  {

    icon: "fa-users",

    label: "Клиенты в работе",

    text: "Сколько клиентов сейчас в работе и на каких этапах?",

  },

  {

    icon: "fa-clipboard-list",

    label: "Анкеты Formgrid",

    text: "Покажи последние заявки из анкеты Formgrid",

  },

  {

    icon: "fa-calendar-check",

    label: "Риски по букингу",

    text: "Есть ли риски по клиентам с ближайшим букингом?",

  },

  {

    icon: "fa-book",

    label: "База знаний",

    text: "Сравни требования по программам из базы знаний",

  },

  {

    icon: "fa-passport",

    label: "Digital Nomad",

    text: "Какие документы нужны для Digital Nomad в Хорватии?",

  },

  {

    icon: "fa-list-check",

    label: "Чек-лист клиента",

    text: "Подготовь чек-лист для нового клиента из анкеты",

  },

];



const DEFAULT_SOURCES = ["Knowledge Base", "Клиенты", "Formgrid"];

const RESPONSE_MODES: {
  id: WorkspaceResponseMode;
  label: string;
  icon: string;
}[] = [
  { id: "brief", label: "Кратко", icon: "fa-bolt" },
  { id: "detailed", label: "Подробно", icon: "fa-list" },
  { id: "client-text", label: "Текст клиенту", icon: "fa-message" },
  {
    id: "case-analysis",
    label: "Анализ кейса",
    icon: "fa-magnifying-glass-chart",
  },
];

const MODE_STORAGE_KEY = "ai-workspace-response-mode";



type ChatEntry = WorkspaceChatTurn;



function formatChatDate(iso: string): string {

  try {

    return new Date(iso).toLocaleString("ru-RU", {

      day: "2-digit",

      month: "2-digit",

      hour: "2-digit",

      minute: "2-digit",

    });

  } catch {

    return "";

  }

}



export function AiWorkspaceView() {

  const [message, setMessage] = useState("");

  const [history, setHistory] = useState<ChatEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<
    "context" | "generating" | null
  >(null);

  const [sources, setSources] = useState<string[]>([]);

  const [demo, setDemo] = useState(false);

  const [chatList, setChatList] = useState<WorkspaceChatSummary[]>([]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [chatLimit, setChatLimit] = useState(100);

  const [listLoading, setListLoading] = useState(true);

  const [mounted, setMounted] = useState(false);
  const [responseMode, setResponseMode] =
    useState<WorkspaceResponseMode>("brief");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);



  useEffect(() => {

    setMounted(true);

    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
      if (
        savedMode === "brief" ||
        savedMode === "detailed" ||
        savedMode === "client-text" ||
        savedMode === "case-analysis"
      ) {
        setResponseMode(savedMode);
      }
    }

  }, []);



  const persistChat = useCallback(

    async (chatId: string, messages: ChatEntry[]) => {

      await fetch(`/api/ai-workspace/chats/${encodeURIComponent(chatId)}`, {

        method: "PUT",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ messages }),

      });

    },

    [],

  );



  const refreshChatList = useCallback(async () => {

    const res = await fetch("/api/ai-workspace/chats");

    if (!res.ok) return;

    const data = (await res.json()) as {

      chats?: WorkspaceChatSummary[];

      limit?: number;

    };

    setChatList(data.chats ?? []);

    if (data.limit) setChatLimit(data.limit);

  }, []);



  const loadChat = useCallback(async (chatId: string) => {

    const res = await fetch(

      `/api/ai-workspace/chats/${encodeURIComponent(chatId)}`,

    );

    if (!res.ok) return;

    const data = (await res.json()) as { chat?: WorkspaceChatSession };

    setActiveChatId(chatId);

    setHistory(data.chat?.messages ?? []);

    setSources([]);

    setDemo(false);

    if (typeof window !== "undefined") {

      localStorage.setItem("ai-workspace-active-chat", chatId);

    }

  }, []);



  const startNewChat = useCallback(async () => {

    const res = await fetch("/api/ai-workspace/chats", { method: "POST" });

    if (!res.ok) return;

    const data = (await res.json()) as { chat?: WorkspaceChatSession };

    if (!data.chat) return;

    setActiveChatId(data.chat.id);

    setHistory([]);

    setSources([]);

    setDemo(false);

    setMessage("");

    if (typeof window !== "undefined") {

      localStorage.setItem("ai-workspace-active-chat", data.chat.id);

    }

    await refreshChatList();

    requestAnimationFrame(() => inputRef.current?.focus());

  }, [refreshChatList]);



  useEffect(() => {

    async function init() {

      setListLoading(true);

      try {

        const res = await fetch("/api/ai-workspace/chats");

        if (!res.ok) {

          await startNewChat();

          return;

        }

        const data = (await res.json()) as {

          chats?: WorkspaceChatSummary[];

          limit?: number;

        };

        const chats = data.chats ?? [];

        setChatList(chats);

        if (data.limit) setChatLimit(data.limit);



        const savedId =

          typeof window !== "undefined"

            ? localStorage.getItem("ai-workspace-active-chat")

            : null;

        const targetId =

          savedId && chats.some((c) => c.id === savedId)

            ? savedId

            : chats[0]?.id;



        if (targetId) {

          await loadChat(targetId);

        } else {

          await startNewChat();

        }

      } finally {

        setListLoading(false);

      }

    }

    void init();

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);



  function selectResponseMode(mode: WorkspaceResponseMode) {
    setResponseMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  }

  async function consumeSseResponse(
    res: Response,
    chatId: string,
    nextHistory: ChatEntry[],
  ): Promise<ChatEntry[]> {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No stream body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
    let streamSources: string[] = [];
    let streamDemo = false;
    let metaReceived = false;

    const streamingHistory: ChatEntry[] = [
      ...nextHistory,
      { role: "assistant", content: "" },
    ];
    setHistory(streamingHistory);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const lines = chunk.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event:"));
        const dataLine = lines.find((line) => line.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const event = eventLine.slice(6).trim();
        const rawData = dataLine.slice(5).trim();
        if (!rawData) continue;

        if (event === "status") {
          const payload = JSON.parse(rawData) as { phase?: "context" | "generating" };
          if (payload.phase) {
            setLoadingPhase(payload.phase);
          }
          continue;
        }

        if (event === "meta") {
          const meta = JSON.parse(rawData) as {
            sources?: string[];
            demo?: boolean;
          };
          streamSources = meta.sources ?? [];
          streamDemo = Boolean(meta.demo);
          metaReceived = true;
          setSources(streamSources);
          setDemo(streamDemo);
          setLoading(false);
          continue;
        }

        if (event === "delta") {
          const payload = JSON.parse(rawData) as { content?: string };
          if (payload.content) {
            reply += payload.content;
            setLoading(false);
            setHistory([
              ...nextHistory,
              { role: "assistant", content: reply },
            ]);
          }
          continue;
        }

        if (event === "error") {
          const payload = JSON.parse(rawData) as { message?: string };
          reply =
            payload.message ??
            "Ошибка при обращении к AI. Попробуйте ещё раз.";
          setHistory([
            ...nextHistory,
            { role: "assistant", content: reply },
          ]);
        }
      }
    }

    if (!metaReceived && !reply) {
      reply = "Не удалось получить ответ. Попробуйте ещё раз.";
      setHistory([...nextHistory, { role: "assistant", content: reply }]);
    }

    const finalHistory: ChatEntry[] = [
      ...nextHistory,
      { role: "assistant", content: reply },
    ];
    await persistChat(chatId, finalHistory);
    return finalHistory;
  }

  async function send(userMessage: string) {

    const trimmed = userMessage.trim();

    if (!trimmed || loading) return;



    let chatId = activeChatId;

    if (!chatId) {

      const res = await fetch("/api/ai-workspace/chats", { method: "POST" });

      const data = (await res.json()) as { chat?: WorkspaceChatSession };

      chatId = data.chat?.id ?? null;

      if (!chatId) return;

      setActiveChatId(chatId);

    }



    setLoading(true);
    setLoadingPhase("context");

    setMessage("");

    const nextHistory: ChatEntry[] = [

      ...history,

      { role: "user", content: trimmed },

    ];

    setHistory(nextHistory);

    void persistChat(chatId, nextHistory);



    try {

      const res = await fetch("/api/ai-workspace", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          message: trimmed,

          history: history.slice(-4),

          mode: responseMode,

        }),

      });



      if (!res.ok) throw new Error("fetch failed");



      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        await consumeSseResponse(res, chatId, nextHistory);
        await refreshChatList();
        return;
      }



      const data = (await res.json()) as {

        reply?: string;

        sources?: string[];

        demo?: boolean;

      };



      const reply =

        data.reply ?? "Не удалось получить ответ. Попробуйте ещё раз.";

      setSources(data.sources ?? []);

      setDemo(Boolean(data.demo));

      const finalHistory: ChatEntry[] = [

        ...nextHistory,

        { role: "assistant", content: reply },

      ];

      setHistory(finalHistory);

      await persistChat(chatId, finalHistory);

      await refreshChatList();

    } catch {

      const finalHistory: ChatEntry[] = [

        ...nextHistory,

        {

          role: "assistant",

          content:

            "Ошибка при обращении к AI. Проверьте, что сервер запущен, и обновите страницу.",

        },

      ];

      setHistory(finalHistory);

      await persistChat(chatId, finalHistory);

    } finally {

      setLoading(false);
      setLoadingPhase(null);

      requestAnimationFrame(() => {

        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

      });

    }

  }



  async function removeChat(chatId: string) {

    if (!confirm("Удалить этот чат?")) return;

    await fetch(`/api/ai-workspace/chats/${encodeURIComponent(chatId)}`, {

      method: "DELETE",

    });

    if (activeChatId === chatId) {

      setActiveChatId(null);

      setHistory([]);

      await startNewChat();

    } else {

      await refreshChatList();

    }

  }



  const activeSources = sources.length > 0 ? sources : DEFAULT_SOURCES;

  const isEmpty = history.length === 0 && !loading;



  return (

    <div className={styles.wrap}>

      <div className={styles.workspace}>

        <section className={styles.historyBar}>

          <div className={styles.historyHead}>

            <div className={styles.historyHeadLeft}>

              <span className={styles.historyTitle}>

                <i className="fa-solid fa-clock-rotate-left" aria-hidden />

                История

              </span>

              <span className={styles.chatCount}>

                {mounted ? `${chatList.length}/${chatLimit}` : "…"}

              </span>

            </div>

            <Button

              type="button"

              className={styles.newChatBtn}

              onClick={() => void startNewChat()}

            >

              <i className="fa-solid fa-plus" aria-hidden />

              Новый чат

            </Button>

          </div>



          <div className={styles.historyScroll}>

            {!mounted || listLoading ? (

              <p className={styles.historyEmpty}>Загрузка…</p>

            ) : chatList.length === 0 ? (

              <p className={styles.historyEmpty}>Нет сохранённых чатов</p>

            ) : (

              chatList.map((chat) => (

                <div

                  key={chat.id}

                  role="button"

                  tabIndex={0}

                  className={

                    chat.id === activeChatId

                      ? styles.chatChipActive

                      : styles.chatChip

                  }

                  onClick={() => void loadChat(chat.id)}

                  onKeyDown={(e) => {

                    if (e.key === "Enter" || e.key === " ") {

                      e.preventDefault();

                      void loadChat(chat.id);

                    }

                  }}

                >

                  <span className={styles.chatChipTitle}>{chat.title}</span>

                  <span className={styles.chatChipMeta}>

                    {mounted ? formatChatDate(chat.updatedAt) : "…"} ·{" "}

                    {chat.messageCount} сообщ.

                  </span>

                  <button

                    type="button"

                    className={styles.chatChipDelete}

                    aria-label="Удалить чат"

                    onClick={(e) => {

                      e.stopPropagation();

                      void removeChat(chat.id);

                    }}

                  >

                    ×

                  </button>

                </div>

              ))

            )}

          </div>

        </section>



        <section className={styles.panel}>

          <header className={styles.panelHead}>

            <div className={styles.panelTitleWrap}>

              <h2 className={styles.panelTitle}>

                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />

                AI Assistant

              </h2>

              <p className={styles.panelSubtitle}>KB · Клиенты · Formgrid</p>

            </div>

            <div className={styles.sourceRow}>

              {activeSources.map((source) => (

                <span key={source} className={styles.sourceBadge}>

                  {source}

                </span>

              ))}

            </div>

          </header>



          {demo ? (

            <p className={styles.demoNote}>

              <i className="fa-solid fa-triangle-exclamation" aria-hidden />

              Ответ без AI-модели — проверьте AI_WORKSPACE_MODEL или лимиты OpenRouter.

            </p>

          ) : null}



          <div className={styles.chatViewport}>

            {isEmpty ? (

              <div className={styles.welcome}>

                <div className={styles.welcomeIcon} aria-hidden>

                  <i className="fa-solid fa-wand-magic-sparkles" />

                </div>

                <h3 className={styles.welcomeTitle}>

                  Чем помочь команде сегодня?

                </h3>

                <p className={styles.welcomeText}>

                  Спросите про клиентов, анкеты или документы из базы знаний.

                </p>

                <div className={styles.presetGrid}>

                  {PRESETS.map((preset) => (

                    <button

                      key={preset.text}

                      type="button"

                      className={styles.presetCard}

                      disabled={loading}

                      onClick={() => void send(preset.text)}

                    >

                      <i className={`fa-solid ${preset.icon}`} aria-hidden />

                      <span>{preset.label}</span>

                    </button>

                  ))}

                </div>

              </div>

            ) : (

              <div className={styles.messages}>

                {history.map((entry, index) => (

                  <div

                    key={`${index}-${entry.role}`}

                    className={

                      entry.role === "user"

                        ? styles.msgRowUser

                        : styles.msgRowAssistant

                    }

                  >

                    <div

                      className={

                        entry.role === "user"

                          ? styles.msgAvatarUser

                          : styles.msgAvatarAi

                      }

                      aria-hidden

                    >

                      {entry.role === "user" ? (

                        <i className="fa-solid fa-user" />

                      ) : (

                        <i className="fa-solid fa-wand-magic-sparkles" />

                      )}

                    </div>

                    <div

                      className={

                        entry.role === "user"

                          ? styles.msgUser

                          : styles.msgAssistant

                      }

                    >

                      {entry.content}

                    </div>

                  </div>

                ))}

                {loading ? (

                  <div className={styles.typingRow}>

                    <div className={styles.msgAvatarAi} aria-hidden>

                      <i className="fa-solid fa-wand-magic-sparkles" />

                    </div>

                    <div className={styles.typingBubble}>

                      <span className={styles.typingDot} />

                      <span className={styles.typingDot} />

                      <span className={styles.typingDot} />

                      <span className={styles.typingText}>
                        {loadingPhase === "generating"
                          ? "Формулирую ответ…"
                          : "Собираю данные…"}
                      </span>

                    </div>

                  </div>

                ) : null}

                <div ref={messagesEndRef} />

              </div>

            )}

          </div>



          <footer className={styles.composer}>

            <div
              className={styles.modeRow}
              role="group"
              aria-label="Режим ответа"
            >
              {RESPONSE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={
                    responseMode === mode.id
                      ? styles.modeChipActive
                      : styles.modeChip
                  }
                  disabled={loading}
                  onClick={() => selectResponseMode(mode.id)}
                >
                  <i className={`fa-solid ${mode.icon}`} aria-hidden />
                  {mode.label}
                </button>
              ))}
            </div>

            <div className={styles.composerRow}>
              <input

                ref={inputRef}

                type="text"

                className={styles.input}

                placeholder="Спросите про клиента, анкету или документ…"

                value={message}

                disabled={loading}

                onChange={(e) => setMessage(e.target.value)}

                onKeyDown={(e) => {

                  if (e.key === "Enter") void send(message);

                }}

              />

              <Button

                type="button"

                className={styles.sendBtn}

                disabled={loading || !message.trim()}

                onClick={() => void send(message)}

              >

                <i className="fa-solid fa-paper-plane" aria-hidden />

              </Button>
            </div>

          </footer>

        </section>

      </div>

    </div>

  );

}

