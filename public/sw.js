const CACHE_NAME = "sharp-spice-pwa-v7";

const PRECACHE_URLS = [
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-192x192.png",
  "/icons/icon-maskable-512x512.png",
  "/favicon.jpg",
];

async function applyBadge(count) {
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (safe <= 0 && typeof self.registration.clearAppBadge === "function") {
      await self.registration.clearAppBadge();
      return;
    }
    if (typeof self.registration.setAppBadge === "function") {
      await self.registration.setAppBadge(safe);
    }
  } catch {
    // Badging may be unsupported.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn("[sw] precache skipped:", url, error);
          }
        }),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SS_SET_BADGE") {
    event.waitUntil(applyBadge(data.count));
    return;
  }

  if (data.type === "SS_SHOW_NOTIFICATION") {
    const title = String(data.title || "Sharp & Spice");
    const options = {
      body: String(data.body || ""),
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.tag || `ss-${Date.now()}`,
      renotify: true,
      requireInteraction: false,
      silent: false,
      data: {
        url: data.url || "/",
        notificationId: data.notificationId || null,
      },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Sharp & Spice",
    body: "",
    url: "/",
    tag: `ss-push-${Date.now()}`,
    count: null,
  };

  try {
    if (event.data) {
      const json = event.data.json();
      payload = {
        title: String(json.title || payload.title),
        body: String(json.body || ""),
        url: String(json.url || "/"),
        tag: String(json.tag || payload.tag),
        count: json.count == null ? null : Number(json.count),
      };
    }
  } catch {
    try {
      payload.body = event.data ? event.data.text() : "";
    } catch {
      // ignore
    }
  }

  event.waitUntil(
    (async () => {
      if (payload.count != null && !Number.isNaN(payload.count)) {
        await applyBadge(payload.count);
      }
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        tag: payload.tag,
        renotify: true,
        silent: false,
        requireInteraction: false,
        data: { url: payload.url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && targetUrl) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore navigate failures
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/sw.js" ||
    url.pathname === "/manifest.json"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
