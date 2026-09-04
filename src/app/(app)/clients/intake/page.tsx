import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function ClientPortalIntakePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/clients/intake");
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <h1 style={{ marginTop: 0 }}>Заявки клиентского портала</h1>
      <p style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
        Здесь позже появятся анкеты, отправленные через новый клиентский портал
        (как в Spiora). Пока раздел-заглушка.
      </p>
      <p style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
        Старый поток Formgrid по-прежнему здесь:{" "}
        <Link href="/new-formgrid-clients">Новые клиенты из анкеты</Link>.
      </p>
    </div>
  );
}
