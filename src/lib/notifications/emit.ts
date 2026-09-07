import "server-only";

import { listTeamUsers } from "@/lib/auth/users";
import { resolveReminderRecipientIds } from "@/lib/calendar/reminders";
import type { CalendarEvent } from "@/lib/calendar/types";
import { isVideoMeeting } from "@/lib/calendar/meeting";
import type { ReminderOffsetMinutes } from "@/lib/calendar/constants";
import { getDeletedUserIds } from "@/lib/team/store";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks/types";
import {
  buildCalendarReminderNotificationContent,
  buildCalendarEventCreatedNotificationContent,
} from "./calendar-reminder-copy";
import {
  createNotificationForUser,
  createNotificationsForTeam,
  createNotificationsForUserIds,
} from "./store";
import type { Notification } from "./types";

async function listActiveCalendarUserIds(): Promise<string[]> {
  const deleted = new Set(await getDeletedUserIds());
  return listTeamUsers()
    .filter((user) => !deleted.has(user.id))
    .map((user) => user.id);
}

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
  assigneeIds?: string[];
  creatorUserId?: string;
}) {
  const recipientIds = [
    ...(params.assigneeIds ?? []),
    ...(params.creatorUserId ? [params.creatorUserId] : []),
  ].filter((id) => id && id !== params.actorId);
  const uniqueRecipients = [...new Set(recipientIds)];

  await createNotificationsForTeam(
    {
      type: "task_status",
      title: "Изменение статуса задачи",
      author_name: params.actorName,
      message: `${params.taskTitle} — ${TASK_STATUS_LABELS[params.status]}`,
    },
    uniqueRecipients.length
      ? {
          excludeUserId: params.actorId,
          onlyUserIds: uniqueRecipients,
        }
      : { excludeUserId: params.actorId },
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
    assigneeIds: params.assigneeIds,
    creatorUserId: params.creatorUserId,
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

export function buildCalendarEventCreatedRecipientIds(
  event: CalendarEvent,
  activeUserIds: string[],
): string[] {
  const recipientIds = new Set(resolveReminderRecipientIds(event, activeUserIds));
  recipientIds.add(event.createdByUserId);
  if (event.ownerUserId) {
    recipientIds.add(event.ownerUserId);
  }
  return [...recipientIds];
}

export async function notifyCalendarEventCreated(params: {
  actorId: string;
  actorName: string;
  event: CalendarEvent;
}): Promise<void> {
  const activeUserIds = await listActiveCalendarUserIds();
  const recipientIds = buildCalendarEventCreatedRecipientIds(
    params.event,
    activeUserIds,
  );

  if (!recipientIds.length) {
    return;
  }

  const content = buildCalendarEventCreatedNotificationContent(params.event);

  await createNotificationsForUserIds(recipientIds, {
    type: isVideoMeeting(params.event)
      ? "calendar_video_invite"
      : "calendar_reminder",
    title: content.title,
    message: content.message,
    author_name: params.actorName,
  });
}

export async function notifyVideoMeetingInvite(params: {
  actorId: string;
  actorName: string;
  event: CalendarEvent;
}): Promise<void> {
  await notifyCalendarEventCreated(params);
}

export async function notifyClientCaseStatusChanged(params: {
  portalUserId: string;
  statusLabel: string;
  actorName?: string | null;
}): Promise<void> {
  if (!params.portalUserId) return;

  await createNotificationForUser(params.portalUserId, {
    type: "client_case_status",
    title: "Статус заявки обновлён",
    message: `Новый статус: ${params.statusLabel}`,
    author_name: params.actorName ?? null,
  });
}
