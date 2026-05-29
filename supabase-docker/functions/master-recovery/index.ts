import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

function generateOtp(length = 16): string {
  // URL-safe printable charset, no ambiguous chars (no 0/O/1/l/I)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const masterKey = Deno.env.get("MASTER_RECOVERY_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!masterKey || !supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Server nicht konfiguriert" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const ip = getClientIp(req);
  const providedKey = req.headers.get("x-master-key") ?? "";

  const log = async (target_email: string, success: boolean, error_message: string | null) => {
    try {
      await admin.from("master_recovery_log").insert({
        target_email,
        success,
        ip_address: ip,
        error_message,
      });
    } catch (_) { /* swallow */ }
  };

  // 1) Key check (constant time)
  if (!timingSafeEqual(providedKey, masterKey)) {
    await log("(unknown)", false, "Invalid master key");
    return json(401, { error: "Unauthorized" });
  }

  // 2) Rate limit: 5 attempts per IP per hour
  const { count: recentCount } = await admin
    .from("master_recovery_log")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((recentCount ?? 0) >= 5) {
    await log("(rate_limited)", false, "Rate limit exceeded");
    return json(429, { error: "Zu viele Versuche — bitte später erneut" });
  }

  // 3) Parse body
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("invalid email");
  } catch {
    await log("(invalid)", false, "Invalid request body");
    return json(400, { error: "Ungültige E-Mail im Body erwartet: {\"email\":\"...\"}" });
  }

  // 4) Look up existing auth user by email (paged)
  let existingUserId: string | null = null;
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      await log(email, false, `listUsers error: ${error.message}`);
      return json(500, { error: "Fehler beim Suchen des Users" });
    }
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) { existingUserId = found.id; break; }
    if (data.users.length < 200) break;
    page++;
  }

  // 5a) Existing user: enforce strict Platform vs Tenant separation
  if (existingUserId) {
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", existingUserId)
      .maybeSingle();

    if (profileErr) {
      await log(email, false, `profile lookup error: ${profileErr.message}`);
      return json(500, { error: "Fehler beim Prüfen des Profils" });
    }

    if (profile?.tenant_id) {
      await log(email, false, "Email belongs to a tenant");
      return json(409, {
        error: "E-Mail gehört bereits zu einem Tenant — bitte andere E-Mail verwenden",
      });
    }

    // Platform user (tenant_id IS NULL): only confirm/ensure super_admin role
    const { error: upsertError } = await admin
      .from("user_roles")
      .upsert({ user_id: existingUserId, role: "super_admin" }, { onConflict: "user_id,role" });

    if (upsertError) {
      await log(email, false, `upsert error: ${upsertError.message}`);
      return json(500, { error: "Fehler beim Setzen der Rolle", detail: upsertError.message });
    }

    await log(email, true, null);
    return json(200, {
      success: true,
      created: false,
      email,
      message: "Super-Admin-Rolle bestätigt (Passwort wurde nicht geändert)",
    });
  }

  // 5b) New user: create platform super-admin with one-time password
  const otp = generateOtp(16);
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: otp,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });

  if (createErr || !newUser?.user) {
    await log(email, false, `createUser error: ${createErr?.message ?? "unknown"}`);
    return json(500, { error: "User konnte nicht angelegt werden", detail: createErr?.message });
  }

  const newUserId = newUser.user.id;

  // Ensure profile exists with tenant_id = NULL (handle_new_user trigger creates the row;
  // upsert to guarantee tenant_id is NULL even if trigger behavior changes).
  const { error: profileUpsertErr } = await admin
    .from("profiles")
    .upsert({ user_id: newUserId, email, tenant_id: null }, { onConflict: "user_id" });

  if (profileUpsertErr) {
    await log(email, false, `profile upsert error: ${profileUpsertErr.message}`);
    // continue — role assignment is still attempted
  }

  // Replace any default role assigned by handle_new_user_role trigger
  await admin.from("user_roles").delete().eq("user_id", newUserId);
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: newUserId, role: "super_admin" });

  if (roleErr) {
    await log(email, false, `role insert error: ${roleErr.message}`);
    return json(500, { error: "Rolle konnte nicht gesetzt werden", detail: roleErr.message });
  }

  await log(email, true, null);
  return json(200, {
    success: true,
    created: true,
    email,
    one_time_password: otp,
    message: "Bitte sofort einloggen und Passwort ändern. Dieses Passwort wird nicht erneut angezeigt.",
  });
});
