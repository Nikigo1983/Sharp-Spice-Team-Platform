export function verifyCalendarCronRequest(
  request: Request,
  opts?: { secret?: string | null },
): boolean {
  const configuredSecret =
    opts?.secret !== undefined ? opts.secret?.trim() : process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;

  const token = auth.slice("Bearer ".length).trim();
  return token === configuredSecret;
}
