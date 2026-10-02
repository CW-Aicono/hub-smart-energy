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

    // Verify super_admin OR partner member
    const [{ data: roles }, { data: memberships }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userData.user.id),
      admin.from("partner_members").select("id").eq("user_id", userData.user.id).limit(1),
    ]);
    const isAllowed =
      (roles ?? []).some((r) => r.role === "super_admin" || r.role === "sales_partner") ||
      (memberships ?? []).length > 0;
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

    // Resolve partner ownership: prefer the project's partner_org_id, else the caller's first partner_members row
    let partnerId: string | null = (project as any).partner_org_id ?? null;
    if (!partnerId) {
      const { data: pm } = await admin
        .from("partner_members")
        .select("partner_id")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      partnerId = pm?.partner_id ?? null;
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
        partner_id: partnerId,
        support_owner: partnerId ? "partner" : "platform",
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

    // Load sales structure (may be empty → fallback to single default location)
    const { data: salesLocs } = await admin
      .from("sales_locations")
      .select("*")
      .eq("project_id", project_id)
      .order("sort_order");

    const salesLocations = salesLocs ?? [];
    const locIds = salesLocations.map((l: any) => l.id);

    const [{ data: salesES }, { data: salesFloors }] = await Promise.all([
      locIds.length
        ? admin.from("sales_location_energy_sources").select("*").in("sales_location_id", locIds)
        : Promise.resolve({ data: [] as any[] }),
      locIds.length
        ? admin.from("sales_floors").select("*").in("sales_location_id", locIds).order("floor_number")
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const floorIds = (salesFloors ?? []).map((f: any) => f.id);
    const { data: salesRooms } = floorIds.length
      ? await admin.from("sales_rooms").select("*").in("sales_floor_id", floorIds).order("sort_order")
      : { data: [] as any[] };

    // Track main location id for return value
    let mainLocationId: string | null = null;

    if (salesLocations.length === 0) {
      // Legacy: single default location from project fields
      const { data: location, error: lErr } = await admin
        .from("locations").insert({
          tenant_id: tenant.id,
          name: project.kunde_name,
          address: project.adresse,
          is_main_location: true,
        }).select("id").single();
      if (lErr) console.error("[location]", lErr);
      mainLocationId = location?.id ?? null;
    } else {
      // Map sales_location_id → real location_id and sales_floor_id → real floor_id
      const locMap = new Map<string, string>();
      const floorMap = new Map<string, string>();
      // Ensure exactly one main location
      const hasMain = salesLocations.some((l: any) => l.is_main);
      for (let i = 0; i < salesLocations.length; i++) {
        const sl: any = salesLocations[i];
        const isMain = hasMain ? !!sl.is_main : i === 0;
        const { data: loc, error: locErr } = await admin.from("locations").insert({
          tenant_id: tenant.id,
          name: sl.name,
          address: sl.adresse ?? project.adresse ?? null,
          usage_type: sl.usage_type ?? null,
          net_floor_area: sl.net_floor_area ?? null,
          construction_year: sl.construction_year ?? null,
          renovation_year: sl.renovation_year ?? null,
          heating_type: sl.heating_type ?? null,
          federal_state: sl.federal_state ?? null,
          grid_limit_kw: sl.grid_limit_kw ?? null,
          hot_water_energy_type: sl.hot_water_energy_type ?? null,
          description: sl.notizen ?? null,
          is_main_location: isMain,
          type: "einzelgebaeude",
        } as any).select("id").single();
        if (locErr) { console.error("[location]", locErr); continue; }
        locMap.set(sl.id, loc!.id);
        if (isMain) mainLocationId = loc!.id;

        // Energy sources for this location
        const es = (salesES ?? []).filter((e: any) => e.sales_location_id === sl.id);
        if (es.length) {
          await admin.from("location_energy_sources").insert(es.map((e: any) => ({
            tenant_id: tenant.id,
            location_id: loc!.id,
            energy_type: e.energy_type,
            custom_name: e.custom_name,
            sort_order: e.sort_order ?? 0,
          })));
        }
      }

      // Floors
      for (const sf of (salesFloors ?? [])) {
        const parentLocId = locMap.get((sf as any).sales_location_id);
        if (!parentLocId) continue;
        const { data: fl, error: fErr } = await admin.from("floors").insert({
          location_id: parentLocId,
          name: (sf as any).name,
          floor_number: (sf as any).floor_number ?? 0,
          area_sqm: (sf as any).area_sqm ?? null,
          description: (sf as any).description ?? null,
          sort_order: (sf as any).sort_order ?? 0,
        } as any).select("id").single();
        if (fErr) { console.error("[floor]", fErr); continue; }
        floorMap.set((sf as any).id, fl!.id);
      }

      // Rooms
      for (const sr of (salesRooms ?? [])) {
        const parentFloorId = floorMap.get((sr as any).sales_floor_id);
        if (!parentFloorId) continue;
        const { error: rErr } = await admin.from("floor_rooms").insert({
          floor_id: parentFloorId,
          name: (sr as any).name,
          position_x: 0,
          position_y: 0,
          width: (sr as any).width ?? 4,
          depth: (sr as any).depth ?? 4,
          wall_height: (sr as any).wall_height ?? 2.5,
        } as any);
        if (rErr) console.error("[room]", rErr);
      }
    }
    const location = mainLocationId ? { id: mainLocationId } : null;

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
