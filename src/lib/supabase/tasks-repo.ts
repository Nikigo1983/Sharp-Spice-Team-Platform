import "server-only";

import { getSupabaseAdmin } from "./server";
import { normalizeAssignees } from "@/lib/tasks/assignees";
import type { Task, TaskStatus } from "@/lib/tasks/types";

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  created_by_user_id: string;
  created_by_name: string;
  assignees?: unknown;
  created_at: string;
  due_date: string | null;
  completed_at: string | null;
  updated_at: string;
};

function mapRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    assignees: normalizeAssignees(row.assignees),
    createdAt: row.created_at,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(task: Task): TaskRow {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    created_by_user_id: task.createdByUserId,
    created_by_name: task.createdByName,
    assignees: task.assignees,
    created_at: task.createdAt,
    due_date: task.dueDate,
    completed_at: task.completedAt,
    updated_at: task.updatedAt,
  };
}

export async function sbListTasks(): Promise<Task[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as TaskRow[]).map(mapRow);
}

export async function sbGetTask(id: string): Promise<Task | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as TaskRow) : null;
}

export async function sbInsertTask(task: Task): Promise<Task> {
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .insert(mapTask(task))
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as TaskRow);
}

export async function sbUpdateTask(task: Task): Promise<Task> {
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .update(mapTask(task))
    .eq("id", task.id)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as TaskRow);
}

export async function sbDeleteTask(id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("tasks")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}
