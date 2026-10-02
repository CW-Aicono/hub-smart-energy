// meters-merge-duplicates
// Super-Admin only. Merges one or more duplicate meters into a master meter.
// Delegates the transactional work to public.merge_duplicate_meter(master, dup, actor).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
  const actorId = userRes.user.id;

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", actorId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // Accept either { master_id, duplicate_ids: string[] } or { merges: [{master_id, duplicate_id}, ...] }
  const merges: Array<{ master_id: string; duplicate_id: string }> = [];
  if (Array.isArray(body?.merges)) {
    for (const m of body.merges) {
      if (m?.master_id && m?.duplicate_id) merges.push({ master_id: m.master_id, duplicate_id: m.duplicate_id });
    }
  } else if (body?.master_id && Array.isArray(body?.duplicate_ids)) {
    for (const d of body.duplicate_ids) {
      if (typeof d === "string" && d !== body.master_id) merges.push({ master_id: body.master_id, duplicate_id: d });
    }
  }

  if (merges.length === 0) return json({ error: "merges (or master_id + duplicate_ids) required" }, 400);

  const results: any[] = [];
  for (const m of merges) {
    const { data, error } = await admin.rpc("merge_duplicate_meter", {
      _master_id: m.master_id,
      _duplicate_id: m.duplicate_id,
      _actor_user_id: actorId,
    });
    if (error) {
      results.push({ master_id: m.master_id, duplicate_id: m.duplicate_id, ok: false, error: error.message });
    } else {
      results.push({ master_id: m.master_id, duplicate_id: m.duplicate_id, ok: true, stats: data });
    }
  }

  const ok = results.every((r) => r.ok);
  return json({ ok, results }, ok ? 200 : 207);
});
