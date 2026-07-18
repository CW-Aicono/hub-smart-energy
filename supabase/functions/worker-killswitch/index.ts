// Öffentliches Read-Endpoint für den Loxone-WS-Worker auf Hetzner.
// Liefert nur { enabled: boolean } zu einem Worker-Key.
// Bewusst ohne JWT-Pflicht, da der Hetzner-Worker keinen User-Token hat
// und der Wert kein Geheimnis ist.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return new Response(JSON.stringify({ error: "missing key" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { data, error } = await sb
    .from("worker_controls")
    .select("worker_key, enabled, paused_at, note")
    .eq("worker_key", key)
    .maybeSingle();

  if (error) {
    // Sicherheitslogik: Wenn die Datenbank unter Last nicht antwortet, darf der
    // externe Worker nicht einfach weiterfeuern. Für den Loxone-WS-Worker gilt
    // deshalb: im Zweifel pausieren, damit sich die Cloud erholen kann.
    const failClosed = key === "loxone_ws_worker";
    return new Response(JSON.stringify({ enabled: !failClosed, fallback: true, error: error.message }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      worker_key: key,
      enabled: data?.enabled ?? true,
      paused_at: data?.paused_at ?? null,
      note: data?.note ?? null,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
