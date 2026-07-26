import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useState } from "react";
import { formatInBerlin } from "@/lib/timezone";

type Range = "24h" | "7d" | "30d";
const RANGE_MS: Record<Range, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

export function SensorHistoryChart({ meterId, unit }: { meterId: string; unit?: string | null }) {
  const [range, setRange] = useState<Range>("24h");
  const sinceIso = useMemo(() => new Date(Date.now() - RANGE_MS[range]).toISOString(), [range]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["sensor-history", meterId, range],
    enabled: !!meterId,
    staleTime: 60_000,
    queryFn: async () => {
      // 24h → nutzt raw + 5min gemischt; für längere Zeiträume nur 5min
      if (range === "24h") {
        const { data: raw } = await supabase
          .from("sensor_readings_raw")
          .select("recorded_at, value, unit")
          .eq("meter_id", meterId)
          .gte("recorded_at", sinceIso)
          .order("recorded_at", { ascending: true })
          .limit(2000);
        if (raw && raw.length > 0) {
          return raw.map((r: any) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }));
        }
      }
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
    },
  });

  const displayUnit = unit ?? "";

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Verlauf</CardTitle>
        <ToggleGroup type="single" value={range} size="sm" onValueChange={(v) => v && setRange(v as Range)}>
          <ToggleGroupItem value="24h">24h</ToggleGroupItem>
          <ToggleGroupItem value="7d">7T</ToggleGroupItem>
          <ToggleGroupItem value="30d">30T</ToggleGroupItem>
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
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={(t) => formatInBerlin(new Date(t), range === "24h" ? "HH:mm" : "dd.MM")}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                />
                <Tooltip
                  labelFormatter={(t) => formatInBerlin(new Date(Number(t)), "dd.MM.yyyy HH:mm")}
                  formatter={(v: any) => [
                    `${Number(v).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${displayUnit}`.trim(),
                    "Wert",
                  ]}
                />
                <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
