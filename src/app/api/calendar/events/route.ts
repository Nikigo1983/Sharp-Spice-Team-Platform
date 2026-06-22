import { NextResponse } from "next/server";
import {
  handleCreateCalendarEvent,
  handleListCalendarEvents,
} from "@/lib/calendar/handlers";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const result = await handleListCalendarEvents(
    session,
    searchParams.get("from"),
    searchParams.get("to"),
    searchParams.get("scopes"),
  );

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ events: result.events });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = await handleCreateCalendarEvent(session, body);

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ event: result.event }, { status: 201 });
}
