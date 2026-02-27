import { useEffect, useState, useMemo } from "react";
import { usePvForecast, usePvForecastSettings } from "@/hooks/usePvForecast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sun, CloudSun, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardFilter, type TimePeriod } from "@/hooks/useDashboardFilter";
import { useTenant } from "@/hooks/useTenant";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addWeeks, addMonths, addQuarters, addYears } from "date-fns";
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

function getPeriodRange(period: TimePeriod, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  let base: Date;
  let start: Date, end: Date;

  switch (period) {
    case "week": {
      base = addWeeks(now, offset);
      start = startOfWeek(base, { weekStartsOn: 1 });
      end = endOfWeek(base, { weekStartsOn: 1 });
      const label = `KW ${format(start, "w", { locale: de })}, ${format(start, "yyyy")}`;
      return { start, end, label };
    }
    case "month": {
      base = addMonths(now, offset);
      start = startOfMonth(base);
      end = endOfMonth(base);
      return { start, end, label: format(start, "MMMM yyyy", { locale: de }) };
    }
    case "quarter": {
      base = addQuarters(now, offset);
      start = startOfQuarter(base);
      end = endOfQuarter(base);
      const q = Math.ceil((start.getMonth() + 1) / 3);
      return { start, end, label: `Q${q} ${format(start, "yyyy")}` };
    }
    case "year": {
      base = addYears(now, offset);
      start = startOfYear(base);
      end = endOfYear(base);
      return { start, end, label: format(start, "yyyy") };
    }
    default: { // day
      base = addDays(now, offset);
      start = startOfDay(base);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end, label: format(base, "EEEE, d. MMM yyyy", { locale: de }) };
    }
  }
}

const PvForecastWidget = ({ locationId }: PvForecastWidgetProps) => {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const tenantId = tenant?.id ?? null;
  const { forecast, isLoading } = usePvForecast(locationId);
  const { settings } = usePvForecastSettings(locationId);
  const { selectedPeriod, setSelectedPeriod } = useDashboardFilter();
  const [offset, setOffset] = useState(0);
  const [actualReadings, setActualReadings] = useState<Record<string, number>>({});

  // Reset offset when period changes
  useEffect(() => { setOffset(0); }, [selectedPeriod]);

  const { start: rangeStart, end: rangeEnd, label: periodLabel } = useMemo(
    () => getPeriodRange(selectedPeriod, offset),
    [selectedPeriod, offset]
  );

  const refDate = useMemo(() => addDays(new Date(), offset), [offset]);
  const refDateStr = toLocalDateStr(refDate);
  const canGoForward = offset < 0;
  const isDay = selectedPeriod === "day";
  const isToday = offset === 0 && isDay;

  // Fetch archived forecast data from DB for non-day periods or past days
  const fromDateStr = format(rangeStart, "yyyy-MM-dd");
  const toDateStr = format(rangeEnd, "yyyy-MM-dd");
  const needsDbForecast = !isDay || offset < 0;

  const { data: dbForecastDays } = useQuery({
    queryKey: ["pv-forecast-daily-sums", locationId ?? "all", tenantId, fromDateStr, toDateStr],
    queryFn: async () => {
      if (locationId) {
        const { data, error } = await supabase.rpc("get_pv_forecast_daily_sums", {
          p_location_id: locationId,
          p_from_date: fromDateStr,
          p_to_date: toDateStr,
        });
        if (error) { console.error("get_pv_forecast_daily_sums error:", error); return null; }
        return data as { day: string; estimated_kwh: number; ai_adjusted_kwh: number | null }[];
      }
      // All locations
      const { data, error } = await supabase.rpc("get_pv_forecast_daily_sums_all", {
        p_tenant_id: tenantId!,
        p_from_date: fromDateStr,
        p_to_date: toDateStr,
      });
      if (error) { console.error("get_pv_forecast_daily_sums_all error:", error); return null; }
      return data as { day: string; estimated_kwh: number; ai_adjusted_kwh: number | null }[];
    },
    enabled: needsDbForecast && (!!locationId || !!tenantId),
    staleTime: 5 * 60 * 1000,
  });

  // For past days, load hourly archived forecast data from DB
  const { data: dbHourlyData } = useQuery({
    queryKey: ["pv-forecast-hourly-archived", locationId ?? "all", tenantId, refDateStr],
    queryFn: async () => {
      if (!locationId) {
        // Only include locations with active PV settings
        const { data: activeSettings } = await supabase
          .from("pv_forecast_settings")
          .select("location_id")
          .eq("tenant_id", tenantId!)
          .eq("is_active", true);
        if (!activeSettings || activeSettings.length === 0) return null;
        const activeLocationIds = activeSettings.map((s) => s.location_id);

        const { data, error } = await supabase
          .from("pv_forecast_hourly")
          .select("hour_timestamp, estimated_kwh, ai_adjusted_kwh, radiation_w_m2, cloud_cover_pct, location_id")
          .eq("forecast_date", refDateStr)
          .eq("tenant_id", tenantId!)
          .in("location_id", activeLocationIds)
          .order("hour_timestamp", { ascending: true });
        if (error) { console.error("pv_forecast_hourly fetch error:", error); return null; }

        if (data && data.length > 0) {
          const hourMap = new Map<string, { estimated_kwh: number; ai_adjusted_kwh: number | null; radiation_w_m2: number; cloud_cover_pct: number; count: number }>();
          for (const r of data) {
            const existing = hourMap.get(r.hour_timestamp);
            if (existing) {
              existing.estimated_kwh += r.estimated_kwh;
              existing.ai_adjusted_kwh = (existing.ai_adjusted_kwh ?? 0) + (r.ai_adjusted_kwh ?? r.estimated_kwh);
              existing.radiation_w_m2 = Math.max(existing.radiation_w_m2, r.radiation_w_m2);
              existing.cloud_cover_pct = Math.round((existing.cloud_cover_pct * existing.count + r.cloud_cover_pct) / (existing.count + 1));
              existing.count += 1;
            } else {
              hourMap.set(r.hour_timestamp, { estimated_kwh: r.estimated_kwh, ai_adjusted_kwh: r.ai_adjusted_kwh, radiation_w_m2: r.radiation_w_m2, cloud_cover_pct: r.cloud_cover_pct, count: 1 });
            }
          }
          return Array.from(hourMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([ts, v]) => ({ hour_timestamp: ts, estimated_kwh: v.estimated_kwh, ai_adjusted_kwh: v.ai_adjusted_kwh, radiation_w_m2: v.radiation_w_m2, cloud_cover_pct: v.cloud_cover_pct }));
        }
        return data;
      }

      let query = supabase
        .from("pv_forecast_hourly")
        .select("hour_timestamp, estimated_kwh, ai_adjusted_kwh, radiation_w_m2, cloud_cover_pct")
        .eq("forecast_date", refDateStr)
        .eq("location_id", locationId)
        .order("hour_timestamp", { ascending: true });

      const { data, error } = await query;
      if (error) { console.error("pv_forecast_hourly fetch error:", error); return null; }

      return data;
    },
    enabled: isDay && offset < 0 && (!!locationId || !!tenantId),
    staleTime: 10 * 60 * 1000,
  });

  // Fetch actual PV meter readings for selected date (day view only)
  useEffect(() => {
    if (!isDay) { setActualReadings({}); return; }

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
  }, [locationId, settings?.pv_meter_id, isDay, refDateStr]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (!forecast && !needsDbForecast && !isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">Keine Prognosedaten verfügbar. Konfigurieren Sie PV-Einstellungen in der Liegenschaft.</p></CardContent>
      </Card>
    );
  }

  const { summary } = forecast ?? { summary: { ai_confidence: "", ai_notes: "" } };

  // Determine which hourly data to use for the day view
  const liveHourly = forecast?.hourly ?? [];
  const dayHourly = isDay && offset < 0 && dbHourlyData
    ? dbHourlyData.map((h) => ({
        timestamp: h.hour_timestamp,
        estimated_kwh: h.estimated_kwh,
        ai_adjusted_kwh: h.ai_adjusted_kwh,
        radiation_w_m2: h.radiation_w_m2,
        cloud_cover_pct: h.cloud_cover_pct,
      }))
    : liveHourly;

  // Filter hourly data to the selected date (day view)
  const filteredHourly = isDay
    ? dayHourly.filter((h) => toLocalDateStr(new Date(h.timestamp)) === refDateStr)
    : [];

  // For multi-day periods, build bar chart from dbForecastDays
  const multiDayChart = !isDay && dbForecastDays
    ? dbForecastDays.map((d) => ({
        label: format(new Date(d.day + "T00:00"), "d. MMM", { locale: de }),
        prognose: Math.round((d.ai_adjusted_kwh ?? d.estimated_kwh) * 10) / 10,
      }))
    : [];

  const now = new Date();
  const currentEntry = filteredHourly.find((h) => {
    const t = new Date(h.timestamp);
    return t.getTime() <= now.getTime() && now.getTime() < t.getTime() + 3600000;
  });
  const currentKw = currentEntry ? (currentEntry.ai_adjusted_kwh ?? currentEntry.estimated_kwh) : 0;

  // Compute actual daily total from readings
  const actualTotalKwh = Object.values(actualReadings).reduce((sum, v) => sum + v, 0);
  const hasActualTotal = Object.keys(actualReadings).length > 0;

  // Compute forecast total for the selected day
  const forecastDayTotal = isDay
    ? filteredHourly.reduce((sum, h) => sum + (h.ai_adjusted_kwh ?? h.estimated_kwh), 0)
    : multiDayChart.reduce((sum, d) => sum + d.prognose, 0);

  const chartData = isDay
    ? filteredHourly.map((h) => {
        const hourKey = toLocalHourKey(h.timestamp);
        return {
          time: toLocalTime(h.timestamp),
          prognose: h.ai_adjusted_kwh ?? h.estimated_kwh,
          ist: actualReadings[hourKey] ?? null,
        };
      })
    : null;

  const hasActual = Object.keys(actualReadings).length > 0;
  const hasData = isDay ? filteredHourly.length > 0 : multiDayChart.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sun className="h-5 w-5 text-amber-500" />
            PV-Prognose
            <HelpTooltip text={t("tooltip.pvForecastWidget" as any)} />
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
          <CardDescription>{forecast?.location.name ?? ""}{forecast?.location.city ? ` · ${forecast.location.city}` : ""}</CardDescription>
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
            <p className="text-xs text-muted-foreground">{isDay ? (isToday ? "Heute" : format(refDate, "d. MMM", { locale: de })) : PERIOD_LABELS[selectedPeriod]} (Prognose)</p>
            <p className="text-xl font-bold text-amber-600">{forecastDayTotal > 0 ? `${forecastDayTotal.toFixed(0)} kWh` : "–"}</p>
          </div>
          {isDay && (
            <div>
              <p className="text-xs text-muted-foreground">{isToday ? "Heute" : format(refDate, "d. MMM", { locale: de })} (Ist)</p>
              <p className="text-xl font-bold text-emerald-600">{hasActualTotal ? `${actualTotalKwh.toFixed(1)} kWh` : "–"}</p>
            </div>
          )}
        </div>

        {hasData ? (
          isDay && chartData ? (
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
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={multiDayChart} margin={{ left: -10, right: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={35} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)} kWh`, "Prognose"]} />
                <Bar dataKey="prognose" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
        ) : (
          <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
            Keine Prognosedaten für {isDay ? "diesen Tag" : "diesen Zeitraum"}
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
