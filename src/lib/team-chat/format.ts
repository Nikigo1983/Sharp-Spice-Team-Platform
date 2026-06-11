export function formatVoiceDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTeamChatDateTime(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  if (!timePart || timePart.length !== 5) return `${d}.${m}.${y}`;
  return `${d}.${m}.${y} • ${timePart}`;
}
