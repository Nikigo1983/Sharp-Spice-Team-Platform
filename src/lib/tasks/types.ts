export const TASK_STATUSES = [
  "new",
  "in_progress",
  "pending_approval",
  "needs_revision",
  "completed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  pending_approval: "На проверке",
  needs_revision: "На доработке",
  completed: "Принята",
};

export type TaskReviewAction = "submitted" | "approved" | "revision_requested";

export type TaskReviewEvent = {
  id: string;
  action: TaskReviewAction;
  actorUserId: string;
  actorName: string;
  comment?: string;
  createdAt: string;
};

export type TaskAssignee = {
  id: string;
  name: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdByUserId: string;
  createdByName: string;
  assignees: TaskAssignee[];
  createdAt: string;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
  reviewHistory: TaskReviewEvent[];
};

export type TaskStats = {
  total: number;
  inProgress: number;
  pendingApproval: number;
  completed: number;
  overdue: number;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  dueDate?: string | null;
  status?: TaskStatus;
  assigneeIds?: string[];
};

export type UpdateTaskInput = {
  title?: string;
  description?: string;
  dueDate?: string | null;
  status?: TaskStatus;
  assigneeIds?: string[];
};

export type TaskWorkflowAction =
  | "submit_for_approval"
  | "approve"
  | "request_revision";
