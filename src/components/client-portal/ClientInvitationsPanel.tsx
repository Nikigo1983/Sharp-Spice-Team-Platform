"use client";

import { useMemo, useState, useTransition } from "react";
import { createClientInvitationAction } from "@/app/(app)/client-invitations/actions";
import styles from "./ClientInvitationsPanel.module.css";

export type InvitationRow = {
  id: string;
  email: string;
  firstName: string;
  status: string;
  createdAt: string;
  inviteUrl: string;
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pendingCount = useMemo(
    () => invitations.filter((item) => item.status === "pending").length,
    [invitations],
  );

  function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClientInvitationAction({ email, firstName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInvitations((prev) => [result.invitation, ...prev]);
      setEmail("");
      setFirstName("");
    });
  }

  async function copyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Не удалось скопировать ссылку.");
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Приглашения в клиентский портал</h1>
          <p className={styles.lead}>
            Новый канал для клиентов (как в Spiora). Старый поток Formgrid / App
            Emigrant продолжается отдельно в «Новые клиенты из анкеты».
          </p>
        </div>
        <span className={styles.badge}>Ожидают: {pendingCount}</span>
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
              {item.status === "pending" ? (
                <button
                  type="button"
                  className={styles.copy}
                  onClick={() => void copyLink(item.id, item.inviteUrl)}
                >
                  {copiedId === item.id ? "Скопировано" : "Скопировать ссылку"}
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
