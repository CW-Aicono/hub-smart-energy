// Audit-Log Write Endpoint
// Schreibt einen Audit-Eintrag nach Validierung der User-Session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  action: z.string().min(1).max(100),
  entity_type: z.string().min(1).max(60),
  entity_id: z.string().uuid().optional().nullable(),
  entity_label: z.string().max(200).optional().nullable(),
  tenant_id: z.string().uuid().optional().nullable(),
  partner_id: z.string().uuid().optional().nullable(),
  before: z.unknown().optional().nullable(),
  after: z.unknown().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Simple in-memory Rate-Limit (60/min pro User)
const rateBuckets = new Map<string, number[]>();
function isRateLimited(userId: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const arr = (rateBuckets.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    rateBuckets.set(userId, arr);
    return true;
  }
  arr.push(now);
  rateBuckets.set(userId, arr);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userRes.user;

    if (isRateLimited(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const body = parsed.data;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Höchste Rolle ermitteln
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roleOrder = ["super_admin", "sales_partner", "admin", "user"];
    const actorRole =
      (roles ?? [])
        .map((r: { role: string }) => r.role)
        .sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0] ?? null;

    // Server-side: IP + UA
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const ip = xff.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const { error: insertErr } = await admin.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_role: actorRole,
      tenant_id: body.tenant_id ?? null,
      partner_id: body.partner_id ?? null,
      action: body.action,
      entity_type: body.entity_type,
      entity_id: body.entity_id ?? null,
      entity_label: body.entity_label ?? null,
      before: body.before ?? null,
      after: body.after ?? null,
      metadata: body.metadata ?? null,
      ip_address: ip,
      user_agent: userAgent,
    });

    if (insertErr) {
      console.error("audit-log insert failed", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-log-write error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
