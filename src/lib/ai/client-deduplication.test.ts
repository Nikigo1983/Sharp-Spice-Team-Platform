import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientContext } from "@/lib/ai/client-context";
import {
  areClientsDuplicates,
  deduplicateToResolved,
  groupDuplicateClients,
} from "@/lib/ai/client-deduplication";

function ctx(
  partial: Partial<ClientContext> & Pick<ClientContext, "source" | "name">,
): ClientContext {
  return {
    sourceLabel: partial.source === "clients" ? "Клиенты" : "Новые клиенты",
    rowIndex: partial.rowIndex ?? 1,
    phone: "",
    email: "",
    country: "",
    direction: "",
    status: "",
    manager: "",
    lastActivity: "",
    surveyData: "",
    score: 50,
    matchedFields: [],
    debugRow: {},
    ...partial,
  };
}

describe("areClientsDuplicates", () => {
  it("strong merge on matching passport across CRM and Formgrid", () => {
    const crm = ctx({
      source: "clients",
      name: "Давлятова Лола",
      debugRow: { passport: "762762123" },
    });
    const fg = ctx({
      source: "new_clients",
      name: "Давлятова Лола Бахтиёровна",
      rowIndex: 5,
      debugRow: { "8. № заграничного паспорта": "762762123" },
    });

    const check = areClientsDuplicates(crm, fg);
    assert.equal(check.isDuplicate, true);
    assert.ok(check.reasons.includes("passport"));
    assert.equal(check.isPossibleDuplicate, false);
  });

  it("does not strong-merge same name with different passports", () => {
    const crm = ctx({
      source: "clients",
      name: "Смола Александра",
      debugRow: { passport: "111111111" },
    });
    const fg = ctx({
      source: "new_clients",
      name: "Смола Александра Сергеевна",
      debugRow: { "8. № заграничного паспорта": "222222222" },
    });

    const check = areClientsDuplicates(crm, fg);
    assert.equal(check.isDuplicate, false);
    assert.equal(check.isPossibleDuplicate, false);
  });

  it("marks FIO-only match as possible duplicate when passport missing", () => {
    const crm = ctx({
      source: "clients",
      name: "Белкания Автандил",
      debugRow: {},
    });
    const fg = ctx({
      source: "new_clients",
      name: "Белкания Автандил Яношевич",
      debugRow: {},
    });

    const check = areClientsDuplicates(crm, fg);
    assert.equal(check.isDuplicate, false);
    assert.equal(check.isPossibleDuplicate, true);
    assert.ok(check.possibleReasons.length > 0);
  });
});

describe("groupDuplicateClients", () => {
  it("merges passport matches and keeps FIO-only pairs separate", () => {
    const crmPassport = ctx({
      source: "clients",
      name: "Лысогорская Лейсан",
      debugRow: { passport: "555555555" },
    });
    const fgPassport = ctx({
      source: "new_clients",
      name: "Лысогорская Лейсан Ильдусовна",
      rowIndex: 3,
      debugRow: { "8. № заграничного паспорта": "555555555" },
    });
    const crmFioOnly = ctx({
      source: "clients",
      name: "Белкания Автандил",
      rowIndex: 10,
      debugRow: {},
    });
    const fgFioOnly = ctx({
      source: "new_clients",
      name: "Белкания Автандил Яношевич",
      rowIndex: 11,
      debugRow: {},
    });

    const groups = groupDuplicateClients([
      crmPassport,
      fgPassport,
      crmFioOnly,
      fgFioOnly,
    ]);
    const mergedGroups = groups.filter((g) => g.parts.length > 1);

    assert.equal(mergedGroups.length, 1);
    assert.ok(mergedGroups[0].mergeReasons.includes("passport"));
    assert.equal(mergedGroups[0].parts.length, 2);

    const resolved = deduplicateToResolved([
      crmPassport,
      fgPassport,
      crmFioOnly,
      fgFioOnly,
    ]);
    assert.equal(resolved.length, 3);
  });
});
