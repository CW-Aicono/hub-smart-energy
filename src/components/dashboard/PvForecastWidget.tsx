import { useEffect, useState, useMemo } from "react";
import { usePvForecast, usePvForecastSettings } from "@/hooks/usePvForecast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sun, CloudSun, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardFilter, type TimePeriod } from "@/hooks/useDashboardFilter";
import { format, addDays, startOfDay } from "date-fns";
import { de } from "date-fns/locale";

interface PvForecastWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const PV_YELLOW = "hsl(45, 93%, 47%)";
const ACTUAL_GREEN = "hsl(142, 71%, 45%)";

/** Convert a UTC ISO timestamp to a local-hour key like "2026-02-22T16" */
function toLocalHourKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}

/** Convert a UTC ISO timestamp to "HH:MM" in local time */
function toLocalTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Get local date string YYYY-MM-DD from a Date */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PERIOD_LABELS: Record<string, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
};

const PvForecastWidget = ({ locationId }: PvForecastWidgetProps) => {
  const { forecast, isLoading } = usePvForecast(locationId);
  const { settings } = usePvForecastSettings(locationId);
  const { selectedPeriod, setSelectedPeriod } = useDashboardFilter();
  const [offset, setOffset] = useState(0);
  const [actualReadings, setActualReadings] = useState<Record<string, number>>({});

  // Reset offset when period changes
  useEffect(() => { setOffset(0); }, [selectedPeriod]);

  const refDate = useMemo(() => addDays(new Date(), offset), [offset]);
  const refDateStr = toLocalDateStr(refDate);
  const periodLabel = format(refDate, "EEEE, d. MMM yyyy", { locale: de });
  const canGoForward = offset < 0;

  // Fetch actual PV meter readings for selected date
  useEffect(() => {
    if (!forecast) return;

    const dayStart = startOfDay(refDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    (async () => {
      let meterIds: string[] = [];

      if (locationId && settings?.pv_meter_id) {
        meterIds = [settings.pv_meter_id];
      } else if (!locationId) {
        const { data: allSettings } = await supabase
          .from("pv_forecast_settings")
          .select("pv_meter_id")
          .eq("is_active", true)
          .not("pv_meter_id", "is", null);
        if (allSettings && allSettings.length > 0) {
          meterIds = allSettings.map((s) => s.pv_meter_id!).filter(Boolean);
        }
      }

      if (meterIds.length === 0) { setActualReadings({}); return; }

      const allData: { power_value: number; recorded_at: string }[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: page } = await supabase
          .from("meter_power_readings")
          .select("power_value, recorded_at")
          .in("meter_id", meterIds)
          .gte("recorded_at", dayStart.toISOString())
          .lt("recorded_at", dayEnd.toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        allData.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }

      if (allData.length === 0) { setActualReadings({}); return; }

      const hourBuckets: Record<string, { sum: number; count: number }> = {};
      for (const r of allData) {
        const hour = toLocalHourKey(r.recorded_at);
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
  }, [locationId, settings?.pv_meter_id, forecast, refDateStr]);

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

  // Filter hourly data to the selected date
  const filteredHourly = hourly.filter((h) => {
    const d = new Date(h.timestamp);
    return toLocalDateStr(d) === refDateStr;
  });

  const now = new Date();
  const currentEntry = filteredHourly.find((h) => {
    const t = new Date(h.timestamp);
    return t.getTime() <= now.getTime() && now.getTime() < t.getTime() + 3600000;
  });
  const currentKw = currentEntry ? (currentEntry.ai_adjusted_kwh ?? currentEntry.estimated_kwh) : 0;
  const isToday = offset === 0;

  // Compute actual daily total from readings
  const actualTotalKwh = Object.values(actualReadings).reduce((sum, v) => sum + v, 0);
  const hasActualTotal = Object.keys(actualReadings).length > 0;

  // Compute forecast total for the selected day
  const forecastDayTotal = filteredHourly.reduce((sum, h) => sum + (h.ai_adjusted_kwh ?? h.estimated_kwh), 0);

  const chartData = filteredHourly.map((h) => {
    const hourKey = toLocalHourKey(h.timestamp);
    return {
      time: toLocalTime(h.timestamp),
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
          <div className="flex items-center gap-2">
            {summary.ai_confidence && isToday && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                KI: {summary.ai_confidence}
              </Badge>
            )}
            <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as TimePeriod)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((key) => (
                  <SelectItem key={key} value={key}>{PERIOD_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <CardDescription>{forecast.location.name}{forecast.location.city ? ` · ${forecast.location.city}` : ""}</CardDescription>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[180px] text-center">{periodLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoForward} onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          {isToday && (
            <div>
              <p className="text-xs text-muted-foreground">Jetzt</p>
              <p className="text-xl font-bold text-amber-600">{currentKw.toFixed(1)} kW</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{isToday ? "Heute" : format(refDate, "d. MMM", { locale: de })} (Prognose)</p>
            <p className="text-xl font-bold text-amber-600">{forecastDayTotal > 0 ? `${forecastDayTotal.toFixed(0)} kWh` : "–"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{isToday ? "Heute" : format(refDate, "d. MMM", { locale: de })} (Ist)</p>
            <p className="text-xl font-bold text-emerald-600">{hasActualTotal ? `${actualTotalKwh.toFixed(1)} kWh` : "–"}</p>
          </div>
        </div>

        {filteredHourly.length > 0 ? (
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
        ) : (
          <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
            Keine Prognosedaten für diesen Tag
          </div>
        )}

        {summary.ai_notes && isToday && (
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
