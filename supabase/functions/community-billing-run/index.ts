// Community Billing Run (Iter C)
// Erzeugt monatliche Rechnungen je Mitglied aus community_allocations_15min × community_tariffs.
// Input: { community_id, year, month } (1..12). Bestehende drafts werden überschrieben, issued bleiben.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { community_id, year, month } = body as { community_id?: string; year?: number; month?: number };
    if (!community_id || !year || !month || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: "community_id, year, month (1-12) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: community } = await admin
      .from("energy_communities").select("id, tenant_id, name").eq("id", community_id).maybeSingle();
    if (!community) {
      return new Response(JSON.stringify({ error: "Community not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await admin
      .from("profiles").select("tenant_id").eq("user_id", userData.user.id).maybeSingle();
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper && profile?.tenant_id !== community.tenant_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));
    const periodStartDate = periodStart.toISOString().slice(0, 10);
    const periodEndDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    // Tarife laden
    const { data: tariffs } = await admin
      .from("community_tariffs")
      .select("valid_from, valid_to, price_ct_kwh, feed_in_ct_kwh")
      .eq("community_id", community_id);

    function tariffFor(ts: Date): { price: number; feedIn: number } {
      for (const t of tariffs ?? []) {
        const from = new Date(t.valid_from + "T00:00:00Z");
        const to = t.valid_to ? new Date(t.valid_to + "T23:59:59Z") : null;
        if (ts >= from && (!to || ts <= to)) {
          return { price: Number(t.price_ct_kwh), feedIn: Number(t.feed_in_ct_kwh) };
        }
      }
      return { price: 0, feedIn: 0 };
    }

    // Allokationen
    const { data: allocs } = await admin
      .from("community_allocations_15min")
      .select("member_id, ts_start, allocated_kwh")
      .eq("community_id", community_id)
      .gte("ts_start", periodStart.toISOString())
      .lt("ts_start", periodEnd.toISOString());

    // Einspeisungen je Mitglied (feed_in)
    const { data: feeds } = await admin
      .from("community_member_readings_15min")
      .select("member_id, ts_start, kwh")
      .eq("community_id", community_id)
      .eq("direction", "feed_in")
      .gte("ts_start", periodStart.toISOString())
      .lt("ts_start", periodEnd.toISOString());

    type Agg = { allocKwh: number; feedKwh: number; internalCt: number; creditCt: number };
    const perMember = new Map<string, Agg>();

    for (const a of allocs ?? []) {
      const ts = new Date(a.ts_start as string);
      const t = tariffFor(ts);
      const kwh = Number(a.allocated_kwh);
      const ct = kwh * t.price;
      const m = (perMember.get(a.member_id as string) ?? { allocKwh: 0, feedKwh: 0, internalCt: 0, creditCt: 0 });
      m.allocKwh += kwh;
      m.internalCt += ct;
      perMember.set(a.member_id as string, m);
    }
    for (const f of feeds ?? []) {
      const ts = new Date(f.ts_start as string);
      const t = tariffFor(ts);
      const kwh = Number(f.kwh);
      const ct = kwh * t.feedIn;
      const m = (perMember.get(f.member_id as string) ?? { allocKwh: 0, feedKwh: 0, internalCt: 0, creditCt: 0 });
      m.feedKwh += kwh;
      m.creditCt += ct;
      perMember.set(f.member_id as string, m);
    }

    let createdOrUpdated = 0;
    for (const [memberId, agg] of perMember.entries()) {
      const totalCt = Math.round(agg.internalCt - agg.creditCt);
      const row = {
        tenant_id: community.tenant_id,
        community_id,
        member_id: memberId,
        period_start: periodStartDate,
        period_end: periodEndDate,
        allocated_kwh: Number(agg.allocKwh.toFixed(4)),
        feed_in_kwh: Number(agg.feedKwh.toFixed(4)),
        internal_amount_ct: Math.round(agg.internalCt),
        feed_in_credit_ct: Math.round(agg.creditCt),
        total_ct: totalCt,
        status: "draft",
        line_items: [
          { type: "consumption", kwh: agg.allocKwh, amount_ct: Math.round(agg.internalCt) },
          { type: "feed_in_credit", kwh: agg.feedKwh, amount_ct: -Math.round(agg.creditCt) },
        ],
      };

      // Bestehende issued-Rechnung NICHT überschreiben
      const { data: existing } = await admin
        .from("community_member_invoices")
        .select("id, status")
        .eq("member_id", memberId)
        .eq("period_start", periodStartDate)
        .eq("period_end", periodEndDate)
        .maybeSingle();

      if (existing && existing.status !== "draft") continue;
      if (existing) {
        await admin.from("community_member_invoices").update(row).eq("id", existing.id);
      } else {
        await admin.from("community_member_invoices").insert(row);
      }
      createdOrUpdated++;
    }

    return new Response(JSON.stringify({
      ok: true, community_id, year, month, invoices_processed: createdOrUpdated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
