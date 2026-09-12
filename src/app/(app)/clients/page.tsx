import { redirect } from "next/navigation";

/** Old Google Sheets CRM list — replaced by portal intake. */
export default function ClientsPage() {
  redirect("/clients/intake");
}
