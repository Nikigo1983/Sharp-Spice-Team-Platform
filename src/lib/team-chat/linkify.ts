export type LinkifiedPart =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string };

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Убирает знаки препинания в конце URL, не входящие в ссылку. */
function splitUrlSuffix(url: string): { href: string; suffix: string } {
  let href = url;
  let suffix = "";
  while (/[)\]},.;:!?]$/.test(href)) {
    suffix = href.slice(-1) + suffix;
    href = href.slice(0, -1);
  }
  return { href, suffix };
}

export function linkifyText(text: string): LinkifiedPart[] {
  if (!text) return [];

  const parts: LinkifiedPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start) });
    }

    const { href, suffix } = splitUrlSuffix(rawUrl);
    if (href) {
      parts.push({ type: "link", href, label: href });
    } else {
      parts.push({ type: "text", value: rawUrl });
    }
    if (suffix) {
      parts.push({ type: "text", value: suffix });
    }

    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
}
