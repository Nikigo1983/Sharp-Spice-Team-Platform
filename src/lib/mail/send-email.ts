import "server-only";

import { getMailConfig } from "./config";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Overrides MAIL_FROM_NAME for this send (e.g. Emigrant client emails). */
  fromName?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; code: "EMAIL_NOT_CONFIGURED" | "EMAIL_SEND_FAILED" };

/**
 * Transactional email via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Set RESEND_API_KEY (+ optional MAIL_FROM_EMAIL / MAIL_FROM_NAME) on Vercel.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const config = getMailConfig();
  if (!config.enabled) {
    return { ok: false, code: "EMAIL_NOT_CONFIGURED" };
  }

  const to = input.to.trim().toLowerCase();
  if (!to || !input.subject.trim() || !input.text.trim()) {
    return { ok: false, code: "EMAIL_SEND_FAILED" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${input.fromName?.trim() || config.fromName} <${config.fromEmail}>`,
        to: [to],
        subject: input.subject.trim(),
        text: input.text,
        html:
          input.html ??
          `<p style="font-family:Inter,system-ui,sans-serif;line-height:1.5">${escapeHtml(input.text).replaceAll("\n", "<br/>")}</p>`,
      }),
    });

    if (!response.ok) {
      console.error(
        "[mail] resend failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return { ok: false, code: "EMAIL_SEND_FAILED" };
    }

    const data = (await response.json()) as { id?: string };
    return {
      ok: true,
      id: typeof data.id === "string" ? data.id : null,
    };
  } catch (error) {
    console.error("[mail] resend error", error);
    return { ok: false, code: "EMAIL_SEND_FAILED" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
