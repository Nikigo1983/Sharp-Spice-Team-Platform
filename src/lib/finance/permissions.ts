import type { SessionUser, UserRole } from "@/lib/auth/types";

/** Owner and manager can view/manage Finance (same staff as intake). */
export function canViewFinance(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return user.role === "owner" || user.role === "manager";
}

export function canManageFinance(user: SessionUser | null | undefined): boolean {
  return canViewFinance(user);
}

export function isFinanceRole(role: UserRole): boolean {
  return role === "owner" || role === "manager";
}
