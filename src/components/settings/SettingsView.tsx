"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_LABELS } from "@/lib/auth/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Toast, type ToastMessage } from "@/components/tasks/Toast";
import styles from "./SettingsView.module.css";

type PasswordMember = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager";
  deleted: boolean;
  hasCustomPassword: boolean;
  passwordUpdatedAt: string | null;
  passwordUpdatedBy: string | null;
};

type ResetResult = {
  userName: string;
  email: string;
  password: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SettingsView() {
  const [members, setMembers] = useState<PasswordMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<PasswordMember | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/passwords");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { members?: PasswordMember[] };
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
      setToast({ text: "Не удалось загрузить список команды.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  function openReset(member: PasswordMember) {
    setResetTarget(member);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setResetResult(null);
  }

  function closeReset() {
    setResetTarget(null);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setResetResult(null);
  }

  async function submitReset(generate = false) {
    if (!resetTarget) return;

    if (!generate) {
      if (password !== confirmPassword) {
        setError("Пароли не совпадают.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: resetTarget.id,
          password: generate ? undefined : password,
          generate,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        password?: string;
        userName?: string;
        email?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Не удалось сбросить пароль.");
        return;
      }

      setResetResult({
        userName: data.userName ?? resetTarget.name,
        email: data.email ?? resetTarget.email,
        password: data.password ?? "",
      });
      await fetchMembers();
    } catch {
      setError("Не удалось сбросить пароль.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!resetResult?.password) return;
    try {
      await navigator.clipboard.writeText(resetResult.password);
      setToast({ text: "Пароль скопирован." });
    } catch {
      setToast({ text: "Не удалось скопировать пароль.", type: "error" });
    }
  }

  return (
    <div className={styles.settingsWrap}>
      <Card className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Пароли команды</h2>
        <p className={styles.sectionHint}>
          Сбросьте пароль сотруднику и передайте новый пароль в Telegram или
          WhatsApp. После сброса старый пароль перестаёт работать. Если пароль
          ещё не сбрасывали через эту панель, действует пароль из настроек
          хостинга.
        </p>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Роль</th>
                <th>Пароль в системе</th>
                <th>Обновлён</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Загрузка…</td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <span className={styles.memberName}>{member.name}</span>
                      <div className={styles.memberEmail}>{member.email}</div>
                    </td>
                    <td>{ROLE_LABELS[member.role]}</td>
                    <td>
                      {member.deleted ? (
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>
                          Доступ отключён
                        </span>
                      ) : member.hasCustomPassword ? (
                        <span className={`${styles.badge} ${styles.badgeOk}`}>
                          Сброшен вручную
                        </span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>
                          Из настроек хостинга
                        </span>
                      )}
                    </td>
                    <td className={styles.metaMuted}>
                      {member.hasCustomPassword ? (
                        <>
                          {formatDate(member.passwordUpdatedAt)}
                          {member.passwordUpdatedBy
                            ? ` · ${member.passwordUpdatedBy}`
                            : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={member.deleted}
                        onClick={() => openReset(member)}
                      >
                        Сбросить пароль
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {resetTarget ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.backdrop} onClick={closeReset} aria-hidden />
          <Card className={styles.modal}>
            {resetResult ? (
              <>
                <h3 className={styles.modalTitle}>Новый пароль готов</h3>
                <p className={styles.modalText}>
                  Передайте пароль сотруднику{" "}
                  <strong>{resetResult.userName}</strong> ({resetResult.email}).
                  После закрытия окна он больше не отобразится.
                </p>
                <div className={styles.passwordReveal}>
                  <span>Новый пароль</span>
                  <code className={styles.passwordValue}>
                    {resetResult.password}
                  </code>
                </div>
                <p className={styles.warning}>
                  Сохраните пароль сейчас — повторно его посмотреть нельзя.
                </p>
                <div className={styles.modalActions}>
                  <Button type="button" variant="secondary" onClick={closeReset}>
                    Закрыть
                  </Button>
                  <Button type="button" onClick={() => void copyPassword()}>
                    Скопировать
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className={styles.modalTitle}>
                  Сброс пароля: {resetTarget.name}
                </h3>
                <p className={styles.modalText}>
                  Задайте новый пароль вручную или сгенерируйте случайный.
                </p>
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                <label className={styles.field}>
                  <span className={styles.label}>Новый пароль</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Повторите пароль</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                </label>
                <div className={styles.modalActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={closeReset}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => void submitReset(true)}
                  >
                    Сгенерировать
                  </Button>
                  <Button
                    type="button"
                    disabled={submitting || !password || !confirmPassword}
                    onClick={() => void submitReset(false)}
                  >
                    {submitting ? "Сохранение…" : "Сохранить"}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      ) : null}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
