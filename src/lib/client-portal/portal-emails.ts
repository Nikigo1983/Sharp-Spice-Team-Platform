import "server-only";

import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import { buildClientPortalEmailHtml } from "@/lib/mail/client-portal-email-html";
import { sendEmail, type SendEmailResult } from "@/lib/mail/send-email";

const FROM_NAME = CLIENT_PORTAL_BRAND_NAME;

export async function sendClientInviteEmail(input: {
  to: string;
  firstName: string;
  loginUrl: string;
  temporaryPassword: string;
}): Promise<SendEmailResult> {
  const subject = `${CLIENT_PORTAL_BRAND_NAME}: доступ в клиентский портал`;
  const text = [
    `Здравствуйте, ${input.firstName}!`,
    "",
    `Вас пригласили в клиентский портал ${CLIENT_PORTAL_BRAND_NAME}.`,
    "",
    `Откройте вход: ${input.loginUrl}`,
    `Email: ${input.to}`,
    `Временный пароль: ${input.temporaryPassword}`,
    "",
    "После входа вы можете сменить пароль через «Забыли пароль?» на странице входа.",
    "",
    `— Команда ${CLIENT_PORTAL_BRAND_NAME}`,
  ].join("\n");

  const html = buildClientPortalEmailHtml({
    title: "Доступ в клиентский портал",
    greeting: `Здравствуйте, ${input.firstName}!`,
    paragraphs: [
      `Вас пригласили в клиентский портал ${CLIENT_PORTAL_BRAND_NAME}.`,
      `Email для входа: ${input.to}`,
      `Временный пароль: ${input.temporaryPassword}`,
      "После входа вы можете сменить пароль через «Забыли пароль?» на странице входа.",
    ],
    ctaLabel: "Открыть вход в портал",
    ctaUrl: input.loginUrl,
  });

  return sendEmail({
    to: input.to,
    subject,
    text,
    html,
    fromName: FROM_NAME,
  });
}

export async function sendClientPasswordResetEmail(input: {
  to: string;
  firstName: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  const subject = `${CLIENT_PORTAL_BRAND_NAME}: сброс пароля клиентского портала`;
  const text = [
    `Здравствуйте, ${input.firstName}!`,
    "",
    `Чтобы задать новый пароль для клиентского портала ${CLIENT_PORTAL_BRAND_NAME}, откройте ссылку (действует ограниченное время):`,
    input.resetUrl,
    "",
    "Если вы не запрашивали сброс, просто проигнорируйте это письмо.",
    "",
    `— Команда ${CLIENT_PORTAL_BRAND_NAME}`,
  ].join("\n");

  const html = buildClientPortalEmailHtml({
    title: "Сброс пароля",
    greeting: `Здравствуйте, ${input.firstName}!`,
    paragraphs: [
      `Чтобы задать новый пароль для клиентского портала ${CLIENT_PORTAL_BRAND_NAME}, нажмите кнопку ниже. Ссылка действует ограниченное время.`,
    ],
    ctaLabel: "Задать новый пароль",
    ctaUrl: input.resetUrl,
    footerNote:
      "Если вы не запрашивали сброс, просто проигнорируйте это письмо.",
  });

  return sendEmail({
    to: input.to,
    subject,
    text,
    html,
    fromName: FROM_NAME,
  });
}
