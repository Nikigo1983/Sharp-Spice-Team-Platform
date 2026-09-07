import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { savePushSubscription } from "@/lib/notifications/web-push-store";
import { getWebPushConfig } from "@/lib/notifications/web-push-config";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!getWebPushConfig()) {
    return NextResponse.json(
      { error: "Web push is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Body;
  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await savePushSubscription({
    userId: session.id,
    endpoint,
    keys: { p256dh, auth },
  });

  return NextResponse.json({ ok: true });
}
