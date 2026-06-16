import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectWorkspaceIntent } from "@/lib/ai/query-intent";

describe("detectWorkspaceIntent — Emigrant Desk decoupled from CRM", () => {
  it("does not load Desk for generic client passport question", () => {
    const intent = detectWorkspaceIntent(
      "Какой номер паспорта у клиента Белоус Екатерина?",
    );
    assert.equal(intent.needsClients, true);
    assert.equal(intent.needsEmigrantDesk, false);
  });

  it("loads Desk only for explicit cabinet / case status queries", () => {
    const intent = detectWorkspaceIntent(
      "Какой статус дела в кабинете у Белова?",
    );
    assert.equal(intent.needsEmigrantDesk, true);
  });

  it("loads Desk when emigrant desk is mentioned explicitly", () => {
    const intent = detectWorkspaceIntent("статус в emigrant desk");
    assert.equal(intent.needsEmigrantDesk, true);
  });

  it("loads clients for booking lookup without Desk", () => {
    const intent = detectWorkspaceIntent("адрес букинга у Белоус Екатерина");
    assert.equal(intent.needsClients, true);
    assert.equal(intent.fastClientLookup, true);
    assert.equal(intent.needsEmigrantDesk, false);
  });
});
