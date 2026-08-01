import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isWorkerEnabled } from "../_shared/workerKillswitch.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Lückenfüller: holt fehlende Messreihen aus dem lokalen Gateway-Speicher.
//
// Hintergrund: Wenn das Backend nicht erreichbar ist, kann der WS-Worker seine
// Werte nicht schreiben. Die Gateways (Loxone Miniserver u. a.) speichern die
// Messreihen aber lokal für Tage. Statt gepufferte Ereignisse nachträglich in
// einen einzigen Bucket zu kippen (das erzeugte die 2600-kW-Artefakte), holen
// wir die Lücke sauber aus dem Gerätespeicher nach.
//
// Ablauf pro Durchlauf (stündlich per Cron):
//   1. Alle aktiven Integrationen mit lokalem Speicher ermitteln
//   2. Pro Integration die 5-Min-Buckets der letzten 48 h laden
//   3. Fehlende Bucket-Ketten (>= MIN_GAP_BUCKETS) als Lücken erkennen
//   4. Pro Lücke `backfillRange` auf der Gateway-Function aufrufen
//
// Der Upsert in `backfillRange` überschreibt keine vorhandenen Live-Werte.
// ─────────────────────────────────────────────────────────────────────────────

/** Integrationstypen mit lokalem Messreihenspeicher → Edge-Function-Name. */
const BACKFILL_CAPABLE: Record<string, string> = {
  loxone_miniserver: "loxone-api",
};

const BUCKET_MS = 5 * 60 * 1000;
const LOOKBACK_HOURS = 48;
/** Mindestlänge einer Lücke: 3 Buckets = 15 Minuten. */
const MIN_GAP_BUCKETS = 3;
/** Die jüngsten Buckets sind evtl. noch unterwegs — nicht als Lücke werten. */
const SETTLE_MS = 15 * 60 * 1000;
/** Schutz gegen Dauerschleifen bei Zählern, die schlicht nichts liefern. */
const MAX_GAPS_PER_INTEGRATION = 6;
const MAX_GAP_HOURS = 12;

interface Gap {
  from: Date;
  to: Date;
}

function floorToBucket(ms: number): number {
  return Math.floor(ms / BUCKET_MS) * BUCKET_MS;
}

/** Findet fehlende Bucket-Ketten zwischen erstem und letztem vorhandenen Wert. */
function detectGaps(presentMs: Set<number>, windowStart: number, windowEnd: number): Gap[] {
  const gaps: Gap[] = [];
  let runStart: number | null = null;
  let runLength = 0;

  const flush = (endExclusive: number) => {
    if (runStart !== null && runLength >= MIN_GAP_BUCKETS) {
      const to = new Date(endExclusive);
      const maxSpan = MAX_GAP_HOURS * 60 * 60 * 1000;
      const from = new Date(Math.max(runStart, endExclusive - maxSpan));
      gaps.push({ from, to });
    }
    runStart = null;
    runLength = 0;
  };

  for (let t = windowStart; t <= windowEnd; t += BUCKET_MS) {
    if (presentMs.has(t)) {
      flush(t);
    } else {
      if (runStart === null) runStart = t;
      runLength += 1;
    }
  }
  flush(windowEnd + BUCKET_MS);
  return gaps;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!(await isWorkerEnabled("gap_backfill_scheduler"))) {
    return new Response(JSON.stringify({ success: true, skipped: true, reason: "worker_paused" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results: Array<Record<string, unknown>> = [];

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* leerer Body ist erlaubt */ }
    }
    const onlyIntegrationId = typeof body.locationIntegrationId === "string" ? body.locationIntegrationId : null;
    const dryRun = body.dryRun === true;

    const { data: integrations, error: integError } = await supabase
      .from("location_integrations")
      .select("id, location_id, is_enabled, integration:integrations(type)")
      .eq("is_enabled", true);

    if (integError) throw new Error(`Integrationen konnten nicht geladen werden: ${integError.message}`);

    const candidates = (integrations || []).filter((row: any) => {
      const type = row.integration?.type;
      if (!type || !BACKFILL_CAPABLE[type]) return false;
      if (onlyIntegrationId && row.id !== onlyIntegrationId) return false;
      return true;
    });

    const nowMs = Date.now();
    const windowEnd = floorToBucket(nowMs - SETTLE_MS);
    const windowStart = floorToBucket(nowMs - LOOKBACK_HOURS * 60 * 60 * 1000);

    for (const integ of candidates as any[]) {
      const type = integ.integration.type as string;
      const fnName = BACKFILL_CAPABLE[type];

      // Zähler dieser Integration (nur solche mit Gateway-Referenz)
      const { data: meters, error: meterError } = await supabase
        .from("meters")
        .select("id")
        .eq("location_integration_id", integ.id)
        .eq("is_archived", false)
        .not("sensor_uuid", "is", null);

      if (meterError) {
        results.push({ integrationId: integ.id, error: meterError.message });
        continue;
      }
      const meterIds = (meters || []).map((m: any) => m.id);
      if (meterIds.length === 0) {
        results.push({ integrationId: integ.id, skipped: "keine verknüpften Zähler" });
        continue;
      }

      // Vorhandene Buckets im Fenster (nur die Zeitspalte → minimaler IO)
      const { data: rows, error: bucketError } = await supabase
        .from("meter_power_readings_5min")
        .select("bucket")
        .in("meter_id", meterIds)
        .gte("bucket", new Date(windowStart).toISOString())
        .lte("bucket", new Date(windowEnd).toISOString())
        .order("bucket", { ascending: true })
        .limit(50000);

      if (bucketError) {
        results.push({ integrationId: integ.id, error: bucketError.message });
        continue;
      }

      const present = new Set<number>();
      for (const r of (rows || []) as Array<{ bucket: string }>) {
        present.add(floorToBucket(new Date(r.bucket).getTime()));
      }

      if (present.size === 0) {
        // Gateway hat im gesamten Fenster nie geliefert → das ist kein
        // Datenloch, sondern eine tote Verbindung. Nicht Sache dieses Jobs.
        results.push({ integrationId: integ.id, skipped: "keine Daten im Fenster" });
        continue;
      }

      const firstPresent = Math.min(...present);
      const gaps = detectGaps(present, firstPresent, windowEnd).slice(0, MAX_GAPS_PER_INTEGRATION);

      if (gaps.length === 0) {
        results.push({ integrationId: integ.id, gaps: 0 });
        continue;
      }

      if (dryRun) {
        results.push({
          integrationId: integ.id,
          dryRun: true,
          gaps: gaps.map((g) => ({ from: g.from.toISOString(), to: g.to.toISOString() })),
        });
        continue;
      }

      let filled = 0;
      const gapErrors: string[] = [];
      for (const gap of gaps) {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "backfillRange",
              locationIntegrationId: integ.id,
              from: gap.from.toISOString(),
              to: gap.to.toISOString(),
              meterIds,
            }),
          });
          const json = await resp.json().catch(() => ({}));
          if (!resp.ok || json?.success === false) {
            gapErrors.push(`${gap.from.toISOString()}: ${json?.error || resp.status}`);
          } else {
            filled += Number(json?.backfilled ?? 0);
          }
        } catch (e) {
          gapErrors.push(`${gap.from.toISOString()}: ${(e as Error).message}`);
        }
      }

      results.push({
        integrationId: integ.id,
        type,
        gaps: gaps.length,
        backfilled: filled,
        errors: gapErrors.length > 0 ? gapErrors : undefined,
      });
    }

    console.log(`gap-backfill-scheduler: ${candidates.length} Integrationen geprüft`);

    return new Response(JSON.stringify({ success: true, checked: candidates.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("gap-backfill-scheduler failed:", msg);
    return new Response(JSON.stringify({ success: false, error: msg, results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
