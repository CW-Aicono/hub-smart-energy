// Stufe 4 – Partner-Portal: Tenant-Anlage durch Partner-Admin.
// Erzeugt einen Tenant mit partner_id = Partner des Aufrufers.
// Die Admin-Einladung wird im Frontend separat über invite-tenant-admin gesendet
// (jene Function wurde so erweitert, dass partner_admins für eigene Tenants
// einladen dürfen).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Not authenticated");

    // Caller muss partner_admin eines Partners sein
    const { data: membership } = await supabase
      .from("partner_members")
      .select("partner_id, partner_role")
      .eq("user_id", user.id)
      .eq("partner_role", "partner_admin")
      .maybeSingle();
    if (!membership?.partner_id) {
      throw new Error("Nur Partner-Admins dürfen Tenants anlegen.");
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const contactEmail = body.contact_email ? String(body.contact_email).trim().toLowerCase() : null;

    if (!name) throw new Error("Name fehlt.");
    if (!/^[a-z0-9-]{2,50}$/.test(slug))
      throw new Error("Slug ungültig (a-z, 0-9, '-', 2–50 Zeichen).");

    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) throw new Error(`Slug '${slug}' ist bereits vergeben.`);

    const { data: tenant, error: insertErr } = await supabase
      .from("tenants")
      .insert({
        name,
        slug,
        contact_email: contactEmail,
        partner_id: membership.partner_id,
      })
      .select("id, name, slug")
      .single();
    if (insertErr || !tenant) {
      throw new Error(`Tenant konnte nicht angelegt werden: ${insertErr?.message ?? "unbekannt"}`);
    }

    return new Response(
      JSON.stringify({ success: true, tenant }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
