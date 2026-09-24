import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  buildClientListWordDoc,
  clientListWordFilename,
  type ClientListWordExportInput,
} from "@/lib/export/client-list-word";
import {
  buildClientListWordFileUrl,
  buildClientListWordLaunchUrl,
  mintClientListWordExportId,
  saveClientListWordExport,
} from "@/lib/export/client-list-word-store";
import {
  buildMsWordAbbreviatedUri,
  buildMsWordEditUri,
} from "@/lib/client-portal/case-file-word-open-url";
import { isWordOpenUrlWithinLimit } from "@/lib/client-portal/case-file-office-token";

export const runtime = "nodejs";

const MAX_ROWS = 2000;
const MAX_HEADERS = 40;

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: ClientListWordExportInput & { filename?: string };
  try {
    body = (await request.json()) as ClientListWordExportInput & {
      filename?: string;
    };
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const headers = Array.isArray(body.headers) ? body.headers : [];
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!title || headers.length === 0 || headers.length > MAX_HEADERS) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  if (rows.length === 0 || rows.length > MAX_ROWS) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const input: ClientListWordExportInput = {
    title,
    subtitle: typeof body.subtitle === "string" ? body.subtitle : null,
    headers: headers.map((h) => String(h ?? "")),
    rows: rows.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "")),
    ),
  };

  const html = buildClientListWordDoc(input);
  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim().slice(0, 80)
      : clientListWordFilename("spisok-klientov");

  const id = mintClientListWordExportId();
  const saved = await saveClientListWordExport(id, { html, filename });
  if (!saved) {
    return NextResponse.json({ error: "STORE_FAILED" }, { status: 500 });
  }

  const origin = requestOrigin(request);
  const fileUrl = buildClientListWordFileUrl(origin, id);
  if (!isWordOpenUrlWithinLimit(fileUrl)) {
    return NextResponse.json({ error: "URL_TOO_LONG" }, { status: 500 });
  }

  return NextResponse.json({
    fileUrl,
    launchUrl: buildClientListWordLaunchUrl(origin, id),
    msWordUri: buildMsWordEditUri(fileUrl),
    msWordUriAbbreviated: buildMsWordAbbreviatedUri(fileUrl),
  });
}
