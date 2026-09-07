import type { UserRole } from "@/lib/auth/types";
import type { TeamMemberDailyActivity } from "@/lib/presence/daily-activity-logic";

export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isOnline?: boolean;
  lastActiveAt?: string | null;
  aiRequestsThisMonth?: number;
  activityToday?: TeamMemberDailyActivity;
};
