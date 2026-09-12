# AI integration hardening

This change keeps Chat Completions and the current OpenRouter-first default for compatibility. It does not migrate data to Supabase or change production environment variables.

## Configuration

- `AI_PROVIDER=openrouter|openai`: explicit provider. When absent, existing installations keep OpenRouter priority if its key is present, otherwise OpenAI.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`: OpenRouter connection and default model.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: direct OpenAI connection and default model (existing default: gpt-4o-mini).
- `AI_WORKSPACE_MODEL`, `AI_WORKSPACE_ROUTER_MODEL`: workload overrides for the selected provider. Direct OpenAI strips the compatible `openai/` prefix and rejects other provider slugs.
- `AI_REQUEST_TIMEOUT_MS`: whole AI HTTP request deadline, default 120000, accepted range 1000–150000. Routes allow 180 seconds on Vercel; keep the application deadline below that platform limit. Agent loops additionally retain their 45-second budget; tools retain their 20-second budget.

The selected provider never falls back to another provider after authentication/configuration failure.

## Behavior

Native fetch verifies TLS certificates and streams response bodies. The historical Google fetch helper now also uses verified native fetch, so local private CA chains must be configured with Node system CAs or NODE_EXTRA_CA_CERTS. There is no insecure certificate fallback.

Workspace SSE forwards ordinary answer deltas immediately. Answers requiring post-generation factual guards and tool-round text remain buffered intentionally. Tool progress events now arrive while tools are running, and the final agent answer passes through the existing guard.

Stop and request disconnect abort downstream model requests. Async request scope propagates the same cancellation signal to router, tool, memory and shared Google fetch calls. Retries for explicit 429/502/503/504 responses are bounded and cancellable. Transport failures and partly delivered streams are not retried automatically.

Truncation, content filtering, malformed provider events and missing SSE completion markers are failures. Incomplete tool calls are never executed. HTTP endpoints return non-success status for failed non-stream calls; streaming endpoints send an error event. UI retains partial streamed text with an explicit incomplete/failed notice.

Client-card and Workspace model failures no longer produce heuristic fallback advice about documents, eligibility or case risks. Empty document context is described as missing information, not proof that the client has no documents.

## Validation

Run `npm test` and `npm run build`. The new `src/lib/ai/transport.test.ts` uses mocked providers (no API credits or client records transmitted), including:
- provider selection, model normalization and request parameters;
- first delta before upstream completion, fragmented UTF-8 / CRLF / final EOF frame;
- timeout, cancellation before request / during stream, reader cleanup;
- malformed events, incomplete output, incomplete tools and authentication errors;
- no TLS bypass / network retry and no fabricated client fallback;
- live tool status delivery.

Production verification should additionally check an ordinary streamed answer, Stop during generation, provider availability and Google source access in the target deployment.

## Verified result (2026-09-12)

- The isolated copy based on c83146e with this integration change passed all 586 tests (160 suites) and completed the production build.
- All 21 changed/new implementation and test files were compared with the working directory after the build; there were no differences.
- The working-directory production build also completed. Full-suite runs in that shared directory overlapped independent client-name search edits; they are not the acceptance result for this change. Those edits were left intact.
- No production deploy, provider switch, environment change or Supabase migration was performed. Live provider/credential verification remains a deployment check.
