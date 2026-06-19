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
import { ChatFileMessage, CHAT_DOCUMENT_ACCEPT } from "./ChatFileMessage";
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

type PendingAttachment = {
  file: File;
  kind: "image" | "file";
  previewUrl: string | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TeamChatView({
  user,
  initialMessages,
  initialLatestCreatedAt,
  initialHasMoreBefore,
}: TeamChatViewProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
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

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) {
        URL.revokeObjectURL(pendingAttachment.previewUrl);
      }
    };
  }, [pendingAttachment?.previewUrl]);

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

  function clearPendingAttachment() {
    setPendingAttachment((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function stageAttachment(file: File) {
    if (sending || voiceRecorder.state !== "idle") return;

    const kind = file.type.startsWith("image/") ? "image" : "file";
    const previewUrl = kind === "image" ? URL.createObjectURL(file) : null;

    setPendingAttachment((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { file, kind, previewUrl };
    });

    if (imageInputRef.current) imageInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSendImage(file: File, caption = "") {
    setError(null);
    setSending(true);
    try {
      const formData = new FormData();
      const fallbackName = file.name?.trim() || "pasted-image.png";
      formData.append("image", file, fallbackName);
      const trimmedCaption = caption.trim();
      if (trimmedCaption) formData.append("text", trimmedCaption);

      const res = await fetch("/api/team-chat/image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Не удалось отправить изображение.");
        return false;
      }

      const data = (await res.json()) as { message: TeamChatMessage };
      await appendMessage(data.message);
      setToast({ text: "Изображение отправлено." });
      return true;
    } finally {
      setSending(false);
    }
    return false;
  }

  async function handleSendFile(file: File, caption = "") {
    setError(null);
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name || "file");
      const trimmedCaption = caption.trim();
      if (trimmedCaption) formData.append("text", trimmedCaption);

      const res = await fetch("/api/team-chat/file", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Не удалось отправить файл.");
        return false;
      }

      const data = (await res.json()) as { message: TeamChatMessage };
      await appendMessage(data.message);
      setToast({ text: "Файл отправлен." });
      return true;
    } finally {
      setSending(false);
    }
    return false;
  }

  function handlePickAttachment(file: File) {
    stageAttachment(file);
  }

  function handlePasteImage(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (sending || voiceRecorder.state !== "idle") return;
    const image = extractImageFromClipboard(e.clipboardData);
    if (!image) return;
    e.preventDefault();
    stageAttachment(image);
  }

  async function handleSendPendingAttachment(caption: string) {
    if (!pendingAttachment) return false;

    const { file, kind } = pendingAttachment;
    const sent =
      kind === "image"
        ? await handleSendImage(file, caption)
        : await handleSendFile(file, caption);

    if (sent) {
      clearPendingAttachment();
      setComposerText("");
    }

    return sent;
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

    if (pendingAttachment) {
      if (text.length > 5000) {
        setError("Подпись слишком длинная (макс. 5000 символов).");
        return;
      }
      await handleSendPendingAttachment(text);
      return;
    }

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

  function renderMessageBody(message: TeamChatMessage) {
    const caption = message.message_text?.trim();

    if (message.message_type === "voice" && message.audio_url) {
      return (
        <VoiceMessageAudio
          src={message.audio_url}
          durationMs={message.audio_duration_ms}
        />
      );
    }

    if (message.message_type === "image" && message.image_url) {
      return (
        <>
          <ChatImageMessage src={message.image_url} />
          {caption ? <p className={styles.messageText}>{caption}</p> : null}
        </>
      );
    }

    if (message.message_type === "file" && message.file_url) {
      return (
        <>
          <ChatFileMessage
            src={message.file_url}
            fileName={message.file_name ?? "Файл"}
            fileSize={message.file_size}
            contentType={message.file_content_type}
          />
          {caption ? <p className={styles.messageText}>{caption}</p> : null}
        </>
      );
    }

    return <p className={styles.messageText}>{message.message_text}</p>;
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
                {renderMessageBody(message)}
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
            {pendingAttachment ? (
              <div className={styles.attachmentPreview}>
                {pendingAttachment.kind === "image" &&
                pendingAttachment.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pendingAttachment.previewUrl}
                    alt=""
                    className={styles.attachmentThumb}
                  />
                ) : (
                  <span className={styles.attachmentFileIcon} aria-hidden>
                    📎
                  </span>
                )}
                <div className={styles.attachmentInfo}>
                  <span className={styles.attachmentName}>
                    {pendingAttachment.file.name || "Вложение"}
                  </span>
                  <span className={styles.attachmentMeta}>
                    {pendingAttachment.kind === "image"
                      ? "Изображение"
                      : "Файл"}{" "}
                    · {formatBytes(pendingAttachment.file.size)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className={styles.attachmentRemove}
                  disabled={sending || voiceRecorder.state === "uploading"}
                  onClick={clearPendingAttachment}
                  aria-label="Убрать вложение"
                >
                  ×
                </Button>
              </div>
            ) : null}
            <textarea
              className={styles.composerInput}
              placeholder={
                pendingAttachment
                  ? "Подпись к вложению (необязательно)…"
                  : "Сообщение… Ctrl+V — скриншот, 📎 — файл"
              }
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
                ref={fileInputRef}
                type="file"
                accept={CHAT_DOCUMENT_ACCEPT}
                className={styles.hiddenInput}
                disabled={sending || voiceRecorder.state === "uploading"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePickAttachment(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className={styles.micBtn}
                disabled={sending || voiceRecorder.state === "uploading"}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Прикрепить файл"
                title="PDF, Word, Excel и др."
              >
                📎
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className={styles.hiddenInput}
                disabled={sending || voiceRecorder.state === "uploading"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) stageAttachment(file);
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
                disabled={
                  sending ||
                  voiceRecorder.state === "uploading" ||
                  Boolean(pendingAttachment)
                }
                onClick={() => void handleToggleVoiceRecording()}
                aria-label="Записать голосовое сообщение"
                title="Голосовое сообщение"
              >
                🎤
              </Button>
              <Button
                type="button"
                disabled={
                  sending ||
                  voiceRecorder.state === "uploading" ||
                  (!pendingAttachment && !composerText.trim())
                }
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
          Прикрепите файл или скриншот, добавьте подпись и нажмите «Отправить» — всё
          уйдёт одним сообщением. Ctrl+V — вставить скриншот. 📎 — документы до 25 МБ.
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
