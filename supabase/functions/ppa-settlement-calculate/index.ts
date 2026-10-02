import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  contract_id?: string;
  period_start?: string; // YYYY-MM-01
  tenant_id?: string;    // optional override (super_admin / cron)
}

function lastMonthFirstDay(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

function computeApplied(
  model: string,
  fixed: number | null,
  formula: any,
  epex: number | null,
): number | null {
  if (model === "fixed") return fixed;
  if (epex == null) return null;
  if (model === "spot_plus_premium") return epex + Number(formula?.premium ?? 0);
  if (model === "floor_cap") {
    const f = Number(formula?.floor ?? 0);
    const c = Number(formula?.cap ?? 0);
    return Math.max(f, Math.min(c, epex));
  }
  if (model === "index_linked") {
    return epex * Number(formula?.factor ?? 1) + Number(formula?.offset ?? 0);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: Body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const authHeader = req.headers.get("Authorization") ?? "";

    const isServiceRole =
      authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userTenantId: string | null = null;
    if (!isServiceRole) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
        authHeader.replace("Bearer ", ""),
      );
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claims.claims.sub;
      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .maybeSingle();
      userTenantId = prof?.tenant_id ?? null;
      if (!userTenantId) {
        return new Response(JSON.stringify({ error: "Kein Mandant" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const periodStart = body.period_start ?? lastMonthFirstDay();
    const periodEnd = addMonths(periodStart, 1); // exclusive

    // Fetch contracts
    let q = supabase
      .from("ppa_contracts")
      .select("id, tenant_id, ppa_type, status, price_model, price_eur_per_kwh, price_formula, contract_start, contract_end")
      .in("status", ["active", "suspended"])
      .lte("contract_start", periodEnd)
      .gte("contract_end", periodStart);

    if (body.contract_id) q = q.eq("id", body.contract_id);
    if (userTenantId) q = q.eq("tenant_id", userTenantId);
    else if (body.tenant_id) q = q.eq("tenant_id", body.tenant_id);

    const { data: contracts, error: cErr } = await q;
    if (cErr) throw cErr;

    const results: any[] = [];

    for (const c of contracts ?? []) {
      try {
        // Get consumption meter ids
        const { data: meterRows } = await supabase
          .from("ppa_consumption_meters")
          .select("meter_id")
          .eq("contract_id", c.id);

        const meterIds = (meterRows ?? []).map((r: any) => r.meter_id as string);
        if (meterIds.length === 0) {
          // For off-site or contracts without meters: skip (no consumption to bill)
          results.push({ contract_id: c.id, skipped: "no_consumption_meters" });
          continue;
        }

        // Hourly consumption from 5-min aggregates
        const { data: readings } = await supabase.rpc("get_power_readings_5min", {
          p_meter_ids: meterIds,
          p_start: `${periodStart}T00:00:00Z`,
          p_end: `${periodEnd}T00:00:00Z`,
        });

        // Sum positive (consumption) per hour, in kWh
        const hourlyKwh = new Map<string, number>();
        for (const r of (readings ?? []) as any[]) {
          const p = Number(r.power_avg);
          if (!isFinite(p) || p <= 0) continue;
          const hourKey = new Date(r.bucket).toISOString().slice(0, 13); // YYYY-MM-DDTHH
          hourlyKwh.set(hourKey, (hourlyKwh.get(hourKey) ?? 0) + p * (5 / 60));
        }

        // Spot prices for the month
        const { data: spots } = await supabase
          .from("spot_prices")
          .select("timestamp, price_eur_mwh")
          .eq("market_area", "DE-LU")
          .eq("price_type", "day_ahead")
          .gte("timestamp", `${periodStart}T00:00:00Z`)
          .lt("timestamp", `${periodEnd}T00:00:00Z`)
          .order("timestamp", { ascending: true });

        const spotByHour = new Map<string, number>();
        for (const s of (spots ?? []) as any[]) {
          const hourKey = new Date(s.timestamp).toISOString().slice(0, 13);
          spotByHour.set(hourKey, Number(s.price_eur_mwh) / 1000); // €/kWh
        }

        let totalKwh = 0;
        let totalCost = 0;
        let weightedSpot = 0;
        let weightedApplied = 0;
        const breakdown: Array<{ hour: string; kwh: number; spot: number | null; applied: number | null; cost: number }> = [];

        for (const [hour, kwh] of hourlyKwh.entries()) {
          const spot = spotByHour.get(hour) ?? null;
          const applied = computeApplied(
            c.price_model as string,
            c.price_eur_per_kwh != null ? Number(c.price_eur_per_kwh) : null,
            c.price_formula,
            spot,
          );
          const cost = applied != null ? kwh * applied : 0;
          totalKwh += kwh;
          totalCost += cost;
          if (spot != null) weightedSpot += kwh * spot;
          if (applied != null) weightedApplied += kwh * applied;
          breakdown.push({ hour, kwh: Number(kwh.toFixed(4)), spot, applied, cost: Number(cost.toFixed(4)) });
        }

        const row = {
          tenant_id: c.tenant_id,
          contract_id: c.id,
          period_start: periodStart,
          period_end: addMonths(periodStart, 1),
          delivered_kwh: Number(totalKwh.toFixed(3)),
          consumed_kwh: Number(totalKwh.toFixed(3)),
          avg_spot_price_eur_kwh: totalKwh > 0 ? Number((weightedSpot / totalKwh).toFixed(5)) : null,
          applied_avg_price_eur_kwh: totalKwh > 0 ? Number((weightedApplied / totalKwh).toFixed(5)) : null,
          total_amount_eur: Number(totalCost.toFixed(2)),
          status: "draft",
          breakdown: { hours: breakdown.slice(0, 800) }, // safety cap
          error: null,
          computed_at: new Date().toISOString(),
        };

        const { error: upErr } = await supabase
          .from("ppa_settlements")
          .upsert(row, { onConflict: "contract_id,period_start" });

        if (upErr) throw upErr;
        results.push({ contract_id: c.id, total_kwh: row.delivered_kwh, total_eur: row.total_amount_eur });
      } catch (e: any) {
        results.push({ contract_id: c.id, error: String(e?.message ?? e) });
      }
    }

    return new Response(
      JSON.stringify({ period_start: periodStart, count: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
