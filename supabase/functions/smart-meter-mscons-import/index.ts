// Smart-Meter / iMSys – MSCONS Import (Phase 1 Skeleton)
// Nimmt eine MSCONS-Datei (EDIFACT) entgegen, speichert einen Audit-Eintrag
// mit SHA-256-Hash (Idempotenz) und gibt zurück, dass der Parser noch aussteht.
// Der vollständige EDIFACT-Parser folgt im Rahmen von Phase 1 (5–7 Wochen).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    const locationId = (form.get("location_id") as string) || null;
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "file required (multipart)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);

    // Idempotenz: existierenden Import zurückgeben
    const { data: existing } = await admin
      .from("smart_meter_mscons_imports")
      .select("id, status, rows_imported, rows_skipped")
      .eq("tenant_id", profile.tenant_id)
      .eq("file_hash", hash)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ ok: true, deduplicated: true, import: existing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: imp, error: insErr } = await admin
      .from("smart_meter_mscons_imports")
      .insert({
        tenant_id: profile.tenant_id,
        location_id: locationId,
        uploaded_by: userData.user.id,
        file_name: file.name,
        file_hash: hash,
        file_size_bytes: buf.byteLength,
        status: "parser_pending",
        error_message:
          "EDIFACT-Parser ist noch nicht implementiert (Phase 1 in Umsetzung). Datei und Hash sind gespeichert.",
      })
      .select()
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        import: imp,
        note: "Audit-Eintrag gespeichert. Der EDIFACT/MSCONS-Parser folgt in Phase 1.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
