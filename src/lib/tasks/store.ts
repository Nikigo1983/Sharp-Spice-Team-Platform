import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";
import { normalizeAssignees } from "./assignees";
import { isTaskOverdue } from "./overdue";
import {
  canChangeTaskStatus,
  canDeleteTask,
  canEditTask,
} from "./permissions";
import type {
  CreateTaskInput,
  Task,
  TaskAssignee,
  TaskStats,
  TaskStatus,
  UpdateTaskInput,
} from "./types";
import { listTeamMembers } from "@/lib/team/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sbTasks from "@/lib/supabase/tasks-repo";

const STORE_PATH = path.join(process.cwd(), ".data", "tasks.json");

type TaskStore = {
  tasks: Task[];
};

function normalizeTask(task: Task): Task {
  return {
    ...task,
    assignees: normalizeAssignees(task.assignees),
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

export { canChangeTaskStatus, canDeleteTask, canEditTask };

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
    : (await readStore()).tasks.find((t) => t.id === id) ?? null;
  if (!current) return null;

  const canEdit =
    user.role === "owner" || current.createdByUserId === user.id;
  if (!canEdit) return null;

  const nextStatus = input.status ?? current.status;
  const now = new Date().toISOString();
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

  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbUpdateTask(updated);
    } catch (error) {
      console.error("[tasks] supabase update", error);
      return null;
    }
  }

  const store = await readStore();
  const index = store.tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  store.tasks[index] = updated;
  await writeStore(store);
  return updated;
}

export async function setTaskStatus(
  id: string,
  status: TaskStatus,
  user: SessionUser,
): Promise<Task | null> {
  const current = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : (await readStore()).tasks.find((t) => t.id === id) ?? null;
  if (!current) return null;
  if (!canChangeTaskStatus(current, user)) return null;
  if (current.status === status) return current;

  const now = new Date().toISOString();
  const updated: Task = {
    ...current,
    status,
    completedAt: status === "completed" ? now : null,
    updatedAt: now,
  };

  if (isSupabaseConfigured()) {
    try {
      return await sbTasks.sbUpdateTask(updated);
    } catch (error) {
      console.error("[tasks] supabase status", error);
      return null;
    }
  }

  const store = await readStore();
  const index = store.tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  store.tasks[index] = updated;
  await writeStore(store);
  return updated;
}

export async function completeTask(
  id: string,
  user: SessionUser,
): Promise<Task | null> {
  return setTaskStatus(id, "completed", user);
}

export async function deleteTask(
  id: string,
  user: SessionUser,
): Promise<boolean> {
  const task = isSupabaseConfigured()
    ? await sbTasks.sbGetTask(id)
    : (await readStore()).tasks.find((t) => t.id === id) ?? null;
  if (!task) return false;

  const canDelete =
    user.role === "owner" || task.createdByUserId === user.id;
  if (!canDelete) return false;

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
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    overdue: tasks.filter((t) => isTaskOverdue(t)).length,
  };
}

