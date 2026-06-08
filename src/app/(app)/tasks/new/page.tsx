import { AppShell } from "@/components/layout/AppShell";
import { NewTaskPageView } from "@/components/tasks/NewTaskPageView";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function NewTaskPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell sectionTitle="Задачи">
      <NewTaskPageView />
    </AppShell>
  );
}
