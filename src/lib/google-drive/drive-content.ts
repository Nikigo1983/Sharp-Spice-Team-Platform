import "server-only";

const PDF_MIME = "application/pdf";
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export function isPdfMime(mimeType: string): boolean {
  return mimeType === PDF_MIME || mimeType.includes("pdf");
}

export function isPlainTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  );
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return null;
  }

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy?.();
    const text = result.text?.trim();
    return text || null;
  } catch (error) {
    console.error("[drive-content] pdf parse failed", error);
    return null;
  }
}

export function extractPlainText(buffer: Buffer): string | null {
  const text = buffer.toString("utf8").trim();
  if (!text || text.includes("\u0000")) return null;
  return text;
}

export function snippetAroundTerms(
  text: string,
  tokens: string[],
  radius = 140,
): string {
  const lower = text.toLowerCase();
  let bestIndex = -1;
  let bestHits = 0;

  for (const token of tokens) {
    const index = lower.indexOf(token.toLowerCase());
    if (index < 0) continue;
    const hits = tokens.filter((t) => lower.includes(t.toLowerCase())).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestIndex = index;
    }
  }

  if (bestIndex < 0) {
    return text.slice(0, radius * 2);
  }

  const start = Math.max(0, bestIndex - radius);
  const end = Math.min(text.length, bestIndex + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
