import "server-only";

import { BRAND_NAME } from "@/lib/brand";
import { sendEmail, type SendEmailResult } from "@/lib/mail/send-email";

function linkify(htmlEscapedText: string, urls: string[]): string {
  let html = htmlEscapedText;
  for (const url of urls) {
    const escaped = escapeHtml(url);
    html = html.replaceAll(
      escaped,
      `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a>`,
    );
  }
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendClientInviteEmail(input: {
  to: string;
  firstName: string;
  loginUrl: string;
  temporaryPassword: string;
}): Promise<SendEmailResult> {
  const subject = `${BRAND_NAME}: доступ в клиентский портал`;
  const text = [
    `Здравствуйте, ${input.firstName}!`,
    "",
    `Вас пригласили в клиентский портал ${BRAND_NAME}.`,
    "",
    `Вход: ${input.loginUrl}`,
    `Email: ${input.to}`,
    `Временный пароль: ${input.temporaryPassword}`,
    "",
    "После входа вы можете сменить пароль через «Забыли пароль?» на странице входа.",
    "",
    `— Команда ${BRAND_NAME}`,
  ].join("\n");

  const htmlBody = linkify(escapeHtml(text).replaceAll("\n", "<br/>"), [
    input.loginUrl,
  ]);

  return sendEmail({
    to: input.to,
    subject,
    text,
    html: `<p style="font-family:Inter,system-ui,sans-serif;line-height:1.5">${htmlBody}</p>`,
  });
}

export async function sendClientPasswordResetEmail(input: {
  to: string;
  firstName: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  const subject = `${BRAND_NAME}: сброс пароля клиентского портала`;
  const text = [
    `Здравствуйте, ${input.firstName}!`,
    "",
    `Чтобы задать новый пароль для клиентского портала ${BRAND_NAME}, откройте ссылку (действует ограниченное время):`,
    input.resetUrl,
    "",
    "Если вы не запрашивали сброс, просто проигнорируйте это письмо.",
    "",
    `— Команда ${BRAND_NAME}`,
  ].join("\n");

  const htmlBody = linkify(escapeHtml(text).replaceAll("\n", "<br/>"), [
    input.resetUrl,
  ]);

  return sendEmail({
    to: input.to,
    subject,
    text,
    html: `<p style="font-family:Inter,system-ui,sans-serif;line-height:1.5">${htmlBody}</p>`,
  });
}
