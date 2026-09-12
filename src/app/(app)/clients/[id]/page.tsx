import { redirect } from "next/navigation";

/** Old Google Sheets CRM card — replaced by portal intake. */
export default function ClientPage() {
  redirect("/clients/intake");
}
