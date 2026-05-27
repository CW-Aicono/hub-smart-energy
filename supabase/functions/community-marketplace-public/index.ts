// Iter D · Stufe 1 — Öffentlicher Marktplatz-Endpoint (Lese-RPC + Beitritts-Antrag)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const JoinSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  plz: z.string().trim().regex(/^\d{4,5}$/, "Ungültige PLZ").optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // Stripe-style: alles nach /community-marketplace-public/...
  const path = url.pathname.replace(/^.*?community-marketplace-public/, "") || "/";
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);

  try {
    // GET /listings?plz=12345
    if (req.method === "GET" && (path === "/" || path === "/listings")) {
      const plz = url.searchParams.get("plz");
      const { data, error } = await anonClient.rpc("community_marketplace_public_listings", { p_plz: plz });
      if (error) throw error;
      return json({ listings: data ?? [] });
    }

    // GET /listings/:slug
    if (req.method === "GET" && path.startsWith("/listings/")) {
      const slug = decodeURIComponent(path.replace("/listings/", "").replace(/\/$/, ""));
      if (!slug) return json({ error: "slug missing" }, 400);
      const { data, error } = await anonClient.rpc("community_marketplace_public_detail", { p_slug: slug });
      if (error) throw error;
      const listing = (data ?? [])[0];
      if (!listing) return json({ error: "not_found" }, 404);
      await anonClient.rpc("community_marketplace_increment_view", { p_slug: slug });
      return json({ listing });
    }

    // POST /join-request
    if (req.method === "POST" && (path === "/join-request" || path === "/join")) {
      const body = await req.json().catch(() => ({}));
      const parsed = JoinSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: "validation", details: parsed.error.flatten().fieldErrors }, 400);
      }
      const input = parsed.data;

      // Listing + tenant_id + community_id auflösen (service role, weil RLS ohne JWT)
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: listing, error: lErr } = await admin
        .from("community_marketplace_listings")
        .select("id, tenant_id, community_id, is_public, max_members, community_id")
        .eq("slug", input.slug)
        .eq("is_public", true)
        .maybeSingle();
      if (lErr) throw lErr;
      if (!listing) return json({ error: "listing_not_found" }, 404);

      // Soft-Limit: Maximal 1 offener Antrag pro E-Mail+Listing in 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("community_join_requests")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", listing.id)
        .eq("email", input.email)
        .gte("created_at", since);
      if ((count ?? 0) > 0) {
        return json({ ok: true, deduplicated: true, message: "Antrag bereits eingegangen." });
      }

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

      const { error: insErr } = await admin.from("community_join_requests").insert({
        tenant_id: listing.tenant_id,
        community_id: listing.community_id,
        listing_id: listing.id,
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        address: input.address ?? null,
        plz: input.plz ?? null,
        city: input.city ?? null,
        message: input.message ?? null,
        source_ip: ip,
        status: "new",
      });
      if (insErr) throw insErr;

      return json({ ok: true });
    }

    return json({ error: "not_found", path }, 404);
  } catch (e) {
    console.error("[community-marketplace-public]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
