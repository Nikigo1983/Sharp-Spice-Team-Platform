import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CalendarView } from "@/components/calendar/CalendarView";
import { getSession } from "@/lib/auth/session";
import { listTeamMembers } from "@/lib/team/store";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const teamMembers = (await listTeamMembers()).map((member) => ({
    id: member.id,
    name: member.name,
  }));

  return (
    <AppShell sectionTitle="Календарь">
      <Suspense fallback={<p>Загрузка…</p>}>
        <CalendarView user={session} teamMembers={teamMembers} />
      </Suspense>
    </AppShell>
  );
}
