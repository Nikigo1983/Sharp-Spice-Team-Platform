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

  const task = await createTask(body, session);
  await notifyTaskCreated({
    actorId: session.id,
    actorName: session.name,
    taskTitle: task.title,
  });
  return NextResponse.json({ task });
}
