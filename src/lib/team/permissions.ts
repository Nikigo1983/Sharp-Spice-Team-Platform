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
