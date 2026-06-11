import type { UserRole } from "@/lib/auth/types";

export type TeamChatMessageType = "text" | "voice";

export const VOICE_MESSAGE_SEARCH_LABEL = "голосовое сообщение";

export type TeamChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  message_type: TeamChatMessageType;
  message_text: string;
  audio_url: string | null;
  audio_duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateTeamChatMessageInput = {
  text: string;
};

export type CreateVoiceTeamChatMessageInput = {
  durationMs: number;
};
