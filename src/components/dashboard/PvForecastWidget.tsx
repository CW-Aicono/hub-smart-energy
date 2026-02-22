import { useEffect, useState } from "react";
import { usePvForecast, usePvForecastSettings } from "@/hooks/usePvForecast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sun, CloudSun, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface PvForecastWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const PV_YELLOW = "hsl(45, 93%, 47%)";
const ACTUAL_GREEN = "hsl(142, 71%, 45%)";

const PvForecastWidget = ({ locationId }: PvForecastWidgetProps) => {
  const { forecast, isLoading } = usePvForecast(locationId);
  const { settings } = usePvForecastSettings(locationId);
  const [actualReadings, setActualReadings] = useState<Record<string, number>>({});

  // Fetch actual PV meter readings for today
  // Supports both single-location (settings.pv_meter_id) and all-locations mode
  useEffect(() => {
    if (!forecast) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    (async () => {
      let meterIds: string[] = [];

      if (locationId && settings?.pv_meter_id) {
        // Single location
        meterIds = [settings.pv_meter_id];
      } else if (!locationId) {
        // All locations – fetch all active PV settings with a pv_meter_id
        const { data: allSettings } = await supabase
          .from("pv_forecast_settings")
          .select("pv_meter_id")
          .eq("is_active", true)
          .not("pv_meter_id", "is", null);
        if (allSettings && allSettings.length > 0) {
          meterIds = allSettings.map((s) => s.pv_meter_id!).filter(Boolean);
        }
      }

      if (meterIds.length === 0) return;

      // Fetch readings for all relevant meters
      const { data } = await supabase
        .from("meter_power_readings")
        .select("power_value, recorded_at")
        .in("meter_id", meterIds)
        .gte("recorded_at", todayStart.toISOString())
        .order("recorded_at", { ascending: true });

      if (!data || data.length === 0) return;

      const hourBuckets: Record<string, { sum: number; count: number }> = {};
      for (const r of data) {
        const hour = r.recorded_at.slice(0, 13);
        if (!hourBuckets[hour]) hourBuckets[hour] = { sum: 0, count: 0 };
        hourBuckets[hour].sum += r.power_value;
        hourBuckets[hour].count += 1;
      }
      const result: Record<string, number> = {};
      for (const [hour, b] of Object.entries(hourBuckets)) {
        result[hour] = b.sum / b.count;
      }
      setActualReadings(result);
    })();
  }, [locationId, settings?.pv_meter_id, forecast]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">Keine Prognosedaten verfügbar. Konfigurieren Sie PV-Einstellungen in der Liegenschaft.</p></CardContent>
      </Card>
    );
  }

  const { summary, hourly } = forecast;

  const now = new Date();
  const currentEntry = hourly.find((h) => {
    const t = new Date(h.timestamp);
    return t.getTime() <= now.getTime() && now.getTime() < t.getTime() + 3600000;
  });
  const currentKw = currentEntry ? (currentEntry.ai_adjusted_kwh ?? currentEntry.estimated_kwh) : 0;

  // Compute actual daily total from readings
  const actualTotalKwh = Object.values(actualReadings).reduce((sum, v) => sum + v, 0);
  const hasActualTotal = Object.keys(actualReadings).length > 0;

  const chartData = hourly.map((h) => {
    const hourKey = h.timestamp.slice(0, 13);
    return {
      time: h.timestamp.slice(11, 16),
      prognose: h.ai_adjusted_kwh ?? h.estimated_kwh,
      ist: actualReadings[hourKey] ?? null,
    };
  });

  const hasActual = Object.keys(actualReadings).length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sun className="h-5 w-5 text-amber-500" />
            PV-Prognose
          </CardTitle>
          {summary.ai_confidence && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              KI: {summary.ai_confidence}
            </Badge>
          )}
        </div>
        <CardDescription>{forecast.location.name}{forecast.location.city ? ` · ${forecast.location.city}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Jetzt</p>
            <p className="text-xl font-bold text-amber-600">{currentKw.toFixed(1)} kW</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Heute (Prognose)</p>
            <p className="text-xl font-bold text-amber-600">{summary.today_total_kwh.toFixed(0)} kWh</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Heute (Ist)</p>
            <p className="text-xl font-bold text-emerald-600">{hasActualTotal ? `${actualTotalKwh.toFixed(1)} kWh` : "–"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Morgen</p>
            <p className="text-xl font-bold text-amber-600">{summary.tomorrow_total_kwh.toFixed(0)} kWh</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ left: -10, right: 0 }}>
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={35} />
            <Tooltip
              formatter={(v: number, name: string) => [
                `${v.toFixed(2)} kWh`,
                name === "prognose" ? "Prognose" : "Ist-Erzeugung",
              ]}
              labelFormatter={(l) => `${l} Uhr`}
            />
            {hasActual && <Legend formatter={(v) => v === "prognose" ? "Prognose" : "Ist-Erzeugung"} />}
            <Bar dataKey="prognose" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
            {hasActual && <Bar dataKey="ist" fill={ACTUAL_GREEN} radius={[2, 2, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>

        {summary.ai_notes && (
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <CloudSun className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {summary.ai_notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PvForecastWidget;
