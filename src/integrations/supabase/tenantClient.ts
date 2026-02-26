/**
 * Isolated Supabase client for the TenantEnergyApp.
 *
 * Uses a separate localStorage key ("sb-tenant-auth-token") so that
 * logging in / out inside the tenant app does NOT affect the main
 * platform session stored under the default key.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const tenantSupabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storageKey: "sb-tenant-auth-token",
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
