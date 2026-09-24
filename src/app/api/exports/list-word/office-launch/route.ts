import { NextResponse } from "next/server";
import {
  buildClientListWordFileUrl,
  loadClientListWordExport,
} from "@/lib/export/client-list-word-store";
import { buildMsWordEditUri } from "@/lib/client-portal/case-file-word-open-url";
import { isWordOpenUrlWithinLimit } from "@/lib/client-portal/case-file-office-token";

export const runtime = "nodejs";

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

/**
 * Same-origin 302 → ms-word: so Chrome does not percent-encode `|`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = (url.searchParams.get("t") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const stored = await loadClientListWordExport(id);
  if (!stored) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const fileUrl = buildClientListWordFileUrl(requestOrigin(request), id);
  if (!isWordOpenUrlWithinLimit(fileUrl)) {
    return NextResponse.json({ error: "URL_TOO_LONG" }, { status: 500 });
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: buildMsWordEditUri(fileUrl),
      "Cache-Control": "no-store",
    },
  });
}
