import type { TeamChatMessage, TeamChatMessageType } from "./types";
import {
  FILE_MESSAGE_SEARCH_LABEL,
  IMAGE_MESSAGE_SEARCH_LABEL,
  VOICE_MESSAGE_SEARCH_LABEL,
} from "./types";

export function buildMessagePreview(message: TeamChatMessage): string {
  if (message.message_type === "voice") {
    return VOICE_MESSAGE_SEARCH_LABEL;
  }
  if (message.message_type === "image") {
    const caption = message.message_text.trim();
    return caption || IMAGE_MESSAGE_SEARCH_LABEL;
  }
  if (message.message_type === "file") {
    const caption = message.message_text.trim();
    return caption || message.file_name?.trim() || FILE_MESSAGE_SEARCH_LABEL;
  }
  return message.message_text.trim().slice(0, 240);
}

export function messageTypeLabel(type: TeamChatMessageType): string {
  switch (type) {
    case "voice":
      return VOICE_MESSAGE_SEARCH_LABEL;
    case "image":
      return IMAGE_MESSAGE_SEARCH_LABEL;
    case "file":
      return FILE_MESSAGE_SEARCH_LABEL;
    default:
      return "Сообщение";
  }
}
