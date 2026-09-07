"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { OnlineIndicator } from "@/components/presence/OnlineIndicator";
import { ROLE_LABELS, type SessionUser } from "@/lib/auth/types";
import { PRESENCE_POLL_INTERVAL_MS } from "@/lib/presence/constants";
import type {
  ActivityDayStat,
  ActivityMonthStat,
  ActivityPeriod,
  MemberActivityStats,
} from "@/lib/presence/daily-activity-logic";
import {
  buildActivityCalendarCells,
  clampActivityAnchor,
  getActivityDayKey,
  shiftActivityPeriodAnchor,
} from "@/lib/presence/daily-activity-logic";
import { canViewTeamMemberActivity } from "@/lib/team/permissions";
import type { TeamMember } from "@/lib/team/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Toast, type ToastMessage } from "@/components/tasks/Toast";
import styles from "./TeamView.module.css";

type TeamViewProps = {
  user: SessionUser;
};

const ACTIVITY_PERIODS: ActivityPeriod[] = ["day", "week", "month", "year"];

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const PERIOD_LABELS: Record<ActivityPeriod, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  year: "Год",
};

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  }).format(new Date(ts));
}

function formatOnlineDuration(onlineMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(onlineMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} мин`;
  }
  return `${hours} ч ${minutes} мин`;
}

function formatOnlineDurationCompact(onlineMs: number): string {
  if (onlineMs <= 0) return "—";
  return formatOnlineDuration(onlineMs);
}

function formatActivityDay(dayKey: string): string {
  const ts = Date.parse(`${dayKey}T12:00:00+03:00`);
  if (Number.isNaN(ts)) return dayKey;
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(ts));
}

function formatActivityMonthTitle(dayKey: string): string {
  const ts = Date.parse(`${dayKey}T12:00:00+03:00`);
  if (Number.isNaN(ts)) return dayKey;
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(ts));
}

function formatActivityMonthShort(monthKey: string): string {
  const ts = Date.parse(`${monthKey}-15T12:00:00+03:00`);
  if (Number.isNaN(ts)) return monthKey;
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(ts));
}

function formatActivityYearTitle(anchor: string): string {
  return anchor.slice(0, 4);
}

function formatActivityWeekTitle(days: ActivityDayStat[]): string {
  if (days.length === 0) return "";
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  });
  return `${fmt.format(new Date(`${first}T12:00:00+03:00`))} – ${fmt.format(new Date(`${last}T12:00:00+03:00`))}`;
}

function dayNumber(dayKey: string): string {
  return dayKey.slice(-2).replace(/^0/, "");
}

function activityHeatClass(onlineMs: number): string {
  if (onlineMs <= 0) return "";
  const hours = onlineMs / 3_600_000;
  if (hours >= 4) return styles.calCellHot;
  if (hours >= 1) return styles.calCellWarm;
  return styles.calCellMild;
}

function canNavigatePeriod(
  period: ActivityPeriod,
  anchor: string,
  delta: number,
): boolean {
  const next = clampActivityAnchor(shiftActivityPeriodAnchor(period, anchor, delta));
  if (delta < 0) {
    return next < clampActivityAnchor(anchor);
  }
  return next > clampActivityAnchor(anchor);
}

export function TeamView({ user }: TeamViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [statsTarget, setStatsTarget] = useState<TeamMember | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<ActivityPeriod>("week");
  const [statsAnchor, setStatsAnchor] = useState(getActivityDayKey());
  const [stats, setStats] = useState<MemberActivityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [selectedDay, setSelectedDay] = useState<ActivityDayStat | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [overlayDismissArmed, setOverlayDismissArmed] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!statsTarget) {
      setOverlayDismissArmed(false);
      return;
    }
    setOverlayDismissArmed(false);
    const timer = window.setTimeout(() => setOverlayDismissArmed(true), 350);
    return () => window.clearTimeout(timer);
  }, [statsTarget]);

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

  const fetchMemberStats = useCallback(
    async (memberId: string, period: ActivityPeriod, anchor: string) => {
      setStatsLoading(true);
      setStatsError(false);
      try {
        const params = new URLSearchParams({
          period,
          anchor,
        });
        const res = await fetch(
          `/api/team/${encodeURIComponent(memberId)}/activity?${params}`,
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { stats?: MemberActivityStats };
        const next = data.stats ?? null;
        setStats(next);
        if (next?.anchor && next.anchor !== anchor) {
          setStatsAnchor(next.anchor);
        }
        if (next?.period === "day") {
          setSelectedDay(next.days[0] ?? null);
        } else if (next?.period === "year") {
          setSelectedDay(null);
        } else {
          const todayKey = getActivityDayKey();
          setSelectedDay(
            next?.days.find((day) => day.date === todayKey) ??
              next?.days.find((day) => day.onlineMs > 0) ??
              next?.days[0] ??
              null,
          );
        }
      } catch {
        setStats(null);
        setSelectedDay(null);
        setStatsError(true);
      } finally {
        setStatsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!statsTarget) {
      setStats(null);
      setSelectedDay(null);
      setStatsError(false);
      return;
    }
    void fetchMemberStats(statsTarget.id, statsPeriod, statsAnchor);
  }, [statsTarget, statsPeriod, statsAnchor, fetchMemberStats]);

  const openMemberStats = (member: TeamMember) => {
    setStatsPeriod("week");
    setStatsAnchor(getActivityDayKey());
    setStatsTarget(member);
  };

  const closeMemberStats = () => {
    setStatsTarget(null);
    setStats(null);
    setSelectedDay(null);
    setStatsError(false);
  };

  const changeStatsPeriod = (period: ActivityPeriod) => {
    setStatsPeriod(period);
    setStatsAnchor(getActivityDayKey());
  };

  const shiftStatsAnchor = (delta: number) => {
    setStatsAnchor((current) =>
      clampActivityAnchor(shiftActivityPeriodAnchor(statsPeriod, current, delta)),
    );
  };

  const openMonthFromYear = (month: ActivityMonthStat) => {
    setStatsPeriod("month");
    setStatsAnchor(`${month.monthKey}-15`);
  };

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
            const canOpenStats = canViewTeamMemberActivity(user, member);
            const activity = member.activityToday;

            return (
              <li key={member.id}>
                <Card
                  className={`${styles.row}${canOpenStats ? ` ${styles.rowClickable}` : ""}`}
                  role={canOpenStats ? "button" : undefined}
                  tabIndex={canOpenStats ? 0 : undefined}
                  onClick={
                    canOpenStats ? () => openMemberStats(member) : undefined
                  }
                  onKeyDown={
                    canOpenStats
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openMemberStats(member);
                          }
                        }
                      : undefined
                  }
                >
                  <div className={styles.main}>
                    <p className={styles.name}>
                      <span className={styles.nameRow}>
                        {canOpenStats ? (
                          <button
                            type="button"
                            className={styles.nameButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              openMemberStats(member);
                            }}
                          >
                            {member.name}
                          </button>
                        ) : (
                          member.name
                        )}
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
                    {activity?.hasActivity ? (
                      <p className={styles.stats}>
                        Онлайн сегодня:{" "}
                        <span className={styles.statValue}>
                          {formatOnlineDuration(activity.onlineMs)}
                        </span>
                        {" · "}
                        Начало:{" "}
                        <span className={styles.statValue}>
                          {formatClock(activity.startedAt)}
                        </span>
                        {" · "}
                        Окончание:{" "}
                        <span className={styles.statValue}>
                          {formatClock(activity.endedAt)}
                        </span>
                      </p>
                    ) : (
                      <p className={styles.stats}>Сегодня в сети не был(а)</p>
                    )}
                    <span className={styles.role}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  </div>
                  {showDelete ? (
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(member);
                        }}
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

      {portalReady && statsTarget
        ? createPortal(
            <div className={styles.overlay} role="dialog" aria-modal="true">
              <div
                className={styles.backdrop}
                onClick={() => {
                  if (overlayDismissArmed) closeMemberStats();
                }}
                aria-hidden
              />
              <Card
                className={styles.statsModal}
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className={styles.modalTitle}>Статистика присутствия</h2>
                <p className={styles.confirmName}>{statsTarget.name}</p>
                <div className={styles.periodTabs} role="tablist">
                  {ACTIVITY_PERIODS.map((period) => (
                    <button
                      key={period}
                      type="button"
                      role="tab"
                      aria-selected={statsPeriod === period}
                      className={`${styles.periodTab}${statsPeriod === period ? ` ${styles.periodTabActive}` : ""}`}
                      onClick={() => changeStatsPeriod(period)}
                    >
                      {PERIOD_LABELS[period]}
                    </button>
                  ))}
                </div>
                {statsLoading ? (
                  <p className={styles.confirmText}>Загрузка…</p>
                ) : statsError || !stats ? (
                  <p className={styles.confirmText}>
                    Не удалось загрузить статистику.
                  </p>
                ) : (
                  <>
                    <div className={styles.statsNav}>
                      <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() => shiftStatsAnchor(-1)}
                        disabled={
                          !canNavigatePeriod(stats.period, stats.anchor, -1)
                        }
                        aria-label="Назад"
                      >
                        ‹
                      </button>
                      <p className={styles.statsRange}>
                        {stats.period === "year"
                          ? formatActivityYearTitle(stats.anchor)
                          : stats.period === "month"
                            ? formatActivityMonthTitle(
                                stats.days[0]?.date ?? stats.anchor,
                              )
                            : stats.period === "week"
                              ? formatActivityWeekTitle(stats.days)
                              : formatActivityDay(
                                  stats.days[0]?.date ?? stats.anchor,
                                )}
                      </p>
                      <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() => shiftStatsAnchor(1)}
                        disabled={
                          !canNavigatePeriod(stats.period, stats.anchor, 1)
                        }
                        aria-label="Вперёд"
                      >
                        ›
                      </button>
                    </div>
                    <p className={styles.statsTotal}>
                      Всего:{" "}
                      <span className={styles.statValue}>
                        {formatOnlineDuration(stats.onlineMs)}
                      </span>
                    </p>
                    <p className={styles.statsRetention}>
                      Храним историю до 365 дней
                    </p>
                    {stats.period === "day" ? (
                      <div className={styles.dayDetail}>
                        {stats.days[0] && stats.days[0].onlineMs > 0 ? (
                          <p className={styles.dayMeta}>
                            Начало: {formatClock(stats.days[0].startedAt)}
                            {" · "}
                            Окончание: {formatClock(stats.days[0].endedAt)}
                          </p>
                        ) : (
                          <p className={styles.dayMeta}>
                            Нет данных за этот день
                          </p>
                        )}
                      </div>
                    ) : stats.period === "year" ? (
                      <div className={styles.yearGrid}>
                        {stats.months.map((month) => {
                          const heat = activityHeatClass(month.onlineMs);
                          const isFutureMonth =
                            month.monthKey > getActivityDayKey().slice(0, 7);
                          return (
                            <button
                              key={month.monthKey}
                              type="button"
                              className={[styles.yearCell, heat]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => openMonthFromYear(month)}
                              disabled={isFutureMonth}
                              title={`${formatActivityMonthTitle(`${month.monthKey}-15`)}: ${formatOnlineDuration(month.onlineMs)}`}
                            >
                              <span className={styles.calDayNum}>
                                {formatActivityMonthShort(month.monthKey)}
                              </span>
                              <span className={styles.calDayDur}>
                                {formatOnlineDurationCompact(month.onlineMs)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <div
                          className={`${styles.calGrid}${stats.period === "week" ? ` ${styles.calGridWeek}` : ""}`}
                        >
                          {WEEKDAY_LABELS.map((label) => (
                            <div key={label} className={styles.calWeekday}>
                              {label}
                            </div>
                          ))}
                          {buildActivityCalendarCells(
                            stats.days,
                            stats.period,
                          ).map((day, index) => {
                            if (!day) {
                              return (
                                <div
                                  key={`empty-${index}`}
                                  className={`${styles.calCell} ${styles.calCellEmpty}`}
                                  aria-hidden
                                />
                              );
                            }
                            const isToday = day.date === getActivityDayKey();
                            const isSelected = selectedDay?.date === day.date;
                            const heat = activityHeatClass(day.onlineMs);
                            return (
                              <button
                                key={day.date}
                                type="button"
                                className={[
                                  styles.calCell,
                                  heat,
                                  isToday ? styles.calCellToday : "",
                                  isSelected ? styles.calCellSelected : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => setSelectedDay(day)}
                                title={`${formatActivityDay(day.date)}: ${formatOnlineDuration(day.onlineMs)}`}
                              >
                                <span className={styles.calDayNum}>
                                  {dayNumber(day.date)}
                                </span>
                                <span className={styles.calDayDur}>
                                  {formatOnlineDurationCompact(day.onlineMs)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedDay ? (
                          <div className={styles.dayDetail}>
                            <p className={styles.dayDate}>
                              {formatActivityDay(selectedDay.date)}
                            </p>
                            <p className={styles.stats}>
                              Всего:{" "}
                              <span className={styles.statValue}>
                                {formatOnlineDuration(selectedDay.onlineMs)}
                              </span>
                            </p>
                            {selectedDay.onlineMs > 0 ? (
                              <p className={styles.dayMeta}>
                                Начало: {formatClock(selectedDay.startedAt)}
                                {" · "}
                                Окончание: {formatClock(selectedDay.endedAt)}
                              </p>
                            ) : (
                              <p className={styles.dayMeta}>
                                Нет данных за этот день
                              </p>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                )}
                <div className={styles.confirmActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeMemberStats}
                  >
                    Закрыть
                  </Button>
                </div>
              </Card>
            </div>,
            document.body,
          )
        : null}

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
