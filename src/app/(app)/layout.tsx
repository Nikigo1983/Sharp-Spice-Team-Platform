import { redirect } from "next/navigation";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <SessionProvider user={session}>
      <PresenceProvider>{children}</PresenceProvider>
    </SessionProvider>
  );
}
