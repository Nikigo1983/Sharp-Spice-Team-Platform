"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import styles from "./ClientAiPanel.module.css";

const PRESETS = [
  "Покажи краткое резюме клиента",
  "Какие документы ещё нужны клиенту?",
  "Подготовь сообщение клиенту",
  "Подготовь follow-up после консультации",
  "Есть ли риски по этому кейсу?",
  "Какая программа подходит клиенту лучше всего?",
  "Сравни Испанию и Хорватию для этого клиента",
  "Подготовь коммерческое предложение",
  "Сделай краткий отчёт для менеджера",
];

type PanelState = {
  open: boolean;
  mode: "chat" | "summary";
};

type ClientAiPanelProps = {
  clientId: string;
  clientName: string;
  state: PanelState;
  onClose: () => void;
};

export function ClientAiPanel({
  clientId,
  clientName,
  state,
  onClose,
}: ClientAiPanelProps) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendAi(
    userMessage: string,
    mode: "chat" | "summary" = "chat",
  ) {
    setLoading(true);
    setReply("");
    try {
      const res = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage, mode }),
        },
      );
      const data = (await res.json()) as { reply?: string; error?: string };
      setReply(data.reply ?? data.error ?? "Не удалось получить ответ AI.");
    } catch {
      setReply("Ошибка соединения с AI.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (state.open && state.mode === "summary") {
      void sendAi("", "summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.mode, clientId]);

  if (!state.open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>
              {state.mode === "summary" ? "AI Summary" : "AI по клиенту"}
            </h2>
            <p className={styles.subtitle}>
              Контекст: <strong>{clientName}</strong> — анкеты, документы и
              заметки подключены автоматически
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className={styles.presets}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={styles.preset}
              disabled={loading}
              onClick={() => {
                setMessage(preset);
                void sendAi(preset, "chat");
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className={styles.inputRow}>
          <input
            type="text"
            className={styles.input}
            placeholder='Например: "Напиши сообщение"'
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) void sendAi(message, "chat");
            }}
          />
          <Button
            type="button"
            disabled={loading || !message.trim()}
            onClick={() => void sendAi(message, "chat")}
          >
            {loading ? "…" : "Отправить"}
          </Button>
        </div>

        <div className={styles.reply}>
          {loading ? (
            <p className={styles.loading}>AI думает…</p>
          ) : reply ? (
            <pre className={styles.replyText}>{reply}</pre>
          ) : (
            <p className={styles.hint}>
              Выберите подсказку или напишите запрос — AI уже знает, какой
              клиент открыт.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export function ClientAiActions({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [panel, setPanel] = useState<PanelState>({ open: false, mode: "chat" });

  return (
    <>
      <div className={styles.triggers}>
        <Button
          type="button"
          onClick={() => setPanel({ open: true, mode: "chat" })}
        >
          🤖 Спросить AI по клиенту
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPanel({ open: true, mode: "summary" })}
        >
          📋 AI Summary
        </Button>
      </div>
      <ClientAiPanel
        clientId={clientId}
        clientName={clientName}
        state={panel}
        onClose={() => setPanel({ ...panel, open: false })}
      />
    </>
  );
}
