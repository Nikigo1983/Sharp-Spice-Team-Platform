import { AsyncLocalStorage } from "node:async_hooks";

// Carries cancellation through router, retrieval, tools and memory calls without
// accepting identity or request control from model-supplied arguments.
const scope = new AsyncLocalStorage<AbortSignal>();

export function currentAiSignal(): AbortSignal | undefined {
  return scope.getStore();
}

export function throwIfAiAborted(): void {
  currentAiSignal()?.throwIfAborted();
}

export async function withAiRequestScope<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  return scope.run(signal, run);
}

export function aiTimeoutMs(): number {
  const value = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1000 && value <= 150000 ? value : 120000;
}

export function createAiDeadline(parent?: AbortSignal, timeoutMs = aiTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("AI deadline exceeded", "TimeoutError")), timeoutMs);
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  return { signal, dispose: () => { clearTimeout(timer); controller.abort(); } };
}
