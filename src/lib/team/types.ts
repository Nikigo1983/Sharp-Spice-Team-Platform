import type { UserRole } from "@/lib/auth/types";

export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isOnline?: boolean;
  lastActiveAt?: string | null;
};
