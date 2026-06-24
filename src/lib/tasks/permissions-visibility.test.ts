import assert from "node:assert/strict";
import type { SessionUser } from "@/lib/auth/types";
import { canViewTask } from "./permissions";
import type { Task } from "./types";

const userA: SessionUser = {
  id: "user-a",
  name: "Alice",
  email: "alice@test.com",
  role: "manager",
};

const userB: SessionUser = {
  id: "user-b",
  name: "Bob",
  email: "bob@test.com",
  role: "manager",
};

const userC: SessionUser = {
  id: "user-c",
  name: "Carol",
  email: "carol@test.com",
  role: "owner",
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test",
    description: "",
    status: "new",
    createdByUserId: userA.id,
    createdByName: userA.name,
    assignees: [{ id: userB.id, name: userB.name }],
    createdAt: "2026-01-01T00:00:00.000Z",
    dueDate: null,
    completedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    reviewHistory: [],
    attachments: [],
    progressReports: [],
    ...overrides,
  };
}

assert.equal(canViewTask(task(), userA), true, "creator can view");
assert.equal(canViewTask(task(), userB), true, "assignee can view");
assert.equal(canViewTask(task(), userC), false, "other user cannot view");
assert.equal(
  canViewTask(task({ assignees: [] }), userB),
  false,
  "non-creator cannot view unassigned task",
);

console.log("task visibility permissions: ok");
