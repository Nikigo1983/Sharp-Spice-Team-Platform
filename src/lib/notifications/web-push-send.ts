import "server-only";

import webpush from "web-push";
import { getNotificationHref } from "@/lib/notifications/navigation";
import type { Notification } from "@/lib/notifications/types";
import { getWebPushConfig } from "./web-push-config";
import {
  listPushSubscriptionsForUser,
  removePushSubscription,
} from "./web-push-store";

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  count: number | null;
};

function buildPayload(notification: Notification): WebPushPayload {
  const isChat = notification.type === "team_chat";
  const href =
    getNotificationHref(notification.type, notification.message) || "/";
  return {
    title: isChat
      ? notification.author_name?.trim() || notification.title
      : notification.title,
    body: isChat
      ? notification.message
      : notification.author_name
        ? `${notification.author_name}: ${notification.message}`
        : notification.message,
    url: href,
    tag: `ss-notif-${notification.id}`,
    count: null,
  };
}

export async function sendWebPushForNotification(
  notification: Notification,
): Promise<void> {
  const config = getWebPushConfig();
  if (!config) return;

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const payload = buildPayload(notification);
  const subscriptions = await listPushSubscriptionsForUser(
    notification.user_id,
  );
  if (!subscriptions.length) return;

  await Promise.all(
    subscriptions.map(async (record) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: record.endpoint,
            keys: record.keys,
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(record.endpoint);
          return;
        }
        console.error("[web-push] send failed", record.endpoint, error);
      }
    }),
  );
}
