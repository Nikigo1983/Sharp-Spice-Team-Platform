import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";
import { normalizeAssignees } from "./assignees";
import { isTaskOverdue } from "./overdue";
import {
  canDeleteTask,
  canDeleteTaskAttachment,
  canDirectComplete,
  canEditTask,
  canManageTaskAttachments,
  canReviewTask,
  canStartTask,
  canSubmitForApproval,
  canChangeTaskStatus,
  isTaskCreator,
} from "./permissions";
import type {
  CreateTaskInput,
  Task,
  TaskAssignee,
  TaskAttachment,
  TaskReviewEvent,
  TaskStats,
  TaskStatus,
  UpdateTaskInput,
} from "./types";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  MAX_TASK_ATTACHMENTS_PER_TASK,
  normalizeTaskAttachmentContentType,
} from "./attachment-formats";
import {
  deleteTaskAttachmentFile,
  saveTaskAttachmentFile,
} from "./attachment-storage";
import { taskNeedsApprovalWorkflow } from "./workflow";
import { listTeamMembers } from "@/lib/team/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbTasks from "@/lib/supabase/tasks-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "tasks.json");

type TaskStore = {
  tasks: Task[];
};

function normalizeAttachments(raw: unknown): TaskAttachment[] {
  if (!Array.isArray(raw)) return [];
  const attachments: TaskAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const attachment = item as Partial<TaskAttachment>;
    if (
      !attachment.id ||
      !attachment.fileName ||
      !attachment.contentType ||
      typeof attachment.size !== "number" ||
      !attachment.uploadedByUserId ||
      !attachment.uploadedByName ||
      !attachment.uploadedAt
    ) {
      continue;
    }
    attachments.push({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      uploadedByUserId: attachment.uploadedByUserId,
      uploadedByName: attachment.uploadedByName,
      uploadedAt: attachment.uploadedAt,
    });
  }
  return attachments;
}

function normalizeReviewHistory(raw: unknown): TaskReviewEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: TaskReviewEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const event = item as Partial<TaskReviewEvent>;
    if (
      !event.id ||
      !event.action ||
      !event.actorUserId ||
      !event.actorName ||
      !event.createdAt
    ) {
      continue;
    }
    events.push({
      id: event.id,
      action: event.action,
      actorUserId: event.actorUserId,
      actorName: event.actorName,
      comment: event.comment,
      createdAt: event.createdAt,
    });
  }
  return events;
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    assignees: normalizeAssignees(task.assignees),
    reviewHistory: normalizeReviewHistory(task.reviewHistory),
    attachments: normalizeAttachments(task.attachments),
  };
}

async function readStore(): Promise<TaskStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as TaskStore;
    if (!Array.isArray(data.tasks)) return { tasks: [] };
    return {
      tasks: data.tasks.map((task) => normalizeTask(task)),
    };
  } catch {
    return { tasks: [] };
  }
}

async function writeStore(store: TaskStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  store.tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function resolveAssignees(ids?: string[]): Promise<TaskAssignee[]> {
  if (!ids?.length) return [];
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const members = await listTeamMembers();
  const byId = new Map(members.map((member) => [member.id, member]));
  return uniqueIds
    .map((id) => byId.get(id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .map((member) => ({ id: member.id, name: member.name }));
}

function appendReviewEvent(
  task: Task,
  event: Omit<TaskReviewEvent, "id" | "createdAt">,
  now: string,
): TaskReviewEvent[] {
  return [
    ...task.reviewHistory,
    {
      id: randomUUID(),
      ...event,
      createdAt: now,
    },
  ];
}

async function persistTask(updated: Task): Promise<Task | null> {
  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbUpdateTask(updated);
    } catch (error) {
      console.error("[tasks] supabase persist", error);
      return null;
    }
  }

  const store = await readStore();
  const index = store.tasks.findIndex((t) => t.id === updated.id);
  if (index < 0) return null;
  store.tasks[index] = updated;
  await writeStore(store);
  return updated;
}

export {
  canChangeTaskStatus,
  canDeleteTask,
  canEditTask,
  canReviewTask,
  canSubmitForApproval,
  canDirectComplete,
  canStartTask,
  isTaskCreator,
};

export async function listTasks(): Promise<Task[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbListTasks();
    } catch (error) {
      console.error("[tasks] supabase list", error);
      return [];
    }
  }

  const store = await readStore();
  return store.tasks.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTask(id: string): Promise<Task | null> {
  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbGetTask(id);
    } catch (error) {
      console.error("[tasks] supabase get", error);
      return null;
    }
  }

  const store = await readStore();
  return store.tasks.find((t) => t.id === id) ?? null;
}

export async function createTask(
  input: CreateTaskInput,
  user: SessionUser,
): Promise<Task> {
  const store = await readStore();
  const now = new Date().toISOString();
  const status: TaskStatus = input.status ?? "new";

  const assignees = await resolveAssignees(input.assigneeIds);

  const task: Task = {
    id: randomUUID(),
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    status,
    createdByUserId: user.id,
    createdByName: user.name,
    assignees,
    createdAt: now,
    dueDate: input.dueDate?.trim() || null,
    completedAt: status === "completed" ? now : null,
    updatedAt: now,
    reviewHistory: [],
    attachments: [],
  };

  store.tasks.unshift(task);
  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbInsertTask(task);
    } catch (error) {
      console.error("[tasks] supabase create", error);
      throw error;
    }
  }

  await writeStore(store);
  return task;
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!current) return null;

  if (!canEditTask(current, user)) return null;

  const now = new Date().toISOString();
  let nextStatus = input.status ?? current.status;

  if (
    nextStatus === "completed" &&
    taskNeedsApprovalWorkflow(current) &&
    current.status !== "completed"
  ) {
    return null;
  }

  if (
    nextStatus === "pending_approval" ||
    nextStatus === "needs_revision"
  ) {
    nextStatus = current.status;
  }

  let completedAt = current.completedAt;
  if (nextStatus === "completed" && current.status !== "completed") {
    completedAt = now;
  } else if (nextStatus !== "completed") {
    completedAt = null;
  }

  const assignees =
    input.assigneeIds !== undefined
      ? await resolveAssignees(input.assigneeIds)
      : current.assignees;

  const updated: Task = {
    ...current,
    title: input.title?.trim() ?? current.title,
    description:
      input.description !== undefined
        ? input.description.trim()
        : current.description,
    dueDate:
      input.dueDate !== undefined
        ? input.dueDate?.trim() || null
        : current.dueDate,
    status: nextStatus,
    assignees,
    completedAt,
    updatedAt: now,
  };

  return persistTask(updated);
}

export async function setTaskStatus(
  id: string,
  status: TaskStatus,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!current) return null;

  if (status === "pending_approval" || status === "needs_revision") {
    return null;
  }

  if (status === "completed") {
    if (taskNeedsApprovalWorkflow(current)) {
      return null;
    }
    if (!canDirectComplete(current, user) && !canEditTask(current, user)) {
      return null;
    }
  } else if (status === "in_progress") {
    if (!canStartTask(current, user) && current.status !== "in_progress") {
      if (!canChangeTaskStatus(current, user)) return null;
    }
  } else if (!canChangeTaskStatus(current, user)) {
    return null;
  }

  if (current.status === status) return current;

  const now = new Date().toISOString();
  const updated: Task = {
    ...current,
    status,
    completedAt: status === "completed" ? now : null,
    updatedAt: now,
  };

  return persistTask(updated);
}

export async function submitTaskForApproval(
  id: string,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!current) return null;
  if (!canSubmitForApproval(current, user)) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...current,
    status: "pending_approval",
    completedAt: null,
    updatedAt: now,
    reviewHistory: appendReviewEvent(
      current,
      {
        action: "submitted",
        actorUserId: user.id,
        actorName: user.name,
      },
      now,
    ),
  };

  return persistTask(updated);
}

export async function approveTask(
  id: string,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!current) return null;
  if (!canReviewTask(current, user)) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...current,
    status: "completed",
    completedAt: now,
    updatedAt: now,
    reviewHistory: appendReviewEvent(
      current,
      {
        action: "approved",
        actorUserId: user.id,
        actorName: user.name,
      },
      now,
    ),
  };

  return persistTask(updated);
}

export async function requestTaskRevision(
  id: string,
  comment: string,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!current) return null;
  if (!canReviewTask(current, user)) return null;

  const trimmed = comment.trim();
  if (!trimmed) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...current,
    status: "needs_revision",
    completedAt: null,
    updatedAt: now,
    reviewHistory: appendReviewEvent(
      current,
      {
        action: "revision_requested",
        actorUserId: user.id,
        actorName: user.name,
        comment: trimmed,
      },
      now,
    ),
  };

  return persistTask(updated);
}

export async function completeTask(
  id: string,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!current) return null;

  if (taskNeedsApprovalWorkflow(current)) {
    return submitTaskForApproval(id, user);
  }

  return setTaskStatus(id, "completed", user);
}

export async function deleteTask(
  id: string,
  user: SessionUser,
): Promise<boolean> {
  const task = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : ((await readStore()).tasks.find((t) => t.id === id) ?? null);
  if (!task) return false;

  if (!canDeleteTask(task, user)) return false;

  for (const attachment of task.attachments) {
    await deleteTaskAttachmentFile(attachment.id, attachment.fileName).catch(
      () => undefined,
    );
  }

  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbDeleteTask(id);
    } catch (error) {
      console.error("[tasks] supabase delete", error);
      return false;
    }
  }

  const store = await readStore();
  store.tasks = store.tasks.filter((t) => t.id !== id);
  await writeStore(store);
  return true;
}

export async function getTaskStats(): Promise<TaskStats> {
  const tasks = await listTasks();
  return {
    total: tasks.length,
    inProgress: tasks.filter(
      (t) => t.status === "in_progress" || t.status === "needs_revision",
    ).length,
    pendingApproval: tasks.filter((t) => t.status === "pending_approval").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    overdue: tasks.filter((t) => isTaskOverdue(t)).length,
  };
}

export async function addTaskAttachment(
  taskId: string,
  file: { buffer: Buffer; fileName: string; contentType: string; size: number },
  user: SessionUser,
): Promise<Task | null> {
  const current = await getTask(taskId);
  if (!current) return null;
  if (!canManageTaskAttachments(current, user)) return null;

  if (current.attachments.length >= MAX_TASK_ATTACHMENTS_PER_TASK) {
    throw new Error("Too many attachments");
  }

  if (file.size > MAX_TASK_ATTACHMENT_BYTES) {
    throw new Error("File too large");
  }

  const contentType = normalizeTaskAttachmentContentType(
    file.contentType,
    file.fileName,
  );
  if (!contentType) {
    throw new Error("Unsupported file type");
  }

  const attachmentId = randomUUID();
  const now = new Date().toISOString();
  const attachment: TaskAttachment = {
    id: attachmentId,
    fileName: file.fileName.trim() || "file",
    contentType,
    size: file.size,
    uploadedByUserId: user.id,
    uploadedByName: user.name,
    uploadedAt: now,
  };

  try {
    await saveTaskAttachmentFile(
      attachmentId,
      attachment.fileName,
      file.buffer,
      contentType,
    );
  } catch (error) {
    console.error("[tasks] attachment save", error);
    throw new Error("Failed to save attachment");
  }

  const updated: Task = {
    ...current,
    attachments: [...current.attachments, attachment],
    updatedAt: now,
  };

  return persistTask(updated);
}

export async function removeTaskAttachment(
  taskId: string,
  attachmentId: string,
  user: SessionUser,
): Promise<Task | null> {
  const current = await getTask(taskId);
  if (!current) return null;

  const attachment = current.attachments.find((item) => item.id === attachmentId);
  if (!attachment) return null;
  if (!canDeleteTaskAttachment(current, attachment, user)) return null;

  await deleteTaskAttachmentFile(attachment.id, attachment.fileName).catch(
    () => undefined,
  );

  const now = new Date().toISOString();
  const updated: Task = {
    ...current,
    attachments: current.attachments.filter((item) => item.id !== attachmentId),
    updatedAt: now,
  };

  return persistTask(updated);
}
