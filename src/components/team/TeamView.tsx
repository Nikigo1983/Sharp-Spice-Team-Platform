"use client";

import { useCallback, useEffect, useState } from "react";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import { ROLE_LABELS, type SessionUser } from "@/lib/auth/types";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type { TeamMember } from "@/lib/team/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Toast, type ToastMessage } from "@/components/tasks/Toast";
import styles from "./TeamView.module.css";

type TeamViewProps = {
  user: SessionUser;
};

export function TeamView({ user }: TeamViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const fetchMembers = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as {
        members?: TeamMember[];
        canDelete?: boolean;
        onlineCount?: number;
      };
      setMembers(data.members ?? []);
      setOnlineCount(data.onlineCount ?? 0);
      setCanDelete(Boolean(data.canDelete));
    } catch {
      setMembers([]);
      setOnlineCount(0);
      setCanDelete(false);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMembers();
    const interval = setInterval(() => {
      void fetchMembers({ silent: true });
    }, PRESENCE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMembers]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/team/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({ text: data.error ?? "Не удалось удалить пользователя." });
        return;
      }
      setToast({ text: `${deleteTarget.name} удалён из команды.` });
      setDeleteTarget(null);
      await fetchMembers();
    } catch {
      setToast({ text: "Не удалось удалить пользователя." });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title="Team"
        subtitle={
          onlineCount > 0
            ? `Список пользователей платформы · ${onlineCount} в сети`
            : "Список пользователей платформы"
        }
      />

      {canDelete ? (
        <p className={styles.hint}>
          Удаление доступно Веронике и Злате. Удалённый пользователь не сможет
          войти на платформу.
        </p>
      ) : null}

      {loading ? (
        <Card className={styles.empty}>Загрузка…</Card>
      ) : members.length === 0 ? (
        <Card className={styles.empty}>В команде пока нет пользователей.</Card>
      ) : (
        <ul className={styles.list}>
          {members.map((member) => {
            const isSelf = member.id === user.id;
            const showDelete =
              canDelete &&
              !isSelf &&
              !(member.id === "veronika" && user.id !== "veronika");

            return (
              <li key={member.id}>
                <Card className={styles.row}>
                  <div className={styles.main}>
                    <p className={styles.name}>
                      <span className={styles.nameRow}>
                        {member.name}
                        <OnlineIndicator online={Boolean(member.isOnline)} />
                      </span>
                      {isSelf ? (
                        <span className={styles.you}> (это вы)</span>
                      ) : null}
                    </p>
                    <p className={styles.meta}>{member.email}</p>
                    <p className={styles.stats}>
                      AI-запросы:{" "}
                      <span className={styles.statValue}>
                        {member.aiRequestsThisMonth ?? 0}
                      </span>{" "}
                      за месяц
                    </p>
                    <span className={styles.role}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  </div>
                  {showDelete ? (
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => setDeleteTarget(member)}
                      >
                        Удалить
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {deleteTarget ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div
            className={styles.backdrop}
            onClick={() => !deleting && setDeleteTarget(null)}
            aria-hidden
          />
          <Card className={styles.modal}>
            <h2 className={styles.modalTitle}>Удалить пользователя?</h2>
            <p className={styles.confirmText}>
              Пользователь потеряет доступ к платформе.
            </p>
            <p className={styles.confirmName}>{deleteTarget.name}</p>
            <div className={styles.confirmActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? "Удаление…" : "Удалить"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
