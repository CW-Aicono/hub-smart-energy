import { resolveCaller, isSuperAdmin } from "../_shared/authz.ts";
// Edge Function: support-session-end
// Beendet eine Remote-Support-Sitzung: markiert support_sessions.ended_at und
// widerruft alle Refresh-Tokens des impersonierten Support-Users (globaler Sign-Out).
// Das Frontend stellt im Anschluss die Original-Session des Super-Admins wieder her.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id || "");
    if (!sessionId) return json({ error: "session_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = await resolveCaller(req, admin);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: session, error: getErr } = await admin
      .from("support_sessions")
      .select("id, impersonated_user_id, super_admin_user_id, ended_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (getErr || !session) return json({ error: "Session not found" }, 404);
    // Only the starting admin, the impersonated support user or a portal admin may end it.
    const allowed = isSuperAdmin(caller) || caller.userId === session.super_admin_user_id ||
      caller.userId === session.impersonated_user_id;
    if (!allowed) return json({ error: "Forbidden" }, 403);

    if (!session.ended_at) {
      await admin
        .from("support_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
    }

    if (session.impersonated_user_id) {
      // Refresh-Tokens widerrufen, damit der Support-User keine neue Session bekommt.
      // Bereits ausgestellte Access-Tokens bleiben bis Ablauf (typ. 1h) gültig –
      // das Frontend ersetzt sie aber sofort durch die Original-Session.
      await admin.auth.admin.signOut(session.impersonated_user_id, "global");
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[support-session-end]", e);
    return json({ error: "Internal error" }, 500);
  }
});
