/**
 * UNIQUE resolve → lock + durable identity + negative AMBIGUOUS / NOT_FOUND.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClientRef } from "@/lib/ai/client-ref";
import {
  clientRefFromCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  clientRefFromAgentToolMessages,
  clientRefFromAgentToolResults,
  commitUniqueClientResolution,
} from "@/lib/ai/clientref-resolution-lock";
import {
  caseMemoryForStreamMeta,
  selectAuthoritativeCaseMemory,
} from "@/lib/ai/workspace-case-memory";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("commitUniqueClientResolution", () => {
  it("locks questionnaire UUID into caseMemory before SSE boundary", () => {
    const ref = createClientRef({
      clientId: UUID_A,
      displayLabel: "Иванова",
    })!;
    const committed = commitUniqueClientResolution({
      memory: null,
      ref,
    });
    assert.equal(committed.clientRef.resolutionOutcome, "RESOLVED_LOCKED");
    assert.equal(committed.memory.linkedClientId, UUID_A);
    assert.equal(committed.memory.clientName, "Иванова");
    assert.equal(committed.locked, true);

    const early = caseMemoryForStreamMeta({
      prepared: committed.memory,
      phase: "early",
    });
    assert.ok(early);
    assert.equal(early!.linkedClientId, UUID_A);
    assert.ok(clientRefFromCaseMemory(early));
  });

  it("rejects non-UUID identity", () => {
    assert.throws(() =>
      commitUniqueClientResolution({
        memory: null,
        ref: {
          clientId: "row-42",
          displayLabel: "Bad",
          resolutionOutcome: "RESOLVED",
          source: "client_portal",
        },
      }),
    );
  });

  it("explicit switch drops prior client facts", () => {
    const alpha = createClientRef({
      clientId: UUID_A,
      displayLabel: "Alpha",
    })!;
    const beta = createClientRef({
      clientId: UUID_B,
      displayLabel: "Beta",
    })!;
    const first = commitUniqueClientResolution({ memory: null, ref: alpha });
    first.memory.citizenship = "RU";
    const switched = commitUniqueClientResolution({
      memory: first.memory,
      ref: beta,
      switchExplicit: true,
    });
    assert.equal(switched.switched, true);
    assert.equal(switched.memory.linkedClientId, UUID_B);
    assert.equal(switched.memory.citizenship, null);
  });
});

describe("clientRefFromAgentToolResults", () => {
  it("locks unique get_client UUID", () => {
    const ref = clientRefFromAgentToolResults([
      {
        name: "get_client",
        ok: true,
        data: {
          client: { clientId: UUID_A, displayName: "Петрова" },
        },
      },
    ]);
    assert.ok(ref);
    assert.equal(ref!.clientId, UUID_A);
  });

  it("locks unique non-ambiguous search_clients", () => {
    const ref = clientRefFromAgentToolResults([
      {
        name: "search_clients",
        ok: true,
        data: {
          ambiguous: false,
          matches: [{ clientId: UUID_A, displayName: "One" }],
        },
      },
    ]);
    assert.ok(ref);
    assert.equal(ref!.clientId, UUID_A);
  });

  it("never locks AMBIGUOUS search_clients", () => {
    const ref = clientRefFromAgentToolResults([
      {
        name: "search_clients",
        ok: true,
        data: {
          ambiguous: true,
          matches: [
            { clientId: UUID_A, displayName: "A" },
            { clientId: UUID_B, displayName: "B" },
          ],
        },
      },
    ]);
    assert.equal(ref, null);
  });

  it("parses tool-role transcript JSON", () => {
    const ref = clientRefFromAgentToolMessages([
      {
        role: "tool",
        name: "get_client",
        content: JSON.stringify({
          ok: true,
          data: { client: { clientId: UUID_A, name: "Sidorova" } },
        }),
      },
    ]);
    assert.ok(ref);
    assert.equal(ref!.clientId, UUID_A);
    assert.equal(ref!.displayLabel, "Sidorova");
  });
});

describe("durable identity vs store refresh", () => {
  it("prepare lock wins over refreshed memory without linkedClientId", () => {
    const ref = createClientRef({ clientId: UUID_A, displayLabel: "Lock" })!;
    const prepared = commitUniqueClientResolution({
      memory: null,
      ref,
    }).memory;
    const refreshed = {
      ...prepared,
      linkedClientId: null,
      clientName: null,
      citizenship: "RU",
      updatedAt: new Date().toISOString(),
    };
    const auth = selectAuthoritativeCaseMemory({ prepared, refreshed });
    assert.equal(auth?.linkedClientId, UUID_A);
    const finalMeta = caseMemoryForStreamMeta({
      prepared,
      refreshed,
      phase: "final",
    });
    assert.equal(finalMeta?.linkedClientId, UUID_A);
  });

  it("early SSE omits caseMemory when unlock (negative)", () => {
    const early = caseMemoryForStreamMeta({
      prepared: {
        linkedClientId: null,
        clientName: "Ghost",
        citizenship: null,
        passport: null,
        country: null,
        direction: null,
        bookingAddress: null,
        bookingRange: null,
        submittedAt: null,
        approvalAt: null,
        notes: null,
        draftClientId: null,
        updatedAt: new Date().toISOString(),
      },
      phase: "early",
    });
    assert.equal(early, undefined);
  });
});
