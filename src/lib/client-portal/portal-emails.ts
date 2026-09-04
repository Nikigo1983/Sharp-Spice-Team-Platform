import "server-only";

import { BRAND_NAME } from "@/lib/brand";
import { buildBrandedEmailHtml } from "@/lib/mail/branded-html";
import { sendEmail, type SendEmailResult } from "@/lib/mail/send-email";

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
    `Откройте вход: ${input.loginUrl}`,
    `Email: ${input.to}`,
    `Временный пароль: ${input.temporaryPassword}`,
    "",
    "После входа вы можете сменить пароль через «Забыли пароль?» на странице входа.",
    "",
    `— Команда ${BRAND_NAME}`,
  ].join("\n");

  const html = buildBrandedEmailHtml({
    title: "Доступ в клиентский портал",
    greeting: `Здравствуйте, ${input.firstName}!`,
    paragraphs: [
      `Вас пригласили в клиентский портал ${BRAND_NAME}.`,
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

  const html = buildBrandedEmailHtml({
    title: "Сброс пароля",
    greeting: `Здравствуйте, ${input.firstName}!`,
    paragraphs: [
      `Чтобы задать новый пароль для клиентского портала ${BRAND_NAME}, нажмите кнопку ниже. Ссылка действует ограниченное время.`,
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
  });
}
