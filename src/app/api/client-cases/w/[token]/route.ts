import { serveCaseFileFromCompactToken } from "@/lib/client-portal/case-file-word-open";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Short authenticated file URL for Microsoft Word protocol opens.
 * Prefer `/w/[token]/document.doc` — many licensed installs require a Word extension.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  return serveCaseFileFromCompactToken(token);
}
