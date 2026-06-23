import { NextResponse } from "next/server";
import { verifyCalendarCronRequest } from "@/lib/calendar/cron-auth";
import { runCalendarReminderCron } from "@/lib/calendar/reminders-cron";

export async function GET(request: Request) {
  if (!verifyCalendarCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCalendarReminderCron();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[calendar-reminders-cron] failed", error);
    return NextResponse.json(
      { error: "Calendar reminder cron failed" },
      { status: 500 },
    );
  }
}
