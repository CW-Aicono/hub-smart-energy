// Community Allocation Run (Iter C)
// Berechnet je 15-min-Slot die Strom-Allokation an Mitglieder anhand statischer Anteile.
// Input: { community_id, period_start (ISO), period_end (ISO) }
// Strategie MVP: static_share (share_kw / Σ share_kw der aktiven Mitglieder).
// Erzeugung: Summe aller community_assets-Meter (aus meter_power_readings_5min, auf 15 min aggregiert).
// Verbrauch: community_member_readings_15min (direction=consumption).

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
    const { community_id, period_start, period_end } = body as {
      community_id?: string; period_start?: string; period_end?: string;
    };
    if (!community_id || !period_start || !period_end) {
      return new Response(JSON.stringify({ error: "community_id, period_start, period_end required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Community + Berechtigungs-Check
    const { data: community } = await admin
      .from("energy_communities")
      .select("id, tenant_id")
      .eq("id", community_id).maybeSingle();
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

    // Run anlegen
    const { data: run, error: runErr } = await admin
      .from("community_allocation_runs")
      .insert({
        tenant_id: community.tenant_id,
        community_id,
        period_start, period_end,
        strategy: "static_share",
        status: "running",
      }).select().single();
    if (runErr || !run) {
      return new Response(JSON.stringify({ error: runErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      // Aktive Mitglieder + Anteile
      const { data: members } = await admin
        .from("community_members")
        .select("id, share_kw")
        .eq("community_id", community_id)
        .eq("status", "active");
      const totalShare = (members ?? []).reduce((s, m) => s + Number(m.share_kw || 0), 0);

      // Erzeugungs-Meter
      const { data: assets } = await admin
        .from("community_assets")
        .select("meter_id")
        .eq("community_id", community_id)
        .not("meter_id", "is", null);
      const meterIds = (assets ?? []).map((a) => a.meter_id).filter(Boolean) as string[];

      let totalGen = 0;
      let totalAlloc = 0;
      let totalSurplus = 0;

      if (members && members.length > 0 && totalShare > 0 && meterIds.length > 0) {
        // Erzeugung je 15-min Bucket: aus meter_power_readings_5min summieren
        const { data: powerRows } = await admin
          .from("meter_power_readings_5min")
          .select("bucket, power_avg")
          .in("meter_id", meterIds)
          .gte("bucket", period_start)
          .lt("bucket", period_end);

        // Aggregiere zu 15-min Slots (5 min * 3 -> kWh = avg * 5/60)
        const slotMap = new Map<string, number>(); // ts_start ISO -> kWh
        for (const row of powerRows ?? []) {
          const t = new Date(row.bucket as string);
          const m = t.getUTCMinutes();
          t.setUTCMinutes(m - (m % 15), 0, 0);
          const key = t.toISOString();
          const kwh = Number(row.power_avg) * (5 / 60);
          slotMap.set(key, (slotMap.get(key) ?? 0) + kwh);
        }

        // Verbrauch je 15-min (consumption)
        const { data: consRows } = await admin
          .from("community_member_readings_15min")
          .select("ts_start, kwh, member_id")
          .eq("community_id", community_id)
          .eq("direction", "consumption")
          .gte("ts_start", period_start)
          .lt("ts_start", period_end);

        const consBySlot = new Map<string, Map<string, number>>(); // ts -> member -> kwh
        for (const r of consRows ?? []) {
          const ts = new Date(r.ts_start as string).toISOString();
          let inner = consBySlot.get(ts);
          if (!inner) { inner = new Map(); consBySlot.set(ts, inner); }
          inner.set(r.member_id as string, Number(r.kwh));
        }

        const allocRows: any[] = [];
        for (const [ts, genKwh] of slotMap.entries()) {
          totalGen += genKwh;
          const slotCons = consBySlot.get(ts);
          let usedInSlot = 0;
          for (const m of members) {
            const memberShare = Number(m.share_kw) / totalShare;
            const memberAllowance = genKwh * memberShare;
            // Real-Verbrauch begrenzt die Allokation
            const memberCons = slotCons?.get(m.id) ?? memberAllowance;
            const allocated = Math.min(memberAllowance, memberCons);
            usedInSlot += allocated;
            if (allocated > 0) {
              allocRows.push({
                tenant_id: community.tenant_id,
                community_id,
                member_id: m.id,
                run_id: run.id,
                ts_start: ts,
                allocated_kwh: Number(allocated.toFixed(4)),
                surplus_to_grid_kwh: 0,
                strategy: "static_share",
              });
            }
          }
          const surplus = Math.max(0, genKwh - usedInSlot);
          totalAlloc += usedInSlot;
          totalSurplus += surplus;
        }

        // Surplus auf erstes Mitglied buchen als Aggregat (für Reporting) – pro Slot
        // Stattdessen: separater Eintrag mit member_id=erstes Mitglied + surplus
        // MVP: in run-Totals führen, nicht je Slot duplizieren

        // Alte Allokationen für diesen Zeitraum entfernen (Re-Run)
        await admin
          .from("community_allocations_15min")
          .delete()
          .eq("community_id", community_id)
          .gte("ts_start", period_start)
          .lt("ts_start", period_end);

        const CHUNK = 500;
        for (let i = 0; i < allocRows.length; i += CHUNK) {
          const chunk = allocRows.slice(i, i + CHUNK);
          const { error: upErr } = await admin
            .from("community_allocations_15min")
            .insert(chunk);
          if (upErr) throw upErr;
        }
      }

      await admin.from("community_allocation_runs").update({
        status: "completed",
        total_generated_kwh: Number(totalGen.toFixed(4)),
        total_allocated_kwh: Number(totalAlloc.toFixed(4)),
        total_surplus_kwh: Number(totalSurplus.toFixed(4)),
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);

      return new Response(JSON.stringify({
        ok: true, run_id: run.id,
        total_generated_kwh: totalGen,
        total_allocated_kwh: totalAlloc,
        total_surplus_kwh: totalSurplus,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      await admin.from("community_allocation_runs").update({
        status: "failed",
        error_message: String(e),
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      throw e;
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
