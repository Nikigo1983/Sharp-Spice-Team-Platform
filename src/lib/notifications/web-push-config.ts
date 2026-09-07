import "server-only";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getWebPushConfig(): WebPushConfig | null {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "mailto:admin@sharp-spice.local";

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getWebPushPublicKey(): string | null {
  return getWebPushConfig()?.publicKey ?? null;
}
