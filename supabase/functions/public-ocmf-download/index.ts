// Edge Function: public-ocmf-download
// Öffentlicher OCMF-Download via signiertem Token-Link (keine Auth nötig).
// URL-Format:  /public-ocmf-download?session=<uuid>&token=<hmac-sha256-hex>
// Token = HMAC_SHA256(session_id, OCMF_DOWNLOAD_SECRET)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session");
    const token = url.searchParams.get("token");
    if (!sessionId || !token) return text("Missing session or token", 400);

    const secret = Deno.env.get("OCMF_DOWNLOAD_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!secret) return text("Server misconfigured", 500);

    const expected = await hmacHex(sessionId, secret);
    if (!safeEqual(expected, token)) return text("Invalid token", 403);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: session, error } = await supabase
      .from("charging_sessions")
      .select("id, tenant_id, transaction_id, ocmf_payload, ocmf_status")
      .eq("id", sessionId)
      .maybeSingle();

    if (error || !session) return text("Session not found", 404);
    if (!session.ocmf_payload) return text("OCMF not yet generated for this session", 404);

    // Audit-Log
    await supabase.from("audit_log").insert({
      tenant_id: session.tenant_id,
      action: "ocmf_public_download",
      entity_type: "charging_session",
      entity_id: session.id,
      meta: { transaction_id: session.transaction_id, status: session.ocmf_status, via: "public-link" },
    }).then(() => {}, (e) => console.warn("audit_log insert failed", e));

    const filename = `eichrecht-session-${session.transaction_id ?? session.id.substring(0, 8)}.ocmf`;
    return new Response(session.ocmf_payload, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[public-ocmf-download] error", e);
    return text((e as Error).message, 500);
  }
});

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
