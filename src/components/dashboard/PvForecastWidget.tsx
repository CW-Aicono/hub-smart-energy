import { useEffect, useState, useMemo } from "react";
import { usePvForecast, usePvForecastSettings, type PvHourlyEntry } from "@/hooks/usePvForecast";
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
import { formatEnergy } from "@/lib/formatEnergy";
import { useDashboardFilter, type TimePeriod } from "@/hooks/useDashboardFilter";
import { useTenant } from "@/hooks/useTenant";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addWeeks, addMonths, addQuarters, addYears } from "date-fns";
import { de, enUS, es, nl } from "date-fns/locale";
import type { Locale } from "date-fns";

const dfLocaleMap: Record<string, Locale> = { de, en: enUS, es, nl };

interface PvForecastWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const PV_YELLOW = "hsl(var(--energy-strom))";
const ACTUAL_GREEN = "hsl(var(--accent))";

function toLocalHourKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}

function toLocalTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDisplayValue(hour: Partial<PvHourlyEntry>) {
  return hour.ai_adjusted_kwh != null && hour.ai_adjusted_kwh > 0
    ? hour.ai_adjusted_kwh
    : hour.estimated_kwh ?? 0;
}

function formatDeltaPercent(reference: number | null, actual: number | null) {
  if (!reference || !actual) return null;
  return Math.round((((reference - actual) / actual) * 100) * 10) / 10;
}

const PERIOD_LABEL_KEYS: Record<string, string> = {
  day: "chart.periodDay",
  week: "chart.periodWeek",
  month: "chart.periodMonth",
  quarter: "chart.periodQuarter",
  year: "chart.periodYear",
};

function getPeriodRange(period: TimePeriod, offset: number, locale: Locale, cwPrefix: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let base: Date;
  let start: Date;
  let end: Date;

  switch (period) {
    case "week": {
      base = addWeeks(now, offset);
      start = startOfWeek(base, { weekStartsOn: 1 });
      end = endOfWeek(base, { weekStartsOn: 1 });
      const label = `${cwPrefix} ${format(start, "w", { locale })}, ${format(start, "yyyy")}`;
      return { start, end, label };
    }
    case "month": {
      base = addMonths(now, offset);
      start = startOfMonth(base);
      end = endOfMonth(base);
      return { start, end, label: format(start, "MMMM yyyy", { locale }) };
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
    default: {
      base = addDays(now, offset);
      start = startOfDay(base);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end, label: format(base, "EEEE, d. MMM yyyy", { locale }) };
    }
  }
}

const PvForecastWidget = ({ locationId }: PvForecastWidgetProps) => {
  const { tenant } = useTenant();
  const { t, language } = useTranslation();
  const T = (key: string) => t(key as any);
  const dateLocale = dfLocaleMap[language] || de;
  const cwPrefix = T("chart.cwPrefix");
  const tenantId = tenant?.id ?? null;
  const { forecast, isLoading } = usePvForecast(locationId);
  const { settings } = usePvForecastSettings(locationId);
  const { selectedPeriod, setSelectedPeriod } = useDashboardFilter();
  const [offset, setOffset] = useState(0);
  const [actualReadings, setActualReadings] = useState<Record<string, number>>({});
  const [multiDayActuals, setMultiDayActuals] = useState<Record<string, number>>({});

  useEffect(() => {
    setOffset(0);
  }, [selectedPeriod]);

  const { start: rangeStart, end: rangeEnd, label: periodLabel } = useMemo(
    () => getPeriodRange(selectedPeriod, offset, dateLocale, cwPrefix),
    [selectedPeriod, offset, dateLocale, cwPrefix]
  );

  const refDate = useMemo(() => addDays(new Date(), offset), [offset]);
  const refDateStr = toLocalDateStr(refDate);
  const canGoForward = offset < 0;
  const isDay = selectedPeriod === "day";
  const isToday = offset === 0 && isDay;
  const fromDateStr = format(rangeStart, "yyyy-MM-dd");
  const toDateStr = format(rangeEnd, "yyyy-MM-dd");
  const needsDbForecast = !isDay || offset < 0;

  const { data: dbForecastDays } = useQuery({
    queryKey: ["pv-forecast-daily-sums", locationId ?? "all", tenantId, fromDateStr, toDateStr],
    queryFn: async () => {
      const api = supabase as any;
      if (locationId) {
        const { data, error } = await api.rpc("get_pv_forecast_daily_sums", {
          p_location_id: locationId,
          p_from_date: fromDateStr,
          p_to_date: toDateStr,
        });
        if (error) {
          console.error("get_pv_forecast_daily_sums error:", error);
          return null;
        }
        return data as any[];
      }

      const { data, error } = await api.rpc("get_pv_forecast_daily_sums_all", {
        p_tenant_id: tenantId,
        p_from_date: fromDateStr,
        p_to_date: toDateStr,
      });
      if (error) {
        console.error("get_pv_forecast_daily_sums_all error:", error);
        return null;
      }
      return data as any[];
    },
    enabled: needsDbForecast && (!!locationId || !!tenantId),
    staleTime: 5 * 60 * 1000,
  });

  const { data: dbHourlyData } = useQuery({
    queryKey: ["pv-forecast-hourly-archived", locationId ?? "all", tenantId, refDateStr],
    queryFn: async () => {
      const table = supabase.from("pv_forecast_hourly") as any;
      const selectClause = "hour_timestamp, estimated_kwh, ai_adjusted_kwh, radiation_w_m2, cloud_cover_pct, poa_w_m2, dni_w_m2, dhi_w_m2, cell_temp_c, temperature_2m, location_id";

      if (!locationId) {
        const { data: activeSettings } = await supabase
          .from("pv_forecast_settings")
          .select("location_id")
          .eq("tenant_id", tenantId!)
          .eq("is_active", true);
        if (!activeSettings || activeSettings.length === 0) return null;

        const activeLocationIds = activeSettings.map((setting) => setting.location_id);
        const { data, error } = await table
          .select(selectClause)
          .eq("forecast_date", refDateStr)
          .eq("tenant_id", tenantId!)
          .in("location_id", activeLocationIds)
          .order("hour_timestamp", { ascending: true });
        if (error) {
          console.error("pv_forecast_hourly fetch error:", error);
          return null;
        }

        if (!data || data.length === 0) return data;

        const hourMap = new Map<string, any>();
        for (const row of data) {
          const existing = hourMap.get(row.hour_timestamp);
          if (existing) {
            existing.estimated_kwh += row.estimated_kwh ?? 0;
            existing.ai_adjusted_kwh = (existing.ai_adjusted_kwh ?? 0) + (row.ai_adjusted_kwh ?? 0);
            existing.radiation_w_m2 = Math.max(existing.radiation_w_m2 ?? 0, row.radiation_w_m2 ?? 0);
            existing.cloud_cover_pct = Math.round((existing.cloud_cover_pct * existing.count + (row.cloud_cover_pct ?? 0)) / (existing.count + 1));
            existing.poa_w_m2 = Math.max(existing.poa_w_m2 ?? 0, row.poa_w_m2 ?? 0);
            existing.dni_w_m2 = Math.max(existing.dni_w_m2 ?? 0, row.dni_w_m2 ?? 0);
            existing.dhi_w_m2 = Math.max(existing.dhi_w_m2 ?? 0, row.dhi_w_m2 ?? 0);
            existing.cell_temp_c = Math.round((((existing.cell_temp_c ?? 0) * existing.count) + (row.cell_temp_c ?? 0)) / (existing.count + 1) * 10) / 10;
            existing.temperature_2m = Math.round((((existing.temperature_2m ?? 0) * existing.count) + (row.temperature_2m ?? 0)) / (existing.count + 1) * 10) / 10;
            existing.count += 1;
          } else {
            hourMap.set(row.hour_timestamp, {
              ...row,
              count: 1,
            });
          }
        }

        return Array.from(hourMap.values()).sort((a, b) => a.hour_timestamp.localeCompare(b.hour_timestamp));
      }

      const { data, error } = await table
        .select(selectClause)
        .eq("forecast_date", refDateStr)
        .eq("location_id", locationId)
        .order("hour_timestamp", { ascending: true });
      if (error) {
        console.error("pv_forecast_hourly fetch error:", error);
        return null;
      }
      return data;
    },
    enabled: isDay && offset < 0 && (!!locationId || !!tenantId),
    staleTime: 10 * 60 * 1000,
  });

  const resolvePvMeterIds = async (): Promise<string[]> => {
    if (locationId && settings?.pv_meter_id) return [settings.pv_meter_id];
    if (!locationId) {
      const { data: allSettings } = await supabase
        .from("pv_forecast_settings")
        .select("pv_meter_id")
        .eq("is_active", true)
        .not("pv_meter_id", "is", null);
      if (allSettings && allSettings.length > 0) {
        return allSettings.map((setting) => setting.pv_meter_id!).filter(Boolean);
      }
    }
    return [];
  };

  useEffect(() => {
    if (!isDay) {
      setActualReadings({});
      return;
    }

    const dayStart = startOfDay(refDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    (async () => {
      const meterIds = await resolvePvMeterIds();
      if (meterIds.length === 0) {
        setActualReadings({});
        return;
      }

      const allData: { power_value: number; recorded_at: string }[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data: page } = await supabase
          .from("meter_power_readings")
          .select("power_value, recorded_at")
          .in("meter_id", meterIds)
          .gte("recorded_at", dayStart.toISOString())
          .lt("recorded_at", dayEnd.toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (!page || page.length === 0) break;
        allData.push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
      }

      if (allData.length === 0) {
        setActualReadings({});
        return;
      }

      allData.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      const hourBuckets: Record<string, number> = {};
      for (let index = 0; index < allData.length; index += 1) {
        const reading = allData[index];
        const hour = toLocalHourKey(reading.recorded_at);
        let intervalMin = 5;
        if (index < allData.length - 1) {
          const gap = (new Date(allData[index + 1].recorded_at).getTime() - new Date(reading.recorded_at).getTime()) / 60000;
          if (gap > 0 && gap <= 15) intervalMin = gap;
        }
        const energyKwh = reading.power_value * (intervalMin / 60);
        hourBuckets[hour] = (hourBuckets[hour] ?? 0) + energyKwh;
      }

      const result: Record<string, number> = {};
      for (const [hour, kwh] of Object.entries(hourBuckets)) result[hour] = Math.round(kwh * 100) / 100;
      setActualReadings(result);
    })();
  }, [locationId, settings?.pv_meter_id, isDay, refDateStr]);

  useEffect(() => {
    if (isDay) {
      setMultiDayActuals({});
      return;
    }

    (async () => {
      const meterIds = await resolvePvMeterIds();
      if (meterIds.length === 0) {
        setMultiDayActuals({});
        return;
      }

      const dayMap: Record<string, number> = {};
      const { data, error } = await supabase.rpc("get_meter_daily_totals", {
        p_meter_ids: meterIds,
        p_from_date: fromDateStr,
        p_to_date: toDateStr,
      });
      if (!error && data) {
        for (const row of data) {
          const dayKey = String(row.day);
          dayMap[dayKey] = (dayMap[dayKey] ?? 0) + (row.total_value ?? 0);
        }
      }

      const todayStr = toLocalDateStr(new Date());
      if (todayStr >= fromDateStr && todayStr <= toDateStr && !dayMap[todayStr]) {
        const dayStart = startOfDay(new Date());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const allData: { power_value: number; recorded_at: string }[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data: page } = await supabase
            .from("meter_power_readings")
            .select("power_value, recorded_at")
            .in("meter_id", meterIds)
            .gte("recorded_at", dayStart.toISOString())
            .lt("recorded_at", dayEnd.toISOString())
            .order("recorded_at", { ascending: true })
            .range(from, from + pageSize - 1);
          if (!page || page.length === 0) break;
          allData.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }

        if (allData.length > 0) {
          allData.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
          let totalKwh = 0;
          for (let index = 0; index < allData.length; index += 1) {
            let intervalMin = 5;
            if (index < allData.length - 1) {
              const gap = (new Date(allData[index + 1].recorded_at).getTime() - new Date(allData[index].recorded_at).getTime()) / 60000;
              if (gap > 0 && gap <= 15) intervalMin = gap;
            }
            totalKwh += allData[index].power_value * (intervalMin / 60);
          }
          dayMap[todayStr] = Math.round(totalKwh * 10) / 10;
        }
      }

      setMultiDayActuals(dayMap);
    })();
  }, [locationId, settings?.pv_meter_id, isDay, fromDateStr, toDateStr]);

  const { data: realtimePowerKw } = useQuery({
    queryKey: ["current-pv-power", locationId ?? "all", settings?.pv_meter_id],
    queryFn: async () => {
      const meterIds = await resolvePvMeterIds();
      if (meterIds.length === 0) return 0;

      let totalKw = 0;
      for (const meterId of meterIds) {
        const { data } = await supabase
          .from("meter_power_readings")
          .select("power_value")
          .eq("meter_id", meterId)
          .order("recorded_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0) totalKw += Math.abs(data[0].power_value);
      }
      return totalKw;
    },
    enabled: isToday,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-energy-strom" />{T("dashboard.pvForecast")}</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (!forecast && !needsDbForecast && !isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-energy-strom" />{T("dashboard.pvForecast")}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">{T("pv.noDataAvailable")}</p></CardContent>
      </Card>
    );
  }

  const summary = forecast?.summary ?? {
    today_total_kwh: 0,
    tomorrow_total_kwh: 0,
    peak_hour: null,
    peak_kwh: 0,
    ai_confidence: "",
    ai_notes: "",
    ai_correction_factor: undefined,
  };
  const weatherSource = forecast?.weather_source ?? null;
  const dwdReference = forecast?.validation?.dwd_reference ?? null;

  const liveHourly = forecast?.hourly ?? [];
  const dayHourly = isDay && offset < 0 && dbHourlyData
    ? dbHourlyData.map((hour: any) => ({
        timestamp: hour.hour_timestamp,
        estimated_kwh: hour.estimated_kwh,
        ai_adjusted_kwh: hour.ai_adjusted_kwh,
        radiation_w_m2: hour.radiation_w_m2,
        cloud_cover_pct: hour.cloud_cover_pct,
        poa_w_m2: hour.poa_w_m2,
        dni_w_m2: hour.dni_w_m2,
        dhi_w_m2: hour.dhi_w_m2,
        cell_temp_c: hour.cell_temp_c,
        temperature_2m: hour.temperature_2m,
      }))
    : liveHourly;

  const filteredHourly = isDay ? dayHourly.filter((hour) => toLocalDateStr(new Date(hour.timestamp)) === refDateStr) : [];
  const hasMultiDayActuals = Object.keys(multiDayActuals).length > 0;

  const multiDayChart = !isDay && dbForecastDays
    ? dbForecastDays.map((day: any) => ({
        label: format(new Date(`${day.day}T00:00`), "d. MMM", { locale: dateLocale }),
        forecast: Math.round((day.ai_adjusted_kwh && day.ai_adjusted_kwh > 0 ? day.ai_adjusted_kwh : day.estimated_kwh ?? 0) * 10) / 10,
        actual: multiDayActuals[day.day] != null ? Math.round(multiDayActuals[day.day] * 10) / 10 : null,
      }))
    : [];

  const currentKw = realtimePowerKw ?? 0;
  const actualTotalKwh = isDay
    ? Object.values(actualReadings).reduce((sum, value) => sum + value, 0)
    : Object.values(multiDayActuals).reduce((sum, value) => sum + value, 0);
  const hasActualTotal = isDay ? Object.keys(actualReadings).length > 0 : hasMultiDayActuals;
  const forecastDayTotal = isDay
    ? filteredHourly.reduce((sum, hour) => sum + getDisplayValue(hour), 0)
    : multiDayChart.reduce((sum, day) => sum + day.forecast, 0);

  const chartData = isDay
    ? filteredHourly.map((hour) => {
        const hourKey = toLocalHourKey(hour.timestamp);
        return {
          time: toLocalTime(hour.timestamp),
          forecast: Math.round(getDisplayValue(hour) * 100) / 100,
          actual: actualReadings[hourKey] ?? null,
        };
      })
    : null;

  const hasActual = isDay ? Object.keys(actualReadings).length > 0 : hasMultiDayActuals;
  const hasData = isDay ? filteredHourly.length > 0 : multiDayChart.length > 0;
  const delta = formatDeltaPercent(forecastDayTotal, hasActualTotal ? actualTotalKwh : null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sun className="h-5 w-5 text-energy-strom" />
            {T("dashboard.pvForecast")}
            <HelpTooltip text={T("tooltip.pvForecastWidget")} />
          </CardTitle>
          <div className="flex items-center gap-2">
            {summary.ai_confidence && isToday && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                {T("pv.ai")}: {summary.ai_confidence}
              </Badge>
            )}
            <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as TimePeriod)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL_KEYS) as TimePeriod[]).map((key) => (
                  <SelectItem key={key} value={key}>{T(PERIOD_LABEL_KEYS[key])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <CardDescription>{forecast?.location.name ?? ""}{forecast?.location.city ? ` · ${forecast.location.city}` : ""}</CardDescription>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((value) => value - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[180px] text-center">{periodLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoForward} onClick={() => setOffset((value) => value + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`grid ${isToday ? "grid-cols-3" : "grid-cols-2"} gap-3 text-center`}>
          {isToday && (
            <div>
              <p className="text-xs text-muted-foreground">{T("pv.now")}</p>
              <p className="text-xl font-bold text-energy-strom">{formatEnergy(currentKw * 1000, "W")}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{T("dashboard.pvForecast")}</p>
            <p className="text-xl font-bold text-energy-strom">{forecastDayTotal > 0 ? `${forecastDayTotal.toFixed(0)} kWh` : "–"}</p>
            {delta != null && <p className="text-xs text-muted-foreground">Δ {delta > 0 ? "+" : ""}{delta}%</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{isDay ? (isToday ? T("pv.todayActual") : T("pv.dateActual").replace("{date}", format(refDate, "d. MMM", { locale: dateLocale }))) : T("pv.periodActual").replace("{period}", T(PERIOD_LABEL_KEYS[selectedPeriod]))}</p>
            <p className="text-xl font-bold text-accent">{hasActualTotal ? `${actualTotalKwh.toFixed(1)} kWh` : "–"}</p>
          </div>
        </div>

        {isToday && (weatherSource || dwdReference) && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {weatherSource && (
                <>
                  <Badge variant="outline">Quelle: {weatherSource.provider}</Badge>
                  <Badge variant="outline">Modell: {weatherSource.model}</Badge>
                  <Badge variant="outline">TZ: {weatherSource.response_timezone}</Badge>
                </>
              )}
              {typeof summary.ai_correction_factor === "number" && summary.ai_correction_factor !== 1 && (
                <Badge variant="outline">KI-Faktor: {summary.ai_correction_factor.toFixed(2)}</Badge>
              )}
              {dwdReference && <Badge variant="secondary">Bewölkung-Referenz</Badge>}
            </div>

            {weatherSource && (
              <p className="text-xs text-muted-foreground">
                {weatherSource.profile} · {weatherSource.requested_coordinates.latitude.toFixed(4)}, {weatherSource.requested_coordinates.longitude.toFixed(4)} · {weatherSource.hourly_variables.join(", ")}
              </p>
            )}

            {dwdReference?.hourly_cloud_cover_today?.length ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">DWD-Bewölkung (nur Referenz)</p>
                <div className="flex flex-wrap gap-1">
                  {dwdReference.hourly_cloud_cover_today.map((entry) => (
                    <span key={entry.timestamp} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground">
                      {entry.timestamp.split("T")[1]?.slice(0, 5)} {entry.cloud_cover_pct}%
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {hasData ? (
          isDay && chartData ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ left: -10, right: 0 }}>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={35} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(2)} kWh`,
                    name === "forecast" ? T("dashboard.pvForecast") : T("pv.actualGeneration"),
                  ]}
                />
                <Legend formatter={(value) => value === "forecast" ? T("dashboard.pvForecast") : T("pv.actualGeneration")} />
                <Bar dataKey="forecast" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
                {hasActual && <Bar dataKey="actual" fill={ACTUAL_GREEN} radius={[2, 2, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={multiDayChart} margin={{ left: -10, right: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={35} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(1)} kWh`,
                    name === "forecast" ? T("dashboard.pvForecast") : T("pv.actualGeneration"),
                  ]}
                />
                <Legend formatter={(value) => value === "forecast" ? T("dashboard.pvForecast") : T("pv.actualGeneration")} />
                <Bar dataKey="forecast" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
                {hasMultiDayActuals && <Bar dataKey="actual" fill={ACTUAL_GREEN} radius={[2, 2, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          )
        ) : (
          <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
            {isDay ? T("pv.noForecastDay") : T("pv.noForecastPeriod")}
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
