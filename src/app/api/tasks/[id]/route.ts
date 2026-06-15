import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyTaskStatusUpdate } from "@/lib/notifications/emit";
import {
  approveTask,
  completeTask,
  deleteTask,
  getTask,
  requestTaskRevision,
  setTaskStatus,
  submitTaskForApproval,
  updateTask,
} from "@/lib/tasks/store";
import type { TaskStatus, UpdateTaskInput } from "@/lib/tasks/types";
import { TASK_STATUSES } from "@/lib/tasks/types";

type RouteContext = { params: Promise<{ id: string }> };

const WORKFLOW_ONLY_STATUSES = new Set<TaskStatus>([
  "pending_approval",
  "needs_revision",
]);

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as UpdateTaskInput;
  const existing = await getTask(id);
  const task = await updateTask(id, body, session);

  if (!task) {
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.status && existing && body.status !== existing.status) {
    await notifyTaskStatusUpdate({
      actorId: session.id,
      actorName: session.name,
      taskTitle: task.title,
      previousStatus: existing.status,
      newStatus: task.status,
      creatorUserId: existing.createdByUserId,
      assigneeIds: existing.assignees.map((assignee) => assignee.id),
      revisionComment: null,
    });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ok = await deleteTask(id, session);
  if (!ok) {
    const existing = await getTask(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}

async function notifyTransition(
  session: { id: string; name: string },
  existing: NonNullable<Awaited<ReturnType<typeof getTask>>>,
  task: NonNullable<Awaited<ReturnType<typeof getTask>>>,
  revisionComment?: string | null,
) {
  if (existing.status === task.status) return;

  await notifyTaskStatusUpdate({
    actorId: session.id,
    actorName: session.name,
    taskTitle: task.title,
    previousStatus: existing.status,
    newStatus: task.status,
    creatorUserId: existing.createdByUserId,
    assigneeIds: existing.assignees.map((assignee) => assignee.id),
    revisionComment: revisionComment ?? null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    action?: string;
    status?: TaskStatus;
    comment?: string;
  };

  const existing = await getTask(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "submit_for_approval") {
    const task = await submitTaskForApproval(id, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await notifyTransition(session, existing, task);
    return NextResponse.json({ task });
  }

  if (body.action === "approve") {
    const task = await approveTask(id, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await notifyTransition(session, existing, task);
    return NextResponse.json({ task });
  }

  if (body.action === "request_revision") {
    const comment = body.comment?.trim() ?? "";
    if (!comment) {
      return NextResponse.json({ error: "Comment required" }, { status: 400 });
    }
    const task = await requestTaskRevision(id, comment, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await notifyTransition(session, existing, task, comment);
    return NextResponse.json({ task });
  }

  if (body.action === "set_status" && body.status) {
    if (!TASK_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (WORKFLOW_ONLY_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
    }

    const task = await setTaskStatus(id, body.status, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await notifyTransition(session, existing, task);
    return NextResponse.json({ task });
  }

  if (body.action === "complete") {
    const task = await completeTask(id, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await notifyTransition(session, existing, task);
    return NextResponse.json({ task });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
