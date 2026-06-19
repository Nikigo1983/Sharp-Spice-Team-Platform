"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import type { SessionUser } from "@/lib/auth/types";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type { PresenceMap } from "@/lib/presence/types";
import type { TeamChatMessage } from "@/lib/team-chat/types";
import { formatTeamChatDateTime, formatVoiceDuration } from "@/lib/team-chat/format";
import { Button } from "@/components/ui/Button";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { VoiceMessageAudio } from "./VoiceMessageAudio";
import { ChatImageMessage } from "./ChatImageMessage";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Toast, type ToastMessage } from "@/components/tasks/Toast";
import styles from "./TeamChatView.module.css";

type TeamChatViewProps = {
  user: SessionUser;
  initialMessages: TeamChatMessage[];
  initialLatestCreatedAt: string | null;
  initialHasMoreBefore: boolean;
};

export function TeamChatView({
  user,
  initialMessages,
  initialLatestCreatedAt,
  initialHasMoreBefore,
}: TeamChatViewProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const skipInitialSearchRef = useRef(true);

  const [messages, setMessages] = useState<TeamChatMessage[]>(initialMessages);
  const [latestCreatedAt, setLatestCreatedAt] = useState<string | null>(
    initialLatestCreatedAt,
  );
  const [hasMoreBefore, setHasMoreBefore] = useState(initialHasMoreBefore);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const voiceRecorder = useVoiceRecorder();

  const [deleteTarget, setDeleteTarget] = useState<TeamChatMessage | null>(
    null,
  );
  const [clearOpen, setClearOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceMap>({});

  const isOwner = user.role === "owner";

  const canDeleteMessage = useMemo(() => {
    return (message: TeamChatMessage) =>
      isOwner || message.user_id === user.id;
  }, [isOwner, user.id]);

  const pendingPrependAdjustment = useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!pendingPrependAdjustment.current) return;
    const el = listRef.current;
    const adj = pendingPrependAdjustment.current;
    pendingPrependAdjustment.current = null;
    if (!el) return;

    const nextScrollHeight = el.scrollHeight;
    const delta = nextScrollHeight - adj.prevScrollHeight;
    el.scrollTop = adj.prevScrollTop + delta;
  }, [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    async function fetchPresence() {
      try {
        const res = await fetch("/api/presence");
        if (!res.ok) return;
        const data = (await res.json()) as { presence?: PresenceMap };
        setPresence(data.presence ?? {});
      } catch {
        // ignore
      }
    }

    void fetchPresence();
    const interval = setInterval(() => {
      void fetchPresence();
    }, PRESENCE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function fetchInitialOrReset() {
    const res = await fetch("/api/team-chat?limit=100");
    if (!res.ok) return;
    const data = (await res.json()) as {
      messages: TeamChatMessage[];
      hasMoreBefore: boolean;
      latestCreatedAt: string | null;
    };
    setMessages(data.messages);
    setLatestCreatedAt(data.latestCreatedAt);
    setHasMoreBefore(data.hasMoreBefore);
  }

  async function fetchOlder() {
    if (loadingOlder || !hasMoreBefore) return;
    const earliest = messages[0];
    if (!earliest) return;

    const el = listRef.current;
    pendingPrependAdjustment.current = {
      prevScrollHeight: el?.scrollHeight ?? 0,
      prevScrollTop: el?.scrollTop ?? 0,
    };

    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/team-chat?before=${encodeURIComponent(
          earliest.created_at,
        )}&limit=100`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: TeamChatMessage[];
        hasMoreBefore: boolean;
      };

      if (!data.messages.length) {
        setHasMoreBefore(false);
        return;
      }

      setMessages((prev) => [...data.messages, ...prev]);
      setHasMoreBefore(data.hasMoreBefore);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function fetchNewer() {
    if (searchQuery.trim() || !latestCreatedAt) return;

    const res = await fetch(
      `/api/team-chat?after=${encodeURIComponent(latestCreatedAt)}&limit=50`,
    );
    if (!res.ok) return;

    const data = (await res.json()) as {
      messages: TeamChatMessage[];
      latestCreatedAt: string | null;
    };

    if (!data.messages.length) return;

    setMessages((prev) => {
      const map = new Map(prev.map((message) => [message.id, message]));
      for (const message of data.messages) {
        map.set(message.id, message);
      }
      return Array.from(map.values()).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
    });
    setLatestCreatedAt(
      data.latestCreatedAt ?? data.messages.at(-1)?.created_at ?? null,
    );

    const el = listRef.current;
    if (el) {
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      if (distance < 160) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
  }

  useEffect(() => {
    if (!latestCreatedAt || searchQuery.trim()) return;
    const timer = setInterval(() => {
      void fetchNewer();
    }, 5000);
    return () => clearInterval(timer);
  }, [latestCreatedAt, searchQuery]);

  useEffect(() => {
    if (skipInitialSearchRef.current) {
      skipInitialSearchRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        const q = searchQuery.trim();
        if (!q) {
          await fetchInitialOrReset();
          return;
        }

        const res = await fetch(
          `/api/team-chat?q=${encodeURIComponent(q)}&limit=100`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: TeamChatMessage[];
          latestCreatedAt: string | null;
        };
        setMessages(data.messages);
        setLatestCreatedAt(data.latestCreatedAt);
        setHasMoreBefore(false);
      })();
    }, 420);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function appendMessage(message: TeamChatMessage) {
    setMessages((prev) => [...prev, message]);
    setLatestCreatedAt(message.created_at);
    const el = listRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  function extractImageFromClipboard(clipboardData: DataTransfer): File | null {
    for (const item of clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    return null;
  }

  async function handleSendImage(file: File) {
    setError(null);
    setSending(true);
    try {
      const formData = new FormData();
      const fallbackName = file.name?.trim() || "pasted-image.png";
      formData.append("image", file, fallbackName);

      const res = await fetch("/api/team-chat/image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Не удалось отправить изображение.");
        return;
      }

      const data = (await res.json()) as { message: TeamChatMessage };
      await appendMessage(data.message);
      setToast({ text: "Изображение отправлено." });
    } finally {
      setSending(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function handlePasteImage(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (sending || voiceRecorder.state !== "idle") return;
    const image = extractImageFromClipboard(e.clipboardData);
    if (!image) return;
    e.preventDefault();
    void handleSendImage(image);
  }

  async function handleSendVoice() {
    setError(null);
    voiceRecorder.clearError();

    const recording = await voiceRecorder.stopAndGetBlob();
    if (!recording) {
      setError("Не удалось записать голосовое сообщение.");
      return;
    }

    voiceRecorder.setUploading(true);
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("audio", recording.blob, "voice-message.webm");
      formData.append("duration_ms", String(Math.round(recording.durationMs)));

      const res = await fetch("/api/team-chat/voice", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Не удалось отправить голосовое сообщение.");
        return;
      }

      const data = (await res.json()) as { message: TeamChatMessage };
      await appendMessage(data.message);
      setToast({ text: "Голосовое сообщение отправлено." });
    } finally {
      voiceRecorder.setUploading(false);
      setSending(false);
    }
  }

  async function handleToggleVoiceRecording() {
    setError(null);
    voiceRecorder.clearError();

    if (voiceRecorder.state === "recording") {
      await handleSendVoice();
      return;
    }

    if (voiceRecorder.state !== "idle" || sending) return;
    await voiceRecorder.startRecording();
  }

  async function handleSend() {
    setError(null);
    const text = composerText.trim();
    if (!text) {
      setError("Введите текст сообщения.");
      return;
    }
    if (text.length > 5000) {
      setError("Сообщение слишком длинное (макс. 5000 символов).");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/team-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError("Не удалось отправить сообщение.");
        return;
      }

      const data = (await res.json()) as { message: TeamChatMessage };
      setComposerText("");
      await appendMessage(data.message);
      setToast({ text: "Сообщение отправлено." });
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const res = await fetch(`/api/team-chat/${encodeURIComponent(targetId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setToast({ text: "Не удалось удалить сообщение.", type: "error" });
      return;
    }

    setDeleteTarget(null);
    setMessages((prev) => {
      const next = prev.filter((message) => message.id !== targetId);
      setLatestCreatedAt(next.at(-1)?.created_at ?? null);
      return next;
    });
    setToast({ text: "Сообщение удалено." });
  }

  async function confirmClear() {
    const res = await fetch("/api/team-chat/clear", { method: "POST" });
    if (!res.ok) {
      setToast({ text: "Не удалось очистить чат.", type: "error" });
      return;
    }

    setClearOpen(false);
    setMessages([]);
    setLatestCreatedAt(null);
    setHasMoreBefore(false);
    setToast({ text: "Чат очищен." });
  }

  function onScroll() {
    if (searchQuery.trim()) return;
    const el = listRef.current;
    if (!el || loadingOlder || !hasMoreBefore) return;
    if (el.scrollTop < 40) {
      void fetchOlder();
    }
  }

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title="Командный чат"
        subtitle="Внутреннее пространство для общения команды Sharp & Spice"
        action={
          isOwner ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setClearOpen(true)}
            >
              Очистить чат
            </Button>
          ) : null
        }
      />

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          placeholder="Поиск по тексту и автору…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className={styles.list} ref={listRef} onScroll={onScroll}>
        {loadingOlder && !searchQuery.trim() ? (
          <p className={styles.loading}>Загрузка старых сообщений…</p>
        ) : null}

        {messages.map((message) => {
          const showDelete = canDeleteMessage(message);
          return (
            <div key={message.id} className={styles.messageWrap}>
              <Card className={styles.messageCard}>
                <div className={styles.messageTop}>
                  <div className={styles.messageUser}>
                    <span className={styles.messageUserRow}>
                      {message.user_name}
                      <OnlineIndicator
                        online={Boolean(presence[message.user_id]?.isOnline)}
                      />
                    </span>
                  </div>
                  {showDelete ? (
                    <Button
                      type="button"
                      variant="danger"
                      className={styles.deleteBtn}
                      onClick={() => setDeleteTarget(message)}
                    >
                      🗑 Удалить
                    </Button>
                  ) : null}
                </div>
                <div className={styles.messageTime}>
                  {formatTeamChatDateTime(message.created_at)}
                </div>
                {message.message_type === "voice" && message.audio_url ? (
                  <VoiceMessageAudio
                    src={message.audio_url}
                    durationMs={message.audio_duration_ms}
                  />
                ) : message.message_type === "image" && message.image_url ? (
                  <ChatImageMessage src={message.image_url} />
                ) : (
                  <p className={styles.messageText}>{message.message_text}</p>
                )}
              </Card>
            </div>
          );
        })}

        {!messages.length && !loadingOlder ? (
          <p className={styles.empty}>Пока нет сообщений.</p>
        ) : null}
      </div>

      <div className={styles.composer}>
        {voiceRecorder.state === "recording" ? (
          <div className={styles.recordingBar}>
            <span className={styles.recordingDot} aria-hidden />
            <span className={styles.recordingLabel}>
              Запись {formatVoiceDuration(voiceRecorder.elapsedMs)}
            </span>
            <div className={styles.recordingActions}>
              <Button
                type="button"
                variant="secondary"
                disabled={sending}
                onClick={() => voiceRecorder.cancelRecording()}
              >
                Отмена
              </Button>
              <Button
                type="button"
                disabled={sending}
                onClick={() => void handleSendVoice()}
              >
                Отправить
              </Button>
            </div>
          </div>
        ) : (
          <>
            <textarea
              className={styles.composerInput}
              placeholder="Сообщение… Ctrl+V — вставить скриншот"
              value={composerText}
              maxLength={5000}
              rows={2}
              disabled={sending || voiceRecorder.state === "uploading"}
              onChange={(e) => setComposerText(e.target.value)}
              onPaste={handlePasteImage}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <div className={styles.composerActions}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className={styles.hiddenInput}
                disabled={sending || voiceRecorder.state === "uploading"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleSendImage(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className={styles.micBtn}
                disabled={sending || voiceRecorder.state === "uploading"}
                onClick={() => imageInputRef.current?.click()}
                aria-label="Прикрепить изображение"
                title="Изображение"
              >
                🖼
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={styles.micBtn}
                disabled={sending || voiceRecorder.state === "uploading"}
                onClick={() => void handleToggleVoiceRecording()}
                aria-label="Записать голосовое сообщение"
                title="Голосовое сообщение"
              >
                🎤
              </Button>
              <Button
                type="button"
                disabled={sending || voiceRecorder.state === "uploading"}
                onClick={() => void handleSend()}
              >
                {sending || voiceRecorder.state === "uploading"
                  ? "…"
                  : "Отправить"}
              </Button>
            </div>
          </>
        )}
      </div>

      {voiceRecorder.state === "idle" ? (
        <p className={styles.composerHint}>
          Скопируйте скриншот или фото и нажмите Ctrl+V в поле сообщения — оно отправится
          сразу. PNG, JPG, GIF, WebP до 10 МБ.
        </p>
      ) : null}

      {voiceRecorder.error ? (
        <p className={styles.error}>{voiceRecorder.error}</p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {deleteTarget ? (
        <Modal title="Удалить сообщение?" onClose={() => setDeleteTarget(null)}>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void confirmDelete()}
            >
              Удалить
            </Button>
          </div>
        </Modal>
      ) : null}

      {clearOpen ? (
        <Modal title="Вы уверены?" onClose={() => setClearOpen(false)}>
          <p className={styles.confirmText}>
            Это действие нельзя отменить.
          </p>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setClearOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void confirmClear()}
            >
              Очистить чат
            </Button>
          </div>
        </Modal>
      ) : null}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card className={styles.modal}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        {children}
      </Card>
    </div>
  );
}
