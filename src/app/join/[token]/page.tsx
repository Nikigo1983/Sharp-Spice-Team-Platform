import { GuestMeetRoom } from "@/components/meet/GuestMeetRoom";
import { GuestMeetingGate } from "@/components/meet/GuestMeetingGate";
import { resolveGuestMeetingPreview } from "@/lib/calendar/meeting-guest-handler";
import { sanitizeCalendarEventForClient } from "@/lib/calendar/meeting-guest-access";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function GuestJoinPage({ params }: PageProps) {
  const { token } = await params;
  const preview = await resolveGuestMeetingPreview(token);

  if ("error" in preview) {
    if (preview.error === "not_configured") {
      return <GuestMeetingGate variant="not_configured" />;
    }
    return <GuestMeetingGate variant="invalid_invite" />;
  }

  if (preview.phase === "waiting") {
    return <GuestMeetingGate variant="waiting" event={preview.event} />;
  }

  if (preview.phase === "closed") {
    return <GuestMeetingGate variant="closed" event={preview.event} />;
  }

  return (
    <GuestMeetRoom
      event={sanitizeCalendarEventForClient(preview.event)}
      inviteToken={token}
      requiresGuestPassword={preview.requiresGuestPassword}
    />
  );
}
