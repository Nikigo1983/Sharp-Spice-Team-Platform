export function buildMailtoShareUrl(
  inviteText: string,
  options: {
    subject: string;
    recipientEmail?: string | null;
  },
): string {
  const subject = encodeURIComponent(options.subject);
  const body = encodeURIComponent(inviteText);
  const recipient = options.recipientEmail?.trim()
    ? encodeURIComponent(options.recipientEmail.trim())
    : "";

  return recipient
    ? `mailto:${recipient}?subject=${subject}&body=${body}`
    : `mailto:?subject=${subject}&body=${body}`;
}

export function buildWhatsAppShareUrl(
  inviteText: string,
  phone?: string | null,
): string {
  const text = encodeURIComponent(inviteText);
  const digits = phone?.replace(/\D/g, "") ?? "";

  return digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function buildTelegramShareUrl(
  inviteText: string,
  guestJoinUrl: string,
): string {
  const textWithoutUrl = inviteText
    .split("\n")
    .filter((line) => line.trim() !== guestJoinUrl.trim())
    .join("\n")
    .trim();

  return `https://t.me/share/url?url=${encodeURIComponent(guestJoinUrl)}&text=${encodeURIComponent(textWithoutUrl)}`;
}
