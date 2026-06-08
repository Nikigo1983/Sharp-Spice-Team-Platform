import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ClientDetailView } from "@/components/clients/ClientDetailView";
import { getClientDetail } from "@/lib/google-sheets/service";

type ClientPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const { id } = await params;
  const detail = await getClientDetail(decodeURIComponent(id));

  if (!detail) {
    notFound();
  }

  return (
    <AppShell sectionTitle={detail.client.name}>
      <ClientDetailView detail={detail} />
    </AppShell>
  );
}
