import type { UserRole } from "@/lib/auth/types";

export type TeamChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  message_text: string;
  created_at: string;
  updated_at: string;
};

export type CreateTeamChatMessageInput = {
  text: string;
};
