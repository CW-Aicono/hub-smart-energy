import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * Realtime-only Supabase-Client für den persistenten OCPP-Server.
 *
 * Datenoperationen laufen weiterhin über src/backendApi.ts (Edge Function),
 * weil in Lovable Cloud der Service-Role-Key nicht verfügbar ist.
 * Dieser Client wird ausschließlich für Realtime-Broadcasts genutzt
 * (Push-Weckruf bei neuen pending_ocpp_commands).
 */
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  },
);
