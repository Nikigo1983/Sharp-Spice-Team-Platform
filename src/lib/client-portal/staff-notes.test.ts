import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendStaffNote,
  countNewStaffNotes,
  readStaffNotes,
  removeStaffNote,
  updateStaffNote,
  type StaffCaseNote,
} from "@/lib/client-portal/staff-case-meta";

function note(
  partial: Partial<StaffCaseNote> & Pick<StaffCaseNote, "id" | "text" | "createdAt">,
): StaffCaseNote {
  return {
    authorName: "Staff",
    authorUserId: "u1",
    ...partial,
  };
}

describe("staff notes update/remove", () => {
  it("updates only the target note text", () => {
    const answers = appendStaffNote(
      appendStaffNote(
        {},
        note({
          id: "n1",
          text: "first",
          createdAt: "2026-01-01T10:00:00.000Z",
        }),
      ),
      note({
        id: "n2",
        text: "second",
        createdAt: "2026-01-02T10:00:00.000Z",
      }),
    );

    const next = updateStaffNote(answers, "n2", "  second edited  ");
    assert.ok(next);
    const notes = readStaffNotes(next);
    assert.equal(notes.length, 2);
    assert.equal(notes[0]?.text, "first");
    assert.equal(notes[1]?.text, "second edited");
  });

  it("returns null for missing note or empty text", () => {
    const answers = appendStaffNote(
      {},
      note({
        id: "n1",
        text: "only",
        createdAt: "2026-01-01T10:00:00.000Z",
      }),
    );
    assert.equal(updateStaffNote(answers, "missing", "x"), null);
    assert.equal(updateStaffNote(answers, "n1", "   "), null);
  });

  it("removes the target note", () => {
    const answers = appendStaffNote(
      appendStaffNote(
        {},
        note({
          id: "n1",
          text: "keep",
          createdAt: "2026-01-01T10:00:00.000Z",
        }),
      ),
      note({
        id: "n2",
        text: "drop",
        createdAt: "2026-01-02T10:00:00.000Z",
      }),
    );
    const next = removeStaffNote(answers, "n2");
    assert.ok(next);
    const notes = readStaffNotes(next);
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.id, "n1");
    assert.equal(removeStaffNote(answers, "missing"), null);
  });
});

describe("countNewStaffNotes", () => {
  const notes = [
    note({ id: "a", text: "old", createdAt: "2026-01-01T10:00:00.000Z" }),
    note({ id: "b", text: "new", createdAt: "2026-01-03T10:00:00.000Z" }),
  ];

  it("counts all when never seen", () => {
    assert.equal(countNewStaffNotes(notes, null), 2);
    assert.equal(countNewStaffNotes(notes, ""), 2);
  });

  it("counts only notes after lastSeenAt", () => {
    assert.equal(countNewStaffNotes(notes, "2026-01-02T00:00:00.000Z"), 1);
    assert.equal(countNewStaffNotes(notes, "2026-01-03T10:00:00.000Z"), 0);
  });

  it("returns zero for empty notes", () => {
    assert.equal(countNewStaffNotes([], null), 0);
  });
});
