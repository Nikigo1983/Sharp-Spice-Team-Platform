import type { UserRole } from "@/lib/auth/types";

export type TeamChatMessageType = "text" | "voice" | "image";

export const VOICE_MESSAGE_SEARCH_LABEL = "голосовое сообщение";
export const IMAGE_MESSAGE_SEARCH_LABEL = "изображение";

export type TeamChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  message_type: TeamChatMessageType;
  message_text: string;
  audio_url: string | null;
  audio_duration_ms: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateTeamChatMessageInput = {
  text: string;
};

export type CreateVoiceTeamChatMessageInput = {
  durationMs: number;
};
