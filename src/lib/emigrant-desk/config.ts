export function isEmigrantDeskConfigured(): boolean {
  return Boolean(
    process.env.EMIGRANT_SUPABASE_URL?.trim() &&
      process.env.EMIGRANT_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}
