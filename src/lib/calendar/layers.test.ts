import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CALENDAR_LAYERS,
  hasActiveLayer,
  layersToScopes,
} from "./layers";

describe("layersToScopes", () => {
  it("maps both layers to two scopes", () => {
    assert.deepEqual(layersToScopes(DEFAULT_CALENDAR_LAYERS), [
      "personal",
      "company",
    ]);
  });

  it("maps personal-only layer", () => {
    assert.deepEqual(
      layersToScopes({ personal: true, company: false }),
      ["personal"],
    );
  });

  it("detects inactive layers", () => {
    assert.equal(hasActiveLayer({ personal: false, company: false }), false);
    assert.equal(hasActiveLayer({ personal: true, company: false }), true);
  });
});
