// Edge Function: ocmf-public-link
// Erzeugt einen signierten, öffentlich-aufrufbaren Download-Link für den OCMF-Beleg einer Session.
// Auth: Nutzer muss in der Session-Tenant authentifiziert sein ODER der zugehörige charging_user sein.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) return json({ error: "session_id required" }, 400);

    // RLS-Check über authClient
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: session, error } = await authClient
      .from("charging_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (error || !session) return json({ error: "Forbidden or not found" }, 403);

    const secret = Deno.env.get("OCMF_DOWNLOAD_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const token = await hmacHex(sessionId, secret);
    const baseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const url = `${baseUrl}/functions/v1/public-ocmf-download?session=${encodeURIComponent(sessionId)}&token=${token}`;
    return json({ url, token });
  } catch (e) {
    console.error("[ocmf-public-link] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
