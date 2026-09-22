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
  locale?: "ru" | "en";
}): Promise<SendEmailResult> {
  const locale = input.locale === "en" ? "en" : "ru";
  const brand = CLIENT_PORTAL_BRAND_NAME;

  if (locale === "en") {
    const subject = `${brand}: access to the client portal`;
    const text = [
      `Hello, ${input.firstName}!`,
      "",
      `You have been invited to the ${brand} client portal.`,
      "",
      `Sign in here: ${input.loginUrl}`,
      `Email: ${input.to}`,
      `Temporary password: ${input.temporaryPassword}`,
      "",
      'After signing in, you can change your password via “Forgot password?” on the login page.',
      "",
      `— The ${brand} team`,
    ].join("\n");

    const html = buildClientPortalEmailHtml({
      locale: "en",
      title: "Client portal access",
      greeting: `Hello, ${input.firstName}!`,
      paragraphs: [
        `You have been invited to the ${brand} client portal.`,
        `Sign-in email: ${input.to}`,
        `Temporary password: ${input.temporaryPassword}`,
        'After signing in, you can change your password via “Forgot password?” on the login page.',
      ],
      ctaLabel: "Open portal sign-in",
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

  const subject = `${brand}: доступ в клиентский портал`;
  const text = [
    `Здравствуйте, ${input.firstName}!`,
    "",
    `Вас пригласили в клиентский портал ${brand}.`,
    "",
    `Откройте вход: ${input.loginUrl}`,
    `Email: ${input.to}`,
    `Временный пароль: ${input.temporaryPassword}`,
    "",
    "После входа вы можете сменить пароль через «Забыли пароль?» на странице входа.",
    "",
    `— Команда ${brand}`,
  ].join("\n");

  const html = buildClientPortalEmailHtml({
    locale: "ru",
    title: "Доступ в клиентский портал",
    greeting: `Здравствуйте, ${input.firstName}!`,
    paragraphs: [
      `Вас пригласили в клиентский портал ${brand}.`,
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

export async function sendProcessStatusChangedEmail(input: {
  to: string;
  firstName: string;
  status: string;
  portalUrl: string;
}): Promise<SendEmailResult> {
  const subject = `${CLIENT_PORTAL_BRAND_NAME}: обновлён статус вашего дела`;
  const text = [
    `Здравствуйте, ${input.firstName}!`,
    "",
    `Статус вашего дела в портале ${CLIENT_PORTAL_BRAND_NAME} обновлён:`,
    input.status,
    "",
    `Открыть портал: ${input.portalUrl}`,
    "",
    `— Команда ${CLIENT_PORTAL_BRAND_NAME}`,
  ].join("\n");

  const html = buildClientPortalEmailHtml({
    title: "Статус дела обновлён",
    greeting: `Здравствуйте, ${input.firstName}!`,
    paragraphs: [
      `Статус вашего дела в портале ${CLIENT_PORTAL_BRAND_NAME} обновлён:`,
      input.status,
    ],
    ctaLabel: "Открыть портал",
    ctaUrl: input.portalUrl,
  });

  return sendEmail({
    to: input.to,
    subject,
    text,
    html,
    fromName: FROM_NAME,
  });
}
