import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readClientFiltersFromSearchParams } from "@/lib/clients/read-client-filters";
import { rowsToCsv } from "@/lib/export/download-csv";
import { listAllClients } from "@/lib/google-sheets/service";

const EXPORT_HEADERS = [
  "Имя",
  "Латиница",
  "Паспорт",
  "Email",
  "Дата подачи",
  "Предполагаемое одобрение",
  "Референт",
  "Адрес букинга",
  "Дата букинга",
  "Дата одобрения ВНЖ",
  "Дата выдачи карточки ВНЖ",
  "Партнёр",
  "Договор",
  "Заметки",
];

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const { items } = await listAllClients(
    readClientFiltersFromSearchParams(searchParams),
  );

  const rows = items.map((client) => [
    client.name,
    client.citizenship ?? "",
    client.passportNumber ?? client.id,
    client.email ?? "",
    client.submittedAt ?? "",
    client.expectedApprovalAt ?? "",
    client.referentName ?? client.manager ?? "",
    client.bookingAddress ?? "",
    client.bookingRange ?? "",
    client.approvalAt ?? "",
    client.residenceCardIssuedAt ?? "",
    client.partnerName ?? "",
    client.contract ?? "",
    client.notes ?? "",
  ]);

  const csv = rowsToCsv(EXPORT_HEADERS, rows);
  const filename = `clients-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
