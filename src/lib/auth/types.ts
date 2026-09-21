export type UserRole = "owner" | "manager";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Владелец",
  manager: "Менеджер",
};

/** Подпись роли в UI (может отличаться от системной роли для отдельных сотрудников). */
export function getRoleDisplayLabel(user: Pick<SessionUser, "id" | "role">): string {
  if (user.id === "veronika") return "Админ";
  if (user.id === "manager-1") return "Владелец";
  return ROLE_LABELS[user.role];
}
