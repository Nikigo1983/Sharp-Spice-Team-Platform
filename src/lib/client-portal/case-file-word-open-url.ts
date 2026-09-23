/** Stable short name with Office extension — required by many licensed Word installs. */
export function wordOpenPathFileName(
  originalFileName: string,
): "document.doc" | "document.docx" {
  return originalFileName.toLowerCase().endsWith(".docx")
    ? "document.docx"
    : "document.doc";
}

export function buildWordDocumentFileUrl(
  origin: string,
  compactToken: string,
  originalFileName: string,
): string {
  const name = wordOpenPathFileName(originalFileName);
  // Token is base64url / hex — path-safe; avoid extra encoding that Office may reject.
  return `${origin}/api/client-cases/w/${compactToken}/${name}`;
}

export function buildMsWordEditUri(absoluteFileUrl: string): string {
  return `ms-word:ofe|u|${absoluteFileUrl}`;
}

/** Abbreviated form (no `|`) — survives Chrome URL encoding; implies open-for-view. */
export function buildMsWordAbbreviatedUri(absoluteFileUrl: string): string {
  return `ms-word:${absoluteFileUrl}`;
}
