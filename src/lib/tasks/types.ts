export const TASK_STATUSES = ["new", "in_progress", "completed"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  completed: "Выполнена",
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
};

export type TaskStats = {
  total: number;
  inProgress: number;
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
