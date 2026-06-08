import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TasksView } from "@/components/tasks/TasksView";
import { listTeamUsers } from "@/lib/auth/users";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const authors = listTeamUsers().map((u) => ({ id: u.id, name: u.name }));

  return (
    <AppShell sectionTitle="Задачи">
      <Suspense fallback={<p>Загрузка…</p>}>
        <TasksView user={session} authors={authors} />
      </Suspense>
    </AppShell>
  );
}
