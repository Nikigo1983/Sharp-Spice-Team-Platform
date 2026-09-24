import type { SessionUser } from "@/lib/auth/types";

const TEAM_DELETE_ALLOWED_IDS = new Set(["veronika", "manager-1"]);

export function canDeleteTeamMembers(user: SessionUser): boolean {
  return TEAM_DELETE_ALLOWED_IDS.has(user.id);
}

export function canDeleteTeamMember(
  actor: SessionUser,
  targetId: string,
): boolean {
  if (!canDeleteTeamMembers(actor)) return false;
  if (actor.id === targetId) return false;
  if (targetId === "veronika" && actor.id !== "veronika") return false;
  return true;
}

export function canViewTeamMemberActivity(
  actor: SessionUser,
  target: { id: string; role: string },
): boolean {
  if (actor.id === target.id) return false;
  // Veronika & Zlata (same privilege set as delete) can open stats/report for anyone.
  // Do not gate on `role`: Veronika is labeled «Админ» but stored as owner, Zlata as manager.
  return canDeleteTeamMembers(actor);
}
