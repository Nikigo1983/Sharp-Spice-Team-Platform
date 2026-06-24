import assert from "node:assert/strict";
import type { SessionUser } from "@/lib/auth/types";
import {
  canAddTaskProgressReport,
  canDeleteTaskProgressReport,
} from "./permissions";
import type { Task, TaskProgressReport } from "./types";

const creator: SessionUser = {
  id: "creator",
  name: "Zlata",
  email: "zlata@test.com",
  role: "manager",
};

const assignee: SessionUser = {
  id: "assignee",
  name: "Veronika",
  email: "veronika@test.com",
  role: "manager",
};

const otherAssignee: SessionUser = {
  id: "other",
  name: "Yulia",
  email: "yulia@test.com",
  role: "manager",
};

const owner: SessionUser = {
  id: "owner",
  name: "Owner",
  email: "owner@test.com",
  role: "owner",
};

const outsider: SessionUser = {
  id: "outsider",
  name: "Outsider",
  email: "outsider@test.com",
  role: "manager",
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test",
    description: "",
    status: "in_progress",
    createdByUserId: creator.id,
    createdByName: creator.name,
    assignees: [
      { id: assignee.id, name: assignee.name },
      { id: otherAssignee.id, name: otherAssignee.name },
    ],
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

const report: TaskProgressReport = {
  id: "report-1",
  authorUserId: assignee.id,
  authorName: assignee.name,
  comment: "Done my part",
  attachment: null,
  createdAt: "2026-01-02T00:00:00.000Z",
};

assert.equal(canAddTaskProgressReport(task(), assignee), true, "assignee can add");
assert.equal(canAddTaskProgressReport(task(), creator), false, "creator cannot add");
assert.equal(canAddTaskProgressReport(task(), outsider), false, "outsider cannot add");
assert.equal(
  canAddTaskProgressReport(task({ status: "completed" }), assignee),
  false,
  "cannot add to completed task",
);

assert.equal(
  canDeleteTaskProgressReport(task(), report, assignee),
  true,
  "author can delete own report",
);
assert.equal(
  canDeleteTaskProgressReport(task(), report, creator),
  true,
  "creator can delete any report",
);
assert.equal(
  canDeleteTaskProgressReport(task(), report, owner),
  true,
  "owner can delete any report",
);
assert.equal(
  canDeleteTaskProgressReport(task(), report, otherAssignee),
  false,
  "other assignee cannot delete someone else's report",
);

console.log("task progress report permissions: ok");
