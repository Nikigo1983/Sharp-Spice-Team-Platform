import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { TeamView } from "@/components/team/TeamView";
import { getSession } from "@/lib/auth/session";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell sectionTitle="Team">
      <TeamView user={session} />
    </AppShell>
  );
}
