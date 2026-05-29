import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Constant-time string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let result = 0;
  for (let i = 0; i < ab.length; i++) result |= ab[i] ^ bb[i];
  return result === 0;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const masterKey = Deno.env.get("MASTER_RECOVERY_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!masterKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server nicht konfiguriert" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const ip = getClientIp(req);
  const providedKey = req.headers.get("x-master-key") ?? "";

  // Logging helper
  const log = async (target_email: string, success: boolean, error_message: string | null) => {
    try {
      await admin.from("master_recovery_log").insert({
        target_email,
        success,
        ip_address: ip,
        error_message,
      });
    } catch (_) { /* swallow logging errors */ }
  };

  // 1) Key check (constant time)
  if (!timingSafeEqual(providedKey, masterKey)) {
    await log("(unknown)", false, "Invalid master key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Rate limit: max 5 attempts per IP per hour
  const { count: recentCount } = await admin
    .from("master_recovery_log")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((recentCount ?? 0) >= 5) {
    await log("(rate_limited)", false, "Rate limit exceeded");
    return new Response(JSON.stringify({ error: "Zu viele Versuche — bitte später erneut" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3) Parse body
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("invalid email");
  } catch {
    await log("(invalid)", false, "Invalid request body");
    return new Response(JSON.stringify({ error: "Ungültige E-Mail im Body erwartet: {\"email\":\"...\"}" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4) Find user by email
  let targetUserId: string | null = null;
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      await log(email, false, `listUsers error: ${error.message}`);
      return new Response(JSON.stringify({ error: "Fehler beim Suchen des Users" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) { targetUserId = found.id; break; }
    if (data.users.length < 200) break;
    page++;
  }

  if (!targetUserId) {
    await log(email, false, "User not found");
    return new Response(
      JSON.stringify({ error: "User nicht gefunden — bitte zuerst registrieren" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 5) Upsert super_admin role
  const { error: upsertError } = await admin
    .from("user_roles")
    .upsert({ user_id: targetUserId, role: "super_admin" }, { onConflict: "user_id,role" });

  if (upsertError) {
    await log(email, false, `upsert error: ${upsertError.message}`);
    return new Response(JSON.stringify({ error: "Fehler beim Setzen der Rolle", detail: upsertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await log(email, true, null);

  return new Response(
    JSON.stringify({
      success: true,
      message: `User ${email} wurde zum super_admin befördert`,
      user_id: targetUserId,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
