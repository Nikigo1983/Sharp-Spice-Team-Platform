import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { MeetingRecordingsView } from "@/components/meeting-recordings/MeetingRecordingsView";
import { getSession } from "@/lib/auth/session";

export default async function MeetingRecordingsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <AppShell sectionTitle="Записи встреч">
      <MeetingRecordingsView />
    </AppShell>
  );
}
