/** Bridge callback-based work to an async iterator without buffering all events. */
export async function* streamTask<T, E>(
  run: (emit: (event: E) => void) => Promise<T>,
): AsyncGenerator<{ event: E } | { result: T }> {
  const queue: E[] = [];
  let wake: (() => void) | undefined;
  let settled = false;
  let result!: T;
  let failure: unknown;
  let failed = false;
  const pending = run(event => { queue.push(event); wake?.(); }).then(
    value => { result = value; },
    error => { failed = true; failure = error; },
  ).finally(() => { settled = true; wake?.(); });
  while (!settled || queue.length) {
    if (queue.length) { yield { event: queue.shift()! }; continue; }
    await new Promise<void>(resolve => { wake = resolve; });
    wake = undefined;
  }
  await pending;
  if (failed) throw failure;
  yield { result };
}
