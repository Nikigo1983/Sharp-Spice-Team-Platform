import "server-only";

import {
  CLIENT_PORTAL_BRAND_NAME,
  CLIENT_PORTAL_COLORS,
  CLIENT_PORTAL_LOGO_PATH,
} from "@/lib/client-portal/brand";

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

export function clientPortalEmailLogoUrl(): string {
  return `${appOrigin()}${CLIENT_PORTAL_LOGO_PATH}`;
}

/** Branded HTML for Emigrant client-portal emails (invite / password reset). */
export function buildClientPortalEmailHtml(input: {
  title: string;
  greeting: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}): string {
  const logoUrl = escapeHtml(clientPortalEmailLogoUrl());
  const ctaUrl = escapeHtml(input.ctaUrl);
  const blue = CLIENT_PORTAL_COLORS.blue;
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
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:32px 28px 28px;background:#ffffff;">
              <div style="text-align:center;margin:0 0 24px;">
                <img src="${logoUrl}" width="180" height="72" alt="${escapeHtml(CLIENT_PORTAL_BRAND_NAME)}" style="display:inline-block;width:180px;height:auto;max-width:70%;border:0;outline:none;text-decoration:none;border-radius:8px;" />
              </div>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1a2b48;font-weight:700;">${escapeHtml(input.title)}</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155;">${escapeHtml(input.greeting)}</p>
              ${paragraphsHtml}
              <p style="margin:0 0 18px;padding:12px 14px;font-size:13px;line-height:1.55;color:#475569;background:#f4f6fb;border:1px solid #e2e8f0;border-radius:10px;">
                Если письмо попало в «Спам», некоторые сервисы отключают ссылки и кнопки. Отметьте письмо как «Не спам» — и они снова станут активными.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
                <tr>
                  <td align="center" bgcolor="${blue}" style="border-radius:8px;">
                    <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:${blue};">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">
                Если кнопка не открывается, перейдите по ссылке:<br />
                <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="color:${blue};text-decoration:underline;">${ctaUrl}</a>
              </p>
              ${
                input.footerNote
                  ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(input.footerNote)}</p>`
                  : ""
              }
              <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#94a3b8;">— Команда ${escapeHtml(CLIENT_PORTAL_BRAND_NAME)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
