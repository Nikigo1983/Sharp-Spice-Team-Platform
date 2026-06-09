import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isEmigrantDeskConfigured } from "./config";

let adminClient: SupabaseClient | null = null;

export function getEmigrantDeskAdmin(): SupabaseClient {
  if (!isEmigrantDeskConfigured()) {
    throw new Error("Emigrant Desk Supabase is not configured");
  }

  if (!adminClient) {
    adminClient = createClient(
      process.env.EMIGRANT_SUPABASE_URL!.trim(),
      process.env.EMIGRANT_SUPABASE_SERVICE_ROLE_KEY!.trim(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return adminClient;
}
