import "server-only";

import type { CalendarEvent } from "@/lib/calendar/types";
import type { ReminderOffsetMinutes } from "@/lib/calendar/constants";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks/types";
import { buildCalendarReminderNotificationContent } from "./calendar-reminder-copy";
import { createNotificationForUser, createNotificationsForTeam } from "./store";
import type { Notification } from "./types";

export async function notifyTeamChatMessage(params: {
  senderId: string;
  senderName: string;
  text: string;
  isVoice?: boolean;
  isImage?: boolean;
  isFile?: boolean;
}) {
  const preview = params.isVoice
    ? "🎤 Голосовое сообщение"
    : params.isImage
      ? params.text.trim()
        ? `🖼 ${params.text.trim()}`
        : "🖼 Изображение"
      : params.isFile
        ? params.text.trim()
          ? `📎 ${params.text.trim()}`
          : `📎 ${params.text || "Файл"}`
        : params.text.length > 200
          ? `${params.text.slice(0, 200)}…`
          : params.text;

  await createNotificationsForTeam(
    {
      type: "team_chat",
      title: "Новое сообщение",
      author_name: params.senderName,
      message: preview,
    },
    { excludeUserId: params.senderId },
  );
}

export async function notifyTaskCreated(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  assigneeIds?: string[];
}) {
  const hasAssignees = Boolean(params.assigneeIds?.length);

  await createNotificationsForTeam(
    {
      type: "task_new",
      title: hasAssignees ? "Вам назначена задача" : "Новая задача",
      author_name: params.actorName,
      message: params.taskTitle,
    },
    {
      excludeUserId: params.actorId,
      onlyUserIds: hasAssignees ? params.assigneeIds : undefined,
    },
  );
}

export async function notifyTaskStatusChanged(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  status: TaskStatus;
}) {
  await createNotificationsForTeam(
    {
      type: "task_status",
      title: "Изменение статуса задачи",
      author_name: params.actorName,
      message: `${params.taskTitle} — ${TASK_STATUS_LABELS[params.status]}`,
    },
    { excludeUserId: params.actorId },
  );
}

export async function notifyTaskCompleted(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  creatorUserId: string;
}) {
  if (params.creatorUserId === params.actorId) return;

  await createNotificationsForTeam(
    {
      type: "task_completed",
      title: "Задача выполнена",
      author_name: params.actorName,
      message: params.taskTitle,
    },
    {
      excludeUserId: params.actorId,
      onlyUserIds: [params.creatorUserId],
    },
  );
}

export async function notifyTaskPendingApproval(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  creatorUserId: string;
}) {
  if (params.creatorUserId === params.actorId) return;

  await createNotificationsForTeam(
    {
      type: "task_pending_approval",
      title: "Задача на проверке",
      author_name: params.actorName,
      message: params.taskTitle,
    },
    {
      excludeUserId: params.actorId,
      onlyUserIds: [params.creatorUserId],
    },
  );
}

export async function notifyTaskRevisionRequested(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  comment: string;
  assigneeIds: string[];
}) {
  const preview =
    params.comment.length > 160
      ? `${params.comment.slice(0, 160)}…`
      : params.comment;

  await createNotificationsForTeam(
    {
      type: "task_revision",
      title: "Задача на доработке",
      author_name: params.actorName,
      message: `${params.taskTitle} — ${preview}`,
    },
    {
      excludeUserId: params.actorId,
      onlyUserIds: params.assigneeIds.length ? params.assigneeIds : undefined,
    },
  );
}

export async function notifyTaskApproved(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  assigneeIds: string[];
}) {
  await createNotificationsForTeam(
    {
      type: "task_completed",
      title: "Задача принята",
      author_name: params.actorName,
      message: params.taskTitle,
    },
    {
      excludeUserId: params.actorId,
      onlyUserIds: params.assigneeIds.length ? params.assigneeIds : undefined,
    },
  );
}

export async function notifyTaskStatusUpdate(params: {
  actorId: string;
  actorName: string;
  taskTitle: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  creatorUserId: string;
  assigneeIds: string[];
  revisionComment?: string | null;
}) {
  if (params.newStatus === params.previousStatus) return;

  if (params.newStatus === "pending_approval") {
    await notifyTaskPendingApproval({
      actorId: params.actorId,
      actorName: params.actorName,
      taskTitle: params.taskTitle,
      creatorUserId: params.creatorUserId,
    });
    return;
  }

  if (params.newStatus === "needs_revision") {
    await notifyTaskRevisionRequested({
      actorId: params.actorId,
      actorName: params.actorName,
      taskTitle: params.taskTitle,
      comment: params.revisionComment ?? "",
      assigneeIds: params.assigneeIds,
    });
    return;
  }

  if (
    params.newStatus === "completed" &&
    params.previousStatus === "pending_approval"
  ) {
    await notifyTaskApproved({
      actorId: params.actorId,
      actorName: params.actorName,
      taskTitle: params.taskTitle,
      assigneeIds: params.assigneeIds,
    });
    return;
  }

  if (params.newStatus === "completed") {
    await notifyTaskCompleted({
      actorId: params.actorId,
      actorName: params.actorName,
      taskTitle: params.taskTitle,
      creatorUserId: params.creatorUserId,
    });
    return;
  }

  await notifyTaskStatusChanged({
    actorId: params.actorId,
    actorName: params.actorName,
    taskTitle: params.taskTitle,
    status: params.newStatus,
  });
}

export async function notifyNewClient(params: {
  clientName: string;
  source?: string;
}) {
  await createNotificationsForTeam({
    type: "client_new",
    title: "Новый клиент",
    author_name: null,
    message: params.source
      ? `${params.clientName} (${params.source})`
      : params.clientName,
  });
}

export async function notifyConsultationAssigned(params: {
  clientName: string;
  managerName?: string;
  onlyUserIds?: string[];
}) {
  await createNotificationsForTeam(
    {
      type: "consultation_assigned",
      title: "Назначена консультация",
      author_name: params.managerName ?? null,
      message: params.clientName,
    },
    { onlyUserIds: params.onlyUserIds },
  );
}

export async function notifySystem(params: {
  title: string;
  message: string;
  onlyUserIds?: string[];
}) {
  await createNotificationsForTeam(
    {
      type: "system",
      title: params.title,
      author_name: null,
      message: params.message,
    },
    { onlyUserIds: params.onlyUserIds },
  );
}

export async function notifyCalendarReminder(params: {
  event: CalendarEvent;
  offsetMinutes: ReminderOffsetMinutes;
  userId: string;
}): Promise<Notification> {
  const content = buildCalendarReminderNotificationContent(
    params.event,
    params.offsetMinutes,
  );

  return createNotificationForUser(params.userId, {
    type: "calendar_reminder",
    title: content.title,
    message: content.message,
    author_name: null,
  });
}
