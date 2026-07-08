import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handleListMeetingRecordings } from "@/lib/calendar/meeting-recording-handler";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await handleListMeetingRecordings(session);

  if ("status" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
