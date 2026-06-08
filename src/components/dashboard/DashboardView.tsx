import Link from "next/link";
import type { DashboardStats } from "@/lib/dashboard/stats";
import type { SessionUser } from "@/lib/auth/types";
import type { TaskStats } from "@/lib/tasks/types";
import type { TeamChatMessage } from "@/lib/team-chat/types";
import { formatTeamChatDateTime } from "@/lib/team-chat/format";
import { Card } from "@/components/ui/Card";
import styles from "./DashboardView.module.css";

type StatItem = {
  label: string;
  value: string;
  hint: string;
  icon: string;
};

type QuickAction = {
  label: string;
  href: string;
  icon: string;
  external?: boolean;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Создать задачу",
    href: "/tasks/new",
    icon: "fa-solid fa-list-check",
  },
  {
    label: "Открыть AI Workspace",
    href: "/ai-workspace",
    icon: "fa-solid fa-robot",
  },
];

type DashboardViewProps = {
  user: SessionUser;
  taskStats: TaskStats;
  teamRecentMessages: TeamChatMessage[];
  dashboardStats: DashboardStats;
};

function buildPlatformStats(stats: DashboardStats): StatItem[] {
  return [
    {
      label: "Клиенты",
      value: String(stats.clientsTotal),
      hint: "в CRM",
      icon: "fa-solid fa-users",
    },
    {
      label: "Новые анкеты",
      value: String(stats.newFormgridLeads7Days),
      hint: "за 7 дней",
      icon: "fa-solid fa-clipboard-list",
    },
    {
      label: "Активные консультации",
      value: String(stats.activeConsultations),
      hint: "на этой неделе",
      icon: "fa-solid fa-calendar-check",
    },
    {
      label: "AI-запросы",
      value: String(stats.aiRequestsThisMonth),
      hint: "за месяц",
      icon: "fa-solid fa-wand-magic-sparkles",
    },
  ];
}

export function DashboardView({
  user,
  taskStats,
  teamRecentMessages,
  dashboardStats,
}: DashboardViewProps) {
  const platformStats = buildPlatformStats(dashboardStats);

  const taskStatItems = [
    {
      label: "Всего задач",
      value: String(taskStats.total),
      hint: "в командном списке",
      icon: "fa-solid fa-list-check",
    },
    {
      label: "В работе",
      value: String(taskStats.inProgress),
      hint: "активные",
      icon: "fa-solid fa-spinner",
    },
    {
      label: "Выполнено",
      value: String(taskStats.completed),
      hint: "закрытые",
      icon: "fa-solid fa-circle-check",
    },
    {
      label: "Просрочено",
      value: String(taskStats.overdue),
      hint: "требуют внимания",
      icon: "fa-solid fa-clock",
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="dashboard-hero-title">
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>Добро пожаловать, {user.name}</p>
          <h1 id="dashboard-hero-title" className={styles.heroTitle}>
            Sharp & Spice Workspace
          </h1>
          <p className={styles.heroSubtitle}>
            Единое пространство для клиентов, анкет, AI-аналитики и внутренних
            процессов команды.
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tasks-heading">
        <div className={styles.sectionHeadingRow}>
          <h2 id="tasks-heading" className={styles.sectionTitle}>
            📋 Задачи
          </h2>
          <Link href="/tasks" className={styles.sectionLink}>
            Все задачи
            <i className="fa-solid fa-arrow-right" aria-hidden />
          </Link>
        </div>
        <div className={styles.statsGridWrap}>
          <ul className={styles.statsGrid}>
            {taskStatItems.map((stat) => (
              <li key={stat.label}>
                <Card className={styles.statCard}>
                  <div className={styles.statIconWrap} aria-hidden>
                    <i className={stat.icon} />
                  </div>
                  <div className={styles.statBody}>
                    <span className={styles.statValue}>{stat.value}</span>
                    <span className={styles.statLabel}>{stat.label}</span>
                    <span className={styles.statHint}>{stat.hint}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="team-chat-heading">
        <div className={styles.sectionHeadingRow}>
          <h2 id="team-chat-heading" className={styles.sectionTitle}>
            Последние сообщения команды
          </h2>
          <Link href="/team-chat" className={styles.sectionLink}>
            Открыть чат
            <i className="fa-solid fa-arrow-right" aria-hidden />
          </Link>
        </div>

        <ul className={styles.chatList}>
          {teamRecentMessages.slice(0, 5).map((message) => (
            <li key={message.id} className={styles.chatItem}>
              <Card className={styles.chatCard}>
                <div className={styles.chatMetaRow}>
                  <span className={styles.chatAuthor}>{message.user_name}</span>
                  <span className={styles.chatTime}>
                    {formatTeamChatDateTime(message.created_at)}
                  </span>
                </div>
                <p className={styles.chatText}>{message.message_text}</p>
              </Card>
            </li>
          ))}
          {teamRecentMessages.length === 0 ? (
            <li className={styles.chatEmpty}>
              <p>Пока нет сообщений.</p>
            </li>
          ) : null}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="stats-heading">
        <h2 id="stats-heading" className={styles.sectionTitle}>
          Статистика
        </h2>
        <div className={styles.statsGridWrap}>
          <ul className={styles.statsGrid}>
            {platformStats.map((stat) => (
              <li key={stat.label}>
                <Card className={styles.statCard}>
                  <div className={styles.statIconWrap} aria-hidden>
                    <i className={stat.icon} />
                  </div>
                  <div className={styles.statBody}>
                    <span className={styles.statValue}>{stat.value}</span>
                    <span className={styles.statLabel}>{stat.label}</span>
                    <span className={styles.statHint}>{stat.hint}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="actions-heading">
        <h2 id="actions-heading" className={styles.sectionTitle}>
          Быстрые действия
        </h2>
        <ul className={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => {
            const card = (
              <Card className={styles.actionCard}>
                <span className={styles.actionIconWrap} aria-hidden>
                  <i className={action.icon} />
                </span>
                <span className={styles.actionLabel}>{action.label}</span>
                <i
                  className={`fa-solid ${
                    action.external ? "fa-arrow-up-right-from-square" : "fa-arrow-right"
                  } ${styles.actionArrow}`}
                  aria-hidden
                />
              </Card>
            );

            return (
              <li key={action.href}>
                {action.external ? (
                  <a
                    href={action.href}
                    className={styles.actionLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {card}
                  </a>
                ) : (
                  <Link href={action.href} className={styles.actionLink}>
                    {card}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
