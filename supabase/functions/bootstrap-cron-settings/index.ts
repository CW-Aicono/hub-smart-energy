// One-shot bootstrap: write SUPABASE_URL + SERVICE_ROLE_KEY into
// private.cron_settings so private.invoke_edge_function() can fire HTTP
// requests from pg_cron jobs. Safe to re-run (upsert).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);

  const { error } = await sb.schema("private").from("cron_settings").upsert(
    { id: true, supabase_url: url, service_role_key: key, enabled: true, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ success: true, message: "cron_settings enabled" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
