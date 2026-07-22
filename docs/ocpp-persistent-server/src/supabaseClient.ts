import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { config } from "./config";

/**
 * Realtime-only Supabase-Client. Wird nur genutzt, wenn SUPABASE_ANON_KEY
 * gesetzt ist (Broadcast-Kanal ocpp:commands). Andernfalls fällt der Server
 * auf reines Polling zurück (COMMAND_POLL_INTERVAL_MS).
 *
 * Wichtig: Ohne gültigen anon key würde createClient zwar nicht sofort
 * werfen, aber jeder Realtime-Verbindungsversuch schlägt fehl. Deshalb
 * geben wir einen Dummy-Client zurück, den der Dispatcher nie abonniert.
 */
const anonKey = config.supabaseAnonKey || "public-anon-key-not-set";

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  anonKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node.js 20 hat im Alpine-Container kein natives WebSocket-Objekt.
    // Ohne expliziten ws-Transport wirft @supabase/realtime-js schon beim
    // createClient()-Aufruf und der OCPP-Container landet im Restart-Loop.
    realtime: { params: { eventsPerSecond: 20 }, transport: WebSocket },
  },
);
