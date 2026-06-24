import "server-only";

import { getSupabaseAdmin } from "./server";
import { normalizeAssignees } from "@/lib/tasks/assignees";
import type { Task, TaskAttachment, TaskProgressReport, TaskReviewEvent, TaskStatus } from "@/lib/tasks/types";

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
  review_history?: unknown;
  attachments?: unknown;
  progress_reports?: unknown;
};

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

function normalizeProgressReports(raw: unknown): TaskProgressReport[] {
  if (!Array.isArray(raw)) return [];
  const reports: TaskProgressReport[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const report = item as Partial<TaskProgressReport>;
    if (
      !report.id ||
      !report.authorUserId ||
      !report.authorName ||
      typeof report.comment !== "string" ||
      !report.createdAt
    ) {
      continue;
    }
    let attachment: TaskAttachment | null = null;
    if (report.attachment && typeof report.attachment === "object") {
      const normalized = normalizeAttachments([report.attachment]);
      attachment = normalized[0] ?? null;
    }
    reports.push({
      id: report.id,
      authorUserId: report.authorUserId,
      authorName: report.authorName,
      comment: report.comment,
      attachment,
      createdAt: report.createdAt,
    });
  }
  return reports;
}

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
    reviewHistory: normalizeReviewHistory(row.review_history),
    attachments: normalizeAttachments(row.attachments),
    progressReports: normalizeProgressReports(row.progress_reports),
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
    review_history: task.reviewHistory,
    attachments: task.attachments,
    progress_reports: task.progressReports,
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
