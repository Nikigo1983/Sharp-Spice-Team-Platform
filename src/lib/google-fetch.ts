import { currentAiSignal } from "@/lib/ai/request-scope";

/** Compatibility name. TLS verification stays enabled; response bodies remain streams.
 * Local corporate CAs must be configured with Node's system CA / NODE_EXTRA_CA_CERTS.
 */
export async function fetchWithTlsFallback(url: string, init?: RequestInit): Promise<Response> {
  const signals = [init?.signal, currentAiSignal(), AbortSignal.timeout(30_000)]
    .filter((signal): signal is AbortSignal => Boolean(signal));
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.any(signals) });
}
