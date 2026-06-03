// Edge Function: charge-point-auto-reboot
// Sendet einen Reset-Befehl (Soft/Hard) an aktivierte Ladepunkte einmal pro Tag
// zur gewünschten Uhrzeit (Europe/Berlin). Wird stündlich per pg_cron gestartet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChargePointRow {
  id: string;
  ocpp_id: string | null;
  name: string;
  auto_reboot_time: string; // "HH:MM:SS"
  auto_reboot_type: "Soft" | "Hard";
  auto_reboot_skip_if_charging: boolean;
  auto_reboot_last_run_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Aktuelles Datum/Uhrzeit in Europe/Berlin
  const nowUtc = new Date();
  const berlinNow = new Date(
    nowUtc.toLocaleString("en-US", { timeZone: "Europe/Berlin" }),
  );
  const todayBerlin = `${berlinNow.getFullYear()}-${String(berlinNow.getMonth() + 1).padStart(2, "0")}-${String(berlinNow.getDate()).padStart(2, "0")}`;
  const nowBerlinTime = `${String(berlinNow.getHours()).padStart(2, "0")}:${String(berlinNow.getMinutes()).padStart(2, "0")}:${String(berlinNow.getSeconds()).padStart(2, "0")}`;

  console.log(`[auto-reboot] tick — Berlin date=${todayBerlin}, time=${nowBerlinTime}`);

  // Kandidaten: enabled + ocpp_id vorhanden + Uhrzeit erreicht + heute noch nicht gelaufen
  const { data: candidates, error } = await supabase
    .from("charge_points")
    .select("id, ocpp_id, name, auto_reboot_time, auto_reboot_type, auto_reboot_skip_if_charging, auto_reboot_last_run_at")
    .eq("auto_reboot_enabled", true)
    .not("ocpp_id", "is", null);

  if (error) {
    console.error("[auto-reboot] failed to fetch charge_points", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let dispatched = 0;
  let skippedCharging = 0;
  let skippedAlreadyRun = 0;
  let skippedTimeNotReached = 0;

  for (const cp of (candidates ?? []) as ChargePointRow[]) {
    // Uhrzeit erreicht?
    if (cp.auto_reboot_time > nowBerlinTime) {
      skippedTimeNotReached++;
      continue;
    }

    // Heute schon gelaufen?
    if (cp.auto_reboot_last_run_at) {
      const lastBerlin = new Date(
        new Date(cp.auto_reboot_last_run_at).toLocaleString("en-US", { timeZone: "Europe/Berlin" }),
      );
      const lastDate = `${lastBerlin.getFullYear()}-${String(lastBerlin.getMonth() + 1).padStart(2, "0")}-${String(lastBerlin.getDate()).padStart(2, "0")}`;
      if (lastDate === todayBerlin) {
        skippedAlreadyRun++;
        continue;
      }
    }

    // Skip falls aktiver Ladevorgang
    if (cp.auto_reboot_skip_if_charging) {
      const { count } = await supabase
        .from("charging_sessions")
        .select("id", { count: "exact", head: true })
        .eq("charge_point_id", cp.id)
        .eq("status", "active");
      if ((count ?? 0) > 0) {
        console.log(`[auto-reboot] skip ${cp.name} — active charging session`);
        skippedCharging++;
        continue;
      }
    }

    // Reset-Command einreihen
    const { error: insErr } = await supabase
      .from("pending_ocpp_commands")
      .insert({
        charge_point_ocpp_id: cp.ocpp_id!,
        command: "Reset",
        payload: { type: cp.auto_reboot_type },
        status: "pending",
      });

    if (insErr) {
      console.error(`[auto-reboot] insert command failed for ${cp.name}`, insErr);
      continue;
    }

    // last_run_at setzen
    const { error: updErr } = await supabase
      .from("charge_points")
      .update({ auto_reboot_last_run_at: nowUtc.toISOString() })
      .eq("id", cp.id);

    if (updErr) {
      console.error(`[auto-reboot] update last_run_at failed for ${cp.name}`, updErr);
    }

    dispatched++;
    console.log(`[auto-reboot] dispatched ${cp.auto_reboot_type} reset to ${cp.name} (${cp.ocpp_id})`);
  }

  const summary = {
    ok: true,
    dispatched,
    skippedCharging,
    skippedAlreadyRun,
    skippedTimeNotReached,
    candidates: candidates?.length ?? 0,
    berlinDate: todayBerlin,
    berlinTime: nowBerlinTime,
  };
  console.log("[auto-reboot] done", summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
