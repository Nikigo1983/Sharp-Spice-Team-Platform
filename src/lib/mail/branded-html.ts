import "server-only";

import { BRAND_NAME } from "@/lib/brand";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://sharp-spice-team-platform.vercel.app"
  );
}

/** PNG works in most mail clients; SVG often does not. */
export function emailLogoUrl(): string {
  return `${appOrigin()}/icons/icon-512x512.png`;
}

export function buildBrandedEmailHtml(input: {
  title: string;
  greeting: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}): string {
  const logoUrl = escapeHtml(emailLogoUrl());
  const ctaUrl = escapeHtml(input.ctaUrl);
  const paragraphsHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155;">${escapeHtml(p)}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0f1419;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1419;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 12px;text-align:center;background:#111827;">
              <img src="${logoUrl}" width="160" height="160" alt="${escapeHtml(BRAND_NAME)}" style="display:inline-block;width:160px;height:auto;max-width:70%;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">${escapeHtml(input.title)}</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155;">${escapeHtml(input.greeting)}</p>
              ${paragraphsHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
                <tr>
                  <td align="center" bgcolor="#910d0d" style="border-radius:8px;">
                    <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:#910d0d;">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">
                Если кнопка не открывается, перейдите по ссылке:<br />
                <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="color:#b45309;text-decoration:underline;">${ctaUrl}</a>
              </p>
              ${
                input.footerNote
                  ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(input.footerNote)}</p>`
                  : ""
              }
              <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#94a3b8;">— Команда ${escapeHtml(BRAND_NAME)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
