import "server-only";

export type MailConfig = {
  enabled: boolean;
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

export function getMailConfig(): MailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const fromEmail =
    process.env.MAIL_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  const fromName =
    process.env.MAIL_FROM_NAME?.trim() || "Sharp & Spice";
  return {
    enabled: Boolean(apiKey),
    apiKey,
    fromEmail,
    fromName,
  };
}
