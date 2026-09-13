import { redirect } from "next/navigation";

type CrmLeadDetailPageProps = {
  params: Promise<{ id: string }>;
};

/** Formgrid lead detail — merged into portal intake. */
export default async function CrmLeadDetailPage(_props: CrmLeadDetailPageProps) {
  redirect("/clients/intake");
}
