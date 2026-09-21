import { redirect } from "next/navigation";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { StaffAppChrome } from "@/components/layout/StaffAppChrome";
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
      <PresenceProvider>
        <StaffAppChrome user={session}>{children}</StaffAppChrome>
      </PresenceProvider>
    </SessionProvider>
  );
}
