// One-shot bootstrap: ensure private.cron_settings holds the URL + service
// role key so private.invoke_edge_function() can fire HTTP requests from
// pg_cron. Calls the SECURITY DEFINER public.bootstrap_cron_settings RPC.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);

  const { error } = await sb.rpc("bootstrap_cron_settings", { p_url: url, p_key: key });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ success: true, message: "cron_settings enabled" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
