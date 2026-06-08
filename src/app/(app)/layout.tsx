import { redirect } from "next/navigation";
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

  return <SessionProvider user={session}>{children}</SessionProvider>;
}
