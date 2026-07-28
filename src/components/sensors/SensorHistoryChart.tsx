import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const BERLIN_TZ = "Europe/Berlin";
function fmtBerlin(d: Date, mode: "time" | "day" | "month" | "full"): string {
  const opts: Intl.DateTimeFormatOptions = mode === "time"
    ? { timeZone: BERLIN_TZ, hour: "2-digit", minute: "2-digit" }
    : mode === "day"
      ? { timeZone: BERLIN_TZ, day: "2-digit", month: "2-digit" }
      : mode === "month"
        ? { timeZone: BERLIN_TZ, month: "short", year: "2-digit" }
        : { timeZone: BERLIN_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("de-DE", opts).format(d);
}

type Range = "24h" | "7d" | "30d" | "12m";
const RANGE_MS: Record<Range, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
  "12m": 365 * 24 * 3600_000,
};
const RANGE_LABEL: Record<Range, string> = { "24h": "24h", "7d": "7T", "30d": "30T", "12m": "12M" };

function fmtValue(v: number, unit: string): string {
  return `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`;
}

export function SensorHistoryChart({ meterId, unit, label }: { meterId: string; unit?: string | null; label?: string | null }) {
  const [range, setRange] = useState<Range>("24h");
  const sinceIso = useMemo(() => new Date(Date.now() - RANGE_MS[range]).toISOString(), [range]);
  const displayUnit = (unit ?? "").trim();

  const { data = [], isLoading } = useQuery({
    queryKey: ["sensor-history", meterId, range],
    enabled: !!meterId,
    staleTime: 60_000,
    queryFn: async () => {
      // 24h → raw; 7d → 5min; 30d → hourly; 12m → daily
      if (range === "24h") {
        const { data: raw } = await supabase
          .from("sensor_readings_raw")
          .select("recorded_at, value")
          .eq("meter_id", meterId)
          .gte("recorded_at", sinceIso)
          .order("recorded_at", { ascending: true })
          .limit(3000);
        if (raw && raw.length > 0) {
          return raw.map((r: any) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }));
        }
        // Fallback zu 5min wenn kein Raw
        const { data: agg } = await supabase
          .from("sensor_readings_5min")
          .select("bucket, value_avg, value_min, value_max")
          .eq("meter_id", meterId)
          .gte("bucket", sinceIso)
          .order("bucket", { ascending: true })
          .limit(2000);
        return (agg ?? []).map((r: any) => ({
          t: new Date(r.bucket).getTime(),
          v: Number(r.value_avg),
          vMin: Number(r.value_min),
          vMax: Number(r.value_max),
        }));
      }
      if (range === "7d") {
        const { data: agg } = await supabase
          .from("sensor_readings_5min")
          .select("bucket, value_avg, value_min, value_max")
          .eq("meter_id", meterId)
          .gte("bucket", sinceIso)
          .order("bucket", { ascending: true })
          .limit(5000);
        return (agg ?? []).map((r: any) => ({
          t: new Date(r.bucket).getTime(),
          v: Number(r.value_avg),
          vMin: Number(r.value_min),
          vMax: Number(r.value_max),
        }));
      }
      if (range === "30d") {
        const { data: agg } = await (supabase as any)
          .from("sensor_readings_hourly")
          .select("bucket, value_twavg, value_min, value_max")
          .eq("meter_id", meterId)
          .gte("bucket", sinceIso)
          .order("bucket", { ascending: true })
          .limit(2000);
        return (agg ?? []).map((r: any) => ({
          t: new Date(r.bucket).getTime(),
          v: Number(r.value_twavg),
          vMin: Number(r.value_min),
          vMax: Number(r.value_max),
        }));
      }
      // 12m
      const sinceDate = new Date(Date.now() - RANGE_MS["12m"]).toISOString().slice(0, 10);
      const { data: agg } = await (supabase as any)
        .from("sensor_readings_daily")
        .select("bucket, value_twavg, value_min, value_max")
        .eq("meter_id", meterId)
        .gte("bucket", sinceDate)
        .order("bucket", { ascending: true })
        .limit(500);
      return (agg ?? []).map((r: any) => ({
        t: new Date(r.bucket).getTime(),
        v: Number(r.value_twavg),
        vMin: Number(r.value_min),
        vMax: Number(r.value_max),
      }));
    },
  });

  // Boolean detection: Einheit "bool"/leer ODER alle Werte ∈ {0,1}
  const unitLower = displayUnit.toLowerCase();
  const isBoolUnit = unitLower === "bool" || unitLower === "boolean" || unitLower === "on/off" || unitLower === "an/aus";
  const isBool = data.length > 0 && (isBoolUnit || data.every((d: any) => d.v === 0 || d.v === 1));

  const xTickMode: "time" | "day" | "month" =
    range === "24h" ? "time" : range === "12m" ? "month" : "day";

  const titleBase = label?.trim() || "Verlauf";
  const title = displayUnit ? `${titleBase} · ${displayUnit}` : titleBase;

  // Festes Zeitfenster [now - RANGE, now] – nicht dataMin/dataMax.
  // Verhindert unregelmäßige Achsenbeschriftung bei Sensoren, deren Rohwerte
  // das Fenster nicht komplett abdecken.
  const { xDomain, xTicks, coverageHint } = useMemo(() => {
    const now = Date.now();
    const windowMs = RANGE_MS[range];
    const start = now - windowMs;
    const domain: [number, number] = [start, now];

    // Tick-Schrittweite je Range
    const ticks: number[] = [];
    if (range === "24h") {
      // alle 2 h, ausgerichtet auf volle Berlin-Stunden
      const stepMs = 2 * 3600_000;
      // Erste "volle Stunde" ≥ start finden (in Berlin-Zeit)
      const d = new Date(start);
      // Auf nächsten vollen 2h-Slot in UTC-Basis ausrichten reicht optisch;
      // Ausrichtung an :00 Minuten:
      d.setUTCMinutes(0, 0, 0);
      let t = d.getTime();
      while (t < start) t += 3600_000;
      // Auf gerade Stunde in Berlin ausrichten (grobe Näherung: modulo 2h ab Epoch)
      while ((t / 3600_000) % 2 !== 0) t += 3600_000;
      for (; t <= now; t += stepMs) ticks.push(t);
    } else if (range === "7d") {
      const stepMs = 12 * 3600_000;
      const d = new Date(start);
      d.setUTCMinutes(0, 0, 0);
      let t = d.getTime();
      while (t < start) t += 3600_000;
      while ((t / 3600_000) % 12 !== 0) t += 3600_000;
      for (; t <= now; t += stepMs) ticks.push(t);
    } else if (range === "30d") {
      const stepMs = 3 * 24 * 3600_000;
      // An Mitternacht Berlin ausrichten (Approximation via UTC+1/2 vermeiden – nutze lokale Tagesgrenze)
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      let t = d.getTime();
      while (t < start) t += 24 * 3600_000;
      for (; t <= now; t += stepMs) ticks.push(t);
    } else {
      // 12m: Monatserster
      const d = new Date(start);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      let cur = d;
      if (cur.getTime() < start) cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      while (cur.getTime() <= now) {
        ticks.push(cur.getTime());
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
    }

    // Coverage-Hinweis
    let hint: string | null = null;
    if (data.length > 0) {
      const first = data[0].t as number;
      const last = data[data.length - 1].t as number;
      const gapStart = first - start;
      const gapEnd = now - last;
      const threshold = windowMs * 0.1;
      if (gapStart > threshold || gapEnd > threshold) {
        hint = `Erfassung ab ${fmtBerlin(new Date(first), "full")} · letzter Wert ${fmtBerlin(new Date(last), "full")}`;
      }
    }

    return { xDomain: domain, xTicks: ticks, coverageHint: hint };
  }, [range, data]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <ToggleGroup type="single" value={range} size="sm" onValueChange={(v) => v && setRange(v as Range)}>
          {(Object.keys(RANGE_MS) as Range[]).map((r) => (
            <ToggleGroupItem key={r} value={r}>{RANGE_LABEL[r]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Lade…</div>
        ) : data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Noch keine Verlaufsdaten – die Aufzeichnung startet ab jetzt.
          </div>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={xDomain}
                    ticks={xTicks}
                    scale="time"
                    tickFormatter={(t) => fmtBerlin(new Date(t), xTickMode)}
                    tick={{ fontSize: 11 }}
                    allowDataOverflow
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    domain={isBool ? [0, 1] : ["auto", "auto"]}
                    ticks={isBool ? [0, 1] : undefined}
                    tickFormatter={(v) => isBool
                      ? (v === 1 ? "Ein" : "Aus")
                      : v.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                  />
                  <Tooltip
                    labelFormatter={(t) => fmtBerlin(new Date(Number(t)), "full")}
                    formatter={(v: any) => [
                      isBool ? (Number(v) === 1 ? "Ein" : "Aus") : fmtValue(Number(v), displayUnit),
                      "Wert",
                    ]}
                  />
                  <Line
                    type={isBool ? "stepAfter" : "monotone"}
                    dataKey="v"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {coverageHint && (
              <div className="mt-2 text-xs text-muted-foreground">{coverageHint}</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
