import * as https from "node:https";

function isTlsFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const causeMessage =
    error && typeof error === "object" && "cause" in error
      ? String((error as { cause?: unknown }).cause ?? "")
      : "";
  const combined = `${message} ${causeMessage}`.toLowerCase();
  return (
    combined.includes("unable_to_verify_leaf_signature") ||
    combined.includes("unable to verify the first certificate") ||
    combined.includes("fetch failed")
  );
}

function httpsRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  redirectDepth = 0,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (redirectDepth > 5) {
      reject(new Error("[google-fetch] too many redirects"));
      return;
    }

    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          const location = res.headers.location;

          if (
            location &&
            (status === 301 ||
              status === 302 ||
              status === 303 ||
              status === 307 ||
              status === 308)
          ) {
            httpsRequest(
              new URL(location, url).toString(),
              options,
              redirectDepth + 1,
            )
              .then(resolve)
              .catch(reject);
            return;
          }

          resolve({ status, body });
        });
      },
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function buildRequestInit(init?: RequestInit): {
  method: string;
  headers: Record<string, string>;
  body?: string;
} {
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers[key] = value;
    });
  }

  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : undefined;

  return {
    method: init?.method ?? "GET",
    headers,
    body,
  };
}

async function fetchViaHttps(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const { method, headers, body } = buildRequestInit(init);
  const result = await httpsRequest(url, { method, headers, body });
  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Server-side fetch with TLS workaround for broken CA chains on Windows. */
export async function fetchWithTlsFallback(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // Prefer Node https (dev-friendly on Windows); fall back to global fetch.
  try {
    return await fetchViaHttps(url, init);
  } catch (httpsError) {
    try {
      return await fetch(url, { ...init, cache: "no-store" });
    } catch (fetchError) {
      if (isTlsFetchError(fetchError) || isTlsFetchError(httpsError)) {
        return fetchViaHttps(url, init);
      }
      throw fetchError;
    }
  }
}
