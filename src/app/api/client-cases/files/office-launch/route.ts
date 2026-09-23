import { NextResponse } from "next/server";
import {
  isWordOpenUrlWithinLimit,
  verifyCompactCaseFileToken,
} from "@/lib/client-portal/case-file-office-token";
import {
  buildMsWordEditUri,
  buildWordDocumentFileUrl,
  wordOpenPathFileName,
} from "@/lib/client-portal/case-file-word-open-url";

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
 * Same-origin redirect into the ms-word: protocol.
 * Chrome percent-encodes `|` in direct ms-word: links (Office then rejects the
 * command). Following a 302 Location with literal pipes avoids that.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("t") || "").trim();
  if (!token || !verifyCompactCaseFileToken(token)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const extParam = (url.searchParams.get("ext") || "doc").toLowerCase();
  const originalName =
    extParam === "docx" ? "document.docx" : "document.doc";
  const fileUrl = buildWordDocumentFileUrl(
    requestOrigin(request),
    token,
    originalName,
  );
  if (!isWordOpenUrlWithinLimit(fileUrl)) {
    return NextResponse.json({ error: "URL_TOO_LONG" }, { status: 500 });
  }

  // Ensure path uses the normalized name we allow on the file route.
  void wordOpenPathFileName(originalName);

  const location = buildMsWordEditUri(fileUrl);
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  });
}
