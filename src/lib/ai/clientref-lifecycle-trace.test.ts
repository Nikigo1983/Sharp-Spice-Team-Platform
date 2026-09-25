import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isClientRefLifecycleBrowserTraceEnabled,
  logClientRefLifecycleBrowserTrace,
} from "@/lib/ai/workspace-ai-browser-contract";
import {
  clientRefFingerprint,
  isClientRefLifecycleTraceEnabled,
  logClientRefLifecycleTrace,
} from "@/lib/ai/workspace-ai-clientref-trace";
import { emptyCaseMemory } from "@/lib/ai/workspace-case-memory";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

describe("clientref lifecycle preview trace privacy/gate", () => {
  it("fingerprint is one-way and never equals raw UUID", () => {
    const uuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const fp = clientRefFingerprint(uuid);
    assert.equal(typeof fp, "string");
    assert.equal(fp!.length, 16);
    assert.notEqual(fp, uuid);
    assert.equal(UUID_RE.test(fp!), false);
  });

  it("server trace stays off in production even with flag", () => {
    const prevVercel = process.env.VERCEL_ENV;
    const prevFlag = process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.VERCEL_ENV = "production";
      process.env.AI_CLIENTREF_LIFECYCLE_TRACE = "1";
      process.env.NODE_ENV = "production";
      assert.equal(isClientRefLifecycleTraceEnabled(), false);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevVercel;
      if (prevFlag === undefined) delete process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
      else process.env.AI_CLIENTREF_LIFECYCLE_TRACE = prevFlag;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("server trace requires preview/dev context AND explicit flag", () => {
    const prevVercel = process.env.VERCEL_ENV;
    const prevFlag = process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.VERCEL_ENV = "preview";
      delete process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
      assert.equal(isClientRefLifecycleTraceEnabled(), false);

      process.env.AI_CLIENTREF_LIFECYCLE_TRACE = "1";
      assert.equal(isClientRefLifecycleTraceEnabled(), true);

      process.env.VERCEL_ENV = "development";
      assert.equal(isClientRefLifecycleTraceEnabled(), true);

      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = "development";
      assert.equal(isClientRefLifecycleTraceEnabled(), true);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevVercel;
      if (prevFlag === undefined) delete process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
      else process.env.AI_CLIENTREF_LIFECYCLE_TRACE = prevFlag;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("browser trace stays off in production even with public flag", () => {
    const prevVercel = process.env.NEXT_PUBLIC_VERCEL_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
      process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE = "1";
      process.env.NODE_ENV = "production";
      assert.equal(isClientRefLifecycleBrowserTraceEnabled(), false);
    } finally {
      if (prevVercel === undefined) delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      else process.env.NEXT_PUBLIC_VERCEL_ENV = prevVercel;
      if (prevFlag === undefined) {
        delete process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE;
      } else {
        process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE = prevFlag;
      }
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("trace log payload never contains raw UUID and does not mutate caseMemory", () => {
    const prevVercel = process.env.VERCEL_ENV;
    const prevFlag = process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
    const uuid = "11111111-2222-4333-8444-555555555555";
    const memory = emptyCaseMemory();
    memory.linkedClientId = uuid;
    const before = JSON.stringify(memory);

    const lines: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(" "));
    };
    try {
      process.env.VERCEL_ENV = "preview";
      process.env.AI_CLIENTREF_LIFECYCLE_TRACE = "1";
      assert.equal(isClientRefLifecycleTraceEnabled(), true);
      logClientRefLifecycleTrace({
        checkpoint: "SERVER_AFTER_UNIQUE_RESOLUTION",
        requestId: "req_test",
        hasClientRef: true,
        clientId: uuid,
      });
      process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
      process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE = "1";
      logClientRefLifecycleBrowserTrace({
        checkpoint: "UI_LIVE_REF_AFTER_META",
        requestId: "req_test",
        hasClientRef: true,
      });
    } finally {
      console.info = original;
      if (prevVercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevVercel;
      if (prevFlag === undefined) delete process.env.AI_CLIENTREF_LIFECYCLE_TRACE;
      else process.env.AI_CLIENTREF_LIFECYCLE_TRACE = prevFlag;
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      delete process.env.NEXT_PUBLIC_AI_CLIENTREF_LIFECYCLE_TRACE;
    }

    assert.ok(lines.length >= 1);
    for (const line of lines) {
      assert.equal(UUID_RE.test(line), false, `UUID leaked in: ${line}`);
      assert.equal(line.includes(uuid), false);
    }
    assert.equal(JSON.stringify(memory), before);
  });
});
