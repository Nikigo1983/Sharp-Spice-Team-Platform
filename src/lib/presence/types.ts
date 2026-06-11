export type UserPresence = {
  userId: string;
  lastActiveAt: string;
  isOnline: boolean;
};

export type PresenceMap = Record<string, UserPresence>;
