import { redirect } from "next/navigation";

/** Formgrid lead review queue — merged into portal intake. */
export default function CrmLeadsPage() {
  redirect("/clients/intake");
}
