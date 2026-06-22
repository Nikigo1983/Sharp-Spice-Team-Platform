import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CalendarView } from "@/components/calendar/CalendarView";
import { getSession } from "@/lib/auth/session";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <AppShell sectionTitle="Календарь">
      <Suspense fallback={<p>Загрузка…</p>}>
        <CalendarView user={session} />
      </Suspense>
    </AppShell>
  );
}
