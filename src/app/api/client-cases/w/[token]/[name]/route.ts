import { serveCaseFileFromCompactToken } from "@/lib/client-portal/case-file-word-open";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string; name: string }> };

const ALLOWED_NAMES = new Set(["document.doc", "document.docx"]);

/**
 * Word-open URL with a real `.doc` / `.docx` path suffix.
 * Licensed Office often rejects ms-word: commands when the document URL has no extension.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { token, name } = await context.params;
  const fileName = decodeURIComponent(name || "").trim().toLowerCase();
  if (!ALLOWED_NAMES.has(fileName)) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return serveCaseFileFromCompactToken(token);
}
