export function formatNotificationTime(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  if (!timePart || timePart.length !== 5) return `${d}.${m}.${y}`;
  return `${d}.${m}.${y} • ${timePart}`;
}
