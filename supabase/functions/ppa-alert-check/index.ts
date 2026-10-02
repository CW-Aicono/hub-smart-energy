import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Daily check for PPA contracts:
// - expiring soon (90/60/30 days)
// - no consumption data for active onsite contracts (>7 days)
// - floor/cap violations vs last 7-day avg spot

const EXPIRY_THRESHOLDS = [90, 60, 30];

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((a.getTime() - b.getTime()) / 86400000);
}

async function upsertTask(
  supabase: any,
  tenantId: string,
  title: string,
  sourceLabel: string,
  priority: "low" | "medium" | "high" = "medium",
) {
  // Avoid duplicate open task with same title
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("title", title)
    .neq("status", "done")
    .maybeSingle();
  if (existing) return;
  await supabase.from("tasks").insert({
    tenant_id: tenantId,
    title,
    status: "open",
    priority,
    source_type: "ppa",
    source_label: sourceLabel,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole =
      authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    if (!isServiceRole && !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();

    // 1) Active contracts
    const { data: contracts } = await supabase
      .from("ppa_contracts")
      .select("id, tenant_id, producer_name, offtaker_name, contract_end, price_model, price_formula, ppa_type")
      .in("status", ["active", "suspended"]);

    let alerts = 0;

    // 7-day avg spot
    const sevenAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const { data: spots } = await supabase
      .from("spot_prices")
      .select("price_eur_mwh")
      .eq("market_area", "DE-LU")
      .eq("price_type", "day_ahead")
      .gte("timestamp", sevenAgo);
    const spotAvgKwh =
      spots && spots.length > 0
        ? spots.reduce((s: number, r: any) => s + Number(r.price_eur_mwh), 0) /
          spots.length /
          1000
        : null;

    for (const c of contracts ?? []) {
      const endDate = new Date(c.contract_end);
      const daysLeft = daysBetween(endDate, now);

      // Expiry alerts
      for (const t of EXPIRY_THRESHOLDS) {
        if (daysLeft > 0 && daysLeft <= t && daysLeft > t - 1) {
          await upsertTask(
            supabase,
            c.tenant_id,
            `PPA „${c.producer_name} → ${c.offtaker_name}" läuft in ${daysLeft} Tagen aus`,
            `PPA · ${c.id.slice(0, 8)}`,
            t <= 30 ? "high" : "medium",
          );
          alerts++;
        }
      }
      if (daysLeft < 0) {
        await upsertTask(
          supabase,
          c.tenant_id,
          `PPA „${c.producer_name} → ${c.offtaker_name}" ist abgelaufen`,
          `PPA · ${c.id.slice(0, 8)}`,
          "high",
        );
        alerts++;
      }

      // Floor/Cap violation alerts
      if (c.price_model === "floor_cap" && c.price_formula && spotAvgKwh != null) {
        const floor = Number(c.price_formula.floor ?? 0);
        const cap = Number(c.price_formula.cap ?? 0);
        if (spotAvgKwh < floor) {
          await upsertTask(
            supabase,
            c.tenant_id,
            `PPA „${c.producer_name}": EPEX-Ø (7T) unter Floor (${(floor * 100).toFixed(2)} ct/kWh)`,
            `PPA · ${c.id.slice(0, 8)}`,
            "medium",
          );
          alerts++;
        } else if (spotAvgKwh > cap) {
          await upsertTask(
            supabase,
            c.tenant_id,
            `PPA „${c.producer_name}": EPEX-Ø (7T) über Cap (${(cap * 100).toFixed(2)} ct/kWh)`,
            `PPA · ${c.id.slice(0, 8)}`,
            "medium",
          );
          alerts++;
        }
      }

      // No data check (onsite only)
      if (c.ppa_type === "onsite") {
        const { data: meterRows } = await supabase
          .from("ppa_consumption_meters")
          .select("meter_id")
          .eq("contract_id", c.id);
        const ids = (meterRows ?? []).map((r: any) => r.meter_id);
        if (ids.length > 0) {
          const { data: recent } = await supabase
            .from("meter_power_readings_5min")
            .select("bucket")
            .in("meter_id", ids)
            .gte("bucket", sevenAgo)
            .limit(1);
          if (!recent || recent.length === 0) {
            await upsertTask(
              supabase,
              c.tenant_id,
              `PPA „${c.producer_name}": keine Verbrauchsdaten seit 7 Tagen`,
              `PPA · ${c.id.slice(0, 8)}`,
              "high",
            );
            alerts++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ checked: contracts?.length ?? 0, alerts_created: alerts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
