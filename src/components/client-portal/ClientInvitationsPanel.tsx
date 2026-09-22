"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createClientInvitationAction,
  deleteClientInvitationAction,
} from "@/app/(app)/client-invitations/actions";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import styles from "./ClientInvitationsPanel.module.css";

export type InvitationRow = {
  id: string;
  email: string;
  firstName: string;
  status: string;
  createdAt: string;
  inviteUrl: string;
};

type CreatedCredentials = {
  invitationId: string;
  firstName: string;
  email: string;
  loginUrl: string;
  temporaryPassword: string;
  emailSent: boolean;
  emailWarning?: string;
};

function buildMessengerInviteText(created: CreatedCredentials): string {
  return [
    `Здравствуйте, ${created.firstName}!`,
    "",
    `Вас пригласили в клиентский портал ${CLIENT_PORTAL_BRAND_NAME}.`,
    "",
    `Ссылка для входа: ${created.loginUrl}`,
    `Email: ${created.email}`,
    `Временный пароль: ${created.temporaryPassword}`,
    "",
    "После входа можно сменить пароль через «Забыли пароль?» на странице входа.",
  ].join("\n");
}

export function ClientInvitationsPanel({
  initialInvitations,
}: {
  initialInvitations: InvitationRow[];
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState<
    "password" | "login" | "message" | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const messengerText = useMemo(
    () => (created ? buildMessengerInviteText(created) : ""),
    [created],
  );

  const whatsAppUrl = messengerText
    ? `https://wa.me/?text=${encodeURIComponent(messengerText)}`
    : null;
  const telegramUrl = messengerText
    ? `https://t.me/share/url?url=${encodeURIComponent(created?.loginUrl ?? "")}&text=${encodeURIComponent(messengerText)}`
    : null;

  function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createClientInvitationAction({ email, firstName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInvitations((prev) => [result.invitation, ...prev]);
      setCreated({
        invitationId: result.invitation.id,
        firstName: result.invitation.firstName,
        email: result.invitation.email,
        loginUrl: result.loginUrl,
        temporaryPassword: result.temporaryPassword,
        emailSent: result.emailSent,
        emailWarning: result.emailWarning,
      });
      setEmail("");
      setFirstName("");
    });
  }

  function onDelete(item: InvitationRow) {
    const ok = window.confirm(
      `Удалить «${item.firstName}» (${item.email}) из списка?\n\nДоступ в клиентский портал будет закрыт. Анкету и загруженные файлы тоже удалим, если они есть.`,
    );
    if (!ok) return;

    setError(null);
    setDeletingId(item.id);
    startTransition(async () => {
      const result = await deleteClientInvitationAction({
        invitationId: item.id,
      });
      setDeletingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInvitations((prev) => prev.filter((row) => row.id !== item.id));
      setCreated((prev) => (prev?.invitationId === item.id ? null : prev));
    });
  }

  async function copyText(
    kind: "password" | "login" | "message",
    value: string,
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Не удалось скопировать.");
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <Link href="/dashboard" className={styles.backLink}>
          ← На платформу
        </Link>
      </div>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Приглашения в клиентский портал</h1>
          <p className={styles.lead}>
            Создайте приглашение — {CLIENT_PORTAL_BRAND_NAME} отправит ссылку и
            временный пароль на email клиента. Сразу после создания ссылка и
            пароль появятся здесь: их можно скопировать и отправить в WhatsApp,
            Telegram или другом мессенджере.
          </p>
          <p className={styles.lead}>
            Приглашение нужно только для первого доступа. После регистрации
            клиент сам управляет паролем через вход в клиентский портал →
            «Забыли пароль?». Сотрудники не сбрасывают пароль клиента.
          </p>
        </div>
        <span className={styles.badge}>Всего: {invitations.length}</span>
      </header>

      <form className={styles.form} onSubmit={onCreate}>
        <label className={styles.label}>
          Имя клиента
          <input
            className={styles.input}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? "Создание…" : "Создать приглашение"}
        </button>
      </form>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className={styles.createdBox} role="status">
          <p className={styles.createdTitle}>
            {created.emailSent
              ? "Приглашение создано и письмо отправлено."
              : "Приглашение создано."}
          </p>
          {created.emailWarning ? (
            <p className={styles.warning}>{created.emailWarning}</p>
          ) : null}
          <p className={styles.meta}>
            Клиент: <strong>{created.firstName}</strong> ·{" "}
            <strong>{created.email}</strong>
          </p>

          <label className={styles.fieldLabel}>
            Ссылка для входа
            <div className={styles.urlRow}>
              <input
                className={styles.urlInput}
                value={created.loginUrl}
                readOnly
                aria-label="Ссылка для входа в клиентский портал"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className={styles.copy}
                onClick={() => void copyText("login", created.loginUrl)}
              >
                {copied === "login" ? "Скопировано" : "Скопировать ссылку"}
              </button>
            </div>
          </label>

          <label className={styles.fieldLabel}>
            Временный пароль
            <div className={styles.urlRow}>
              <input
                className={styles.urlInput}
                value={created.temporaryPassword}
                readOnly
                aria-label="Временный пароль клиента"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className={styles.copy}
                onClick={() =>
                  void copyText("password", created.temporaryPassword)
                }
              >
                {copied === "password" ? "Скопировано" : "Скопировать пароль"}
              </button>
            </div>
          </label>

          <label className={styles.fieldLabel}>
            Текст для мессенджера
            <textarea
              className={styles.invitePreview}
              value={messengerText}
              readOnly
              rows={9}
              aria-label="Готовый текст приглашения для мессенджера"
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>

          <div className={styles.createdActions}>
            <button
              type="button"
              className={styles.copy}
              onClick={() => void copyText("message", messengerText)}
            >
              {copied === "message"
                ? "Текст скопирован"
                : "Скопировать текст приглашения"}
            </button>
            <a
              className={styles.shareButton}
              href={whatsAppUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              В WhatsApp
            </a>
            <a
              className={styles.shareButton}
              href={telegramUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              В Telegram
            </a>
          </div>
        </div>
      ) : null}

      <ul className={styles.list}>
        {invitations.length === 0 ? (
          <li className={styles.empty}>Пока нет приглашений.</li>
        ) : (
          invitations.map((item, index) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.index} aria-hidden="true">
                  {index + 1}.
                </span>
                <div>
                  <strong>{item.firstName}</strong>
                  <div className={styles.meta}>
                    {item.email} · {item.status} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>
              <div className={styles.itemActions}>
                <span className={styles.meta}>Аккаунт создан</span>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  disabled={pending || deletingId === item.id}
                  onClick={() => onDelete(item)}
                >
                  {deletingId === item.id ? "Удаление…" : "Удалить"}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
