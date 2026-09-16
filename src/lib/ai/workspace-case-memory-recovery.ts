import "server-only";

import { getWorkspaceChat } from "@/lib/ai/workspace-chats";
import {
  clientRefFromCaseMemory,
  lockClientRefIntoCaseMemory,
} from "@/lib/ai/conversation-client-lock";
import {
  sanitizeCaseMemory,
  selectAuthoritativeCaseMemory,
  type WorkspaceCaseMemory,
} from "@/lib/ai/workspace-case-memory";

export type AuthorizedChatCaseMemoryLoader = (
  userId: string,
  chatId: string,
) => Promise<{ caseMemory?: WorkspaceCaseMemory | null } | null>;

/**
 * Resolve caseMemory for a workspace turn.
 *
 * Precedence (identity):
 * 1. Valid ClientRef on the authorized request body (fast path)
 * 2. Authorized durable ClientRef for the same userId + chatId
 * 3. No lock
 *
 * Current-turn resolve/switch still wins later inside prepareWorkspaceRequest.
 * Recovery loads only conversation identity (linkedClientId + label), never
 * Finance / passport / questionnaire / EvidencePack.
 */
export async function resolveCaseMemoryForWorkspaceRequest(params: {
  userId: string;
  chatId: string | null;
  requestCaseMemory: WorkspaceCaseMemory | null;
  /** Test inject — production uses getWorkspaceChat (user-scoped ownership). */
  loadAuthorizedChat?: AuthorizedChatCaseMemoryLoader;
}): Promise<{
  caseMemory: WorkspaceCaseMemory | null;
  recoveredFromDurable: boolean;
}> {
  const request = sanitizeCaseMemory(params.requestCaseMemory);
  if (clientRefFromCaseMemory(request)) {
    return { caseMemory: request, recoveredFromDurable: false };
  }

  const chatId = params.chatId?.trim() || null;
  if (!chatId) {
    return { caseMemory: request, recoveredFromDurable: false };
  }

  const load = params.loadAuthorizedChat ?? getWorkspaceChat;
  // Ownership: default loader is scoped to userId — missing/foreign chat → null.
  const chat = await load(params.userId, chatId);
  if (!chat) {
    return { caseMemory: request, recoveredFromDurable: false };
  }

  const durableRaw = sanitizeCaseMemory(chat.caseMemory ?? null);
  const durableRef = clientRefFromCaseMemory(durableRaw);
  if (!durableRef) {
    return { caseMemory: request, recoveredFromDurable: false };
  }

  // Minimum identity only — no finance/passport/questionnaire hydration.
  const durableIdentity = lockClientRefIntoCaseMemory(null, durableRef);
  const merged = selectAuthoritativeCaseMemory({
    prepared: request,
    refreshed: durableIdentity,
  });
  return {
    caseMemory: merged,
    recoveredFromDurable: Boolean(clientRefFromCaseMemory(merged)),
  };
}
