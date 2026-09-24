import { NextResponse } from "next/server";
import { loadClientListWordExport } from "@/lib/export/client-list-word-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; name: string }>;
};

/**
 * Serve a temporary Word-compatible .doc for desktop ms-word: open.
 * Auth is the unguessable id (Word's HTTP client does not send site cookies).
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id, name } = await context.params;
  if (name !== "document.doc") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const stored = await loadClientListWordExport(id);
  if (!stored) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const filename = stored.filename.endsWith(".doc")
    ? stored.filename
    : `${stored.filename}.doc`;

  return new NextResponse(`\ufeff${stored.html}`, {
    status: 200,
    headers: {
      "Content-Type": "application/msword;charset=utf-8",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    },
  });
}
