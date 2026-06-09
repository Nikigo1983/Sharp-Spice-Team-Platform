import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyTaskStatusChanged } from "@/lib/notifications/emit";
import { completeTask, deleteTask, getTask, setTaskStatus, updateTask } from "@/lib/tasks/store";
import type { TaskStatus, UpdateTaskInput } from "@/lib/tasks/types";
import { TASK_STATUSES } from "@/lib/tasks/types";

type RouteContext = { params: Promise<{ id: string }> };

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
    await notifyTaskStatusChanged({
      actorId: session.id,
      actorName: session.name,
      taskTitle: task.title,
      status: task.status,
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

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    action?: string;
    status?: TaskStatus;
  };

  if (body.action === "set_status" && body.status) {
    if (!TASK_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await getTask(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await setTaskStatus(id, body.status, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing && existing.status !== body.status) {
      await notifyTaskStatusChanged({
        actorId: session.id,
        actorName: session.name,
        taskTitle: task.title,
        status: task.status,
      });
    }

    return NextResponse.json({ task });
  }

  if (body.action === "complete") {
    const existing = await getTask(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await completeTask(id, session);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing && existing.status !== "completed") {
      await notifyTaskStatusChanged({
        actorId: session.id,
        actorName: session.name,
        taskTitle: task.title,
        status: "completed",
      });
    }

    return NextResponse.json({ task });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
