import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CalendarMeetRoom } from "@/components/meet/CalendarMeetRoom";
import { MeetingAccessGate } from "@/components/meet/MeetingAccessGate";
import { handleGetCalendarEvent } from "@/lib/calendar/handlers";
import { isVideoMeeting } from "@/lib/calendar/meeting";
import { getMeetingAccessPhase } from "@/lib/calendar/meeting-window";
import { getSession } from "@/lib/auth/session";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function CalendarMeetPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { eventId } = await params;
  const result = await handleGetCalendarEvent(session, eventId);

  if ("status" in result) {
    return <MeetingAccessGate variant="not_found" eventId={eventId} />;
  }

  const event = result.event;

  if (!isVideoMeeting(event)) {
    return <MeetingAccessGate variant="not_video" event={event} />;
  }

  const phase = getMeetingAccessPhase(event);
  if (phase === "waiting") {
    return <MeetingAccessGate variant="waiting" event={event} />;
  }
  if (phase === "closed") {
    return <MeetingAccessGate variant="closed" event={event} />;
  }

  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          Подключение к видеовстрече…
        </div>
      }
    >
      <CalendarMeetRoom event={event} />
    </Suspense>
  );
}
