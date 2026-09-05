"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClientInvitationAction } from "@/app/(app)/client-invitations/actions";
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
  email: string;
  loginUrl: string;
  temporaryPassword: string;
  emailSent: boolean;
  emailWarning?: string;
};

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
  const [copied, setCopied] = useState<"password" | "login" | null>(null);
  const [pending, startTransition] = useTransition();

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

  async function copyText(kind: "password" | "login", value: string) {
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
            Создайте приглашение — {CLIENT_PORTAL_BRAND_NAME} отправит ссылку и временный
            пароль на email клиента.
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
            Email: <strong>{created.email}</strong>
          </p>
          <div className={styles.createdActions}>
            <button
              type="button"
              className={styles.copy}
              onClick={() => void copyText("login", created.loginUrl)}
            >
              {copied === "login" ? "Ссылка скопирована" : "Скопировать вход"}
            </button>
            <button
              type="button"
              className={styles.copy}
              onClick={() =>
                void copyText("password", created.temporaryPassword)
              }
            >
              {copied === "password"
                ? "Пароль скопирован"
                : "Скопировать временный пароль"}
            </button>
          </div>
          <p className={styles.passwordReveal}>
            Временный пароль: <code>{created.temporaryPassword}</code>
          </p>
        </div>
      ) : null}

      <ul className={styles.list}>
        {invitations.length === 0 ? (
          <li className={styles.empty}>Пока нет приглашений.</li>
        ) : (
          invitations.map((item) => (
            <li key={item.id} className={styles.item}>
              <div>
                <strong>{item.firstName}</strong>
                <div className={styles.meta}>
                  {item.email} · {item.status} ·{" "}
                  {new Date(item.createdAt).toLocaleString("ru-RU")}
                </div>
              </div>
              <span className={styles.meta}>Аккаунт создан</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
