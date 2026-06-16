import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectWorkspaceIntent,
  isPassportNumberLookupQuery,
} from "@/lib/ai/query-intent";

describe("detectWorkspaceIntent — Emigrant Desk decoupled from CRM", () => {
  it("does not load Desk for generic client passport question", () => {
    const query = "Какой номер паспорта у клиента Белоус Екатерина?";
    const intent = detectWorkspaceIntent(query);
    assert.equal(intent.needsClients, true);
    assert.equal(intent.needsEmigrantDesk, false);
    assert.equal(intent.needsEmigrantDrive, false);
    assert.equal(intent.fastClientLookup, true);
    assert.equal(isPassportNumberLookupQuery(query), true);
  });

  it("does not treat passport number question as Emigrant Drive lookup", () => {
    const query = "какой номер паспорта у Белоус Екатерина";
    assert.equal(isPassportNumberLookupQuery(query), true);
    const intent = detectWorkspaceIntent(query);
    assert.equal(intent.needsEmigrantDrive, false);
  });

  it("still loads Drive for passport scan requests", () => {
    const intent = detectWorkspaceIntent("найди скан паспорта у Белоус");
    assert.equal(intent.needsEmigrantDrive, true);
    assert.equal(isPassportNumberLookupQuery("найди скан паспорта у Белоус"), false);
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
