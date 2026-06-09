import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyTaskCreated } from "@/lib/notifications/emit";
import { createTask, getTaskStats, listTasks } from "@/lib/tasks/store";
import type { CreateTaskInput } from "@/lib/tasks/types";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("stats") === "1") {
    const stats = await getTaskStats();
    return NextResponse.json({ stats });
  }

  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateTaskInput;
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  try {
    const task = await createTask(body, session);
    await notifyTaskCreated({
      actorId: session.id,
      actorName: session.name,
      taskTitle: task.title,
      assigneeIds: task.assignees.map((assignee) => assignee.id),
    });
    return NextResponse.json({ task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create task";
    if (message.includes("assignees")) {
      return NextResponse.json(
        {
          error:
            "В Supabase не хватает колонки assignees. Выполните миграцию 002_task_assignees.sql в SQL Editor.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
