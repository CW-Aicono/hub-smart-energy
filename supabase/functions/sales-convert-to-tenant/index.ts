import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { project_id, quote_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify partner / super_admin
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAllowed = (roles ?? []).some((r) =>
      r.role === "super_admin" || r.role === "sales_partner");
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Load project
    const { data: project, error: pErr } = await admin
      .from("sales_projects").select("*").eq("id", project_id).maybeSingle();
    if (pErr || !project) throw new Error("Projekt nicht gefunden");
    if (project.converted_tenant_id) {
      return new Response(JSON.stringify({
        error: "Bereits konvertiert",
        tenant_id: project.converted_tenant_id,
      }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Pick latest quote (or specified)
    const quoteQ = admin.from("sales_quotes")
      .select("id, version")
      .eq("project_id", project_id)
      .order("version", { ascending: false })
      .limit(1);
    const { data: quotes } = quote_id
      ? await admin.from("sales_quotes").select("id, version").eq("id", quote_id).limit(1)
      : await quoteQ;
    const quote = quotes?.[0];
    if (!quote) throw new Error("Kein Angebot gefunden – bitte zuerst eines generieren");

    const { data: quoteModules } = await admin
      .from("sales_quote_modules")
      .select("module_code, preis_monatlich")
      .eq("quote_id", quote.id);

    // Build slug
    let baseSlug = slugify(project.kunde_name) || "kunde";
    let slug = baseSlug;
    let n = 1;
    while (true) {
      const { data: existing } = await admin
        .from("tenants").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      n++;
      slug = `${baseSlug}-${n}`;
    }

    // Create tenant
    const { data: tenant, error: tErr } = await admin
      .from("tenants").insert({
        name: project.kunde_name,
        slug,
        contact_email: project.kontakt_email,
        contact_phone: project.kontakt_telefon,
        contact_person: project.kontakt_name,
        address: project.adresse,
        is_kommune: project.kunde_typ !== "industry",
      }).select("id, slug").single();
    if (tErr) throw tErr;

    // Enable modules
    if ((quoteModules?.length ?? 0) > 0) {
      await admin.from("tenant_modules").insert(
        quoteModules!.map((m) => ({
          tenant_id: tenant.id,
          module_code: m.module_code,
          is_enabled: true,
          price_override: Number(m.preis_monatlich),
        })),
      );
    }

    // Create main location
    const { data: location, error: lErr } = await admin
      .from("locations").insert({
        tenant_id: tenant.id,
        name: project.kunde_name,
        address: project.adresse,
        is_main_location: true,
      }).select("id").single();
    if (lErr) console.error("[location]", lErr);

    // Mark project as converted
    await admin.from("sales_projects").update({
      status: "converted",
      converted_tenant_id: tenant.id,
      accepted_at: project.accepted_at ?? new Date().toISOString(),
    }).eq("id", project_id);

    return new Response(JSON.stringify({
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      location_id: location?.id,
      modules_enabled: quoteModules?.length ?? 0,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[sales-convert-to-tenant]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
