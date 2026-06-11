/** Считаем пользователя онлайн, если heartbeat был недавно. */
export const PRESENCE_ONLINE_THRESHOLD_MS = 90_000;

/** Интервал heartbeat с клиента. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 45_000;

/** Интервал обновления списка онлайн на странице Team. */
export const PRESENCE_POLL_INTERVAL_MS = 30_000;
