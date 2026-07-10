import type { UserRole } from "@/lib/auth/types";

export type TeamChatMessageType = "text" | "voice" | "image" | "file";

export const VOICE_MESSAGE_SEARCH_LABEL = "голосовое сообщение";
export const IMAGE_MESSAGE_SEARCH_LABEL = "изображение";
export const FILE_MESSAGE_SEARCH_LABEL = "файл";

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
  file_url: string | null;
  file_name: string | null;
  file_content_type: string | null;
  file_size: number | null;
  reply_to_message_id: string | null;
  reply_to_user_name: string | null;
  reply_to_message_type: TeamChatMessageType | null;
  reply_to_preview: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  pinned_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateTeamChatMessageInput = {
  text: string;
  replyToId?: string;
};

export type CreateVoiceTeamChatMessageInput = {
  durationMs: number;
  replyToId?: string;
};

export type TeamChatSharedMediaType = "image" | "file" | "voice" | "links";

export type TeamChatLinkItem = {
  url: string;
  message_id: string;
  user_name: string;
  created_at: string;
  context: string;
};

export type TeamChatSharedMediaResult =
  | {
      type: "image" | "file" | "voice";
      messages: TeamChatMessage[];
      hasMore: boolean;
    }
  | {
      type: "links";
      links: TeamChatLinkItem[];
      hasMore: boolean;
    };
