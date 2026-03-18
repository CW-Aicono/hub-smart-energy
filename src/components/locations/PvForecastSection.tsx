import { useState, useEffect } from "react";
import { usePvForecast, usePvForecastSettings } from "@/hooks/usePvForecast";
import { useMeters } from "@/hooks/useMeters";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sun, ChevronDown, ChevronRight, Sparkles, Save } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

const PV_YELLOW = "hsl(var(--energy-strom))";
const ACTUAL_GREEN = "hsl(var(--accent))";
const LEGACY_FORECAST = "hsl(var(--muted-foreground))";

function toLocalHourKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}

function toLocalTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getCorrectedValue(h: any) {
  return h.corrected_ai_adjusted_kwh ?? h.ai_adjusted_kwh ?? h.corrected_estimated_kwh ?? h.estimated_kwh ?? 0;
}

function getLegacyValue(h: any) {
  return h.legacy_ai_adjusted_kwh ?? h.legacy_estimated_kwh ?? h.estimated_kwh ?? 0;
}

function formatDeltaPercent(reference: number | null, actual: number | null) {
  if (!reference || !actual) return null;
  return Math.round((((reference - actual) / actual) * 100) * 10) / 10;
}

interface PvForecastSectionProps {
  locationId: string;
}

export function PvForecastSection({ locationId }: PvForecastSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { isAdmin } = useUserRole();
  const { settings, isLoading: settingsLoading, upsertSettings } = usePvForecastSettings(locationId);
  const { forecast, isLoading: forecastLoading } = usePvForecast(isOpen ? locationId : null);
  const { meters } = useMeters(locationId);
  const [actualReadings, setActualReadings] = useState<Record<string, number>>({});

  const solarMeters = meters.filter((m) => m.meter_function === "generation" || m.energy_type === "solar" || m.energy_type === "pv" || m.energy_type === "strom" && m.meter_function === "generation");

  const [form, setForm] = useState({
    peak_power_kwp: 10,
    tilt_deg: 30,
    azimuth_deg: 180,
    performance_ratio: 0.85,
    pv_meter_id: "" as string,
    is_active: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        peak_power_kwp: settings.peak_power_kwp,
        tilt_deg: settings.tilt_deg,
        azimuth_deg: settings.azimuth_deg,
        performance_ratio: settings.performance_ratio ?? 0.85,
        pv_meter_id: settings.pv_meter_id || "",
        is_active: settings.is_active,
      });
    }
  }, [settings]);

  useEffect(() => {
    if (!settings?.pv_meter_id || !isOpen) return;
    const meterId = settings.pv_meter_id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    (async () => {
      const allData: { power_value: number; recorded_at: string }[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: page } = await supabase
          .from("meter_power_readings")
          .select("power_value, recorded_at")
          .eq("meter_id", meterId)
          .gte("recorded_at", todayStart.toISOString())
          .order("recorded_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        allData.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }

      if (!allData.length) {
        setActualReadings({});
        return;
      }

      allData.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      const hourBuckets: Record<string, number> = {};
      for (let i = 0; i < allData.length; i++) {
        const r = allData[i];
        const hour = toLocalHourKey(r.recorded_at);
        let intervalMin = 5;
        if (i < allData.length - 1) {
          const gap = (new Date(allData[i + 1].recorded_at).getTime() - new Date(r.recorded_at).getTime()) / 60000;
          if (gap > 0 && gap <= 15) intervalMin = gap;
        }
        const energyKwh = r.power_value * (intervalMin / 60);
        hourBuckets[hour] = (hourBuckets[hour] ?? 0) + energyKwh;
      }
      const result: Record<string, number> = {};
      for (const [hour, kwh] of Object.entries(hourBuckets)) result[hour] = Math.round(kwh * 100) / 100;
      setActualReadings(result);
    })();
  }, [settings?.pv_meter_id, isOpen]);

  const handleSave = () => {
    if (form.tilt_deg < 0 || form.tilt_deg > 90) return;
    if (form.azimuth_deg < 0 || form.azimuth_deg > 360) return;
    upsertSettings.mutate({
      ...form,
      pv_meter_id: form.pv_meter_id || null,
    });
  };

  const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const todayLocalStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const tomorrowLocalStr = (() => {
    const n = new Date();
    n.setDate(n.getDate() + 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const chartData = forecast?.hourly
    .map((h) => {
      const d = new Date(h.timestamp);
      const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
      const hourKey = toLocalHourKey(h.timestamp);
      return {
        time: toLocalTime(h.timestamp),
        dayLabel,
        dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        alt: getLegacyValue(h),
        neu: getCorrectedValue(h),
        ist: actualReadings[hourKey] ?? null,
        cloud: h.cloud_cover_pct,
        radiation: h.radiation_w_m2,
        poa: h.poa_w_m2 ?? null,
        dni: h.dni_w_m2 ?? null,
      };
    }) ?? [];

  const weatherSource = forecast?.weather_source ?? null;
  const dwdReference = forecast?.validation?.dwd_reference ?? null;
  const computedTodayLegacyTotal = chartData.filter((d) => d.dateStr === todayLocalStr).reduce((s, d) => s + d.alt, 0);
  const computedTodayCorrectedTotal = chartData.filter((d) => d.dateStr === todayLocalStr).reduce((s, d) => s + d.neu, 0);
  const computedTomorrowCorrectedTotal = chartData.filter((d) => d.dateStr === tomorrowLocalStr).reduce((s, d) => s + d.neu, 0);
  const actualTodayTotal = Object.values(actualReadings).reduce((s, v) => s + v, 0);
  const legacyDelta = formatDeltaPercent(computedTodayLegacyTotal, actualTodayTotal || null);
  const correctedDelta = formatDeltaPercent(computedTodayCorrectedTotal, actualTodayTotal || null);
  const hasActual = Object.keys(actualReadings).length > 0;

  const CustomXTick = ({ x, y, payload }: any) => {
    const entry = chartData[payload?.index];
    if (!entry) return null;
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={9} fill="currentColor">
          {entry.time}
        </text>
        <text x={0} y={0} dy={24} textAnchor="middle" fontSize={9} fill="currentColor" fontWeight={600}>
          {entry.dayLabel}
        </text>
      </g>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left group">
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-energy-strom" />
                  {T("pv.sectionTitle")}
                  <HelpTooltip text={T("tooltip.pvForecast")} />
                </CardTitle>
                <CardDescription>{T("pv.sectionDesc")}</CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {isAdmin && (
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-sm">{T("pv.settings")}</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <Label className="flex items-center gap-1">{T("pv.peakPower")} <HelpTooltip text={T("tooltip.pvPeakPower")} iconSize={12} /></Label>
                    <Input type="number" value={form.peak_power_kwp} onChange={(e) => setForm({ ...form, peak_power_kwp: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">{T("pv.tilt")} <HelpTooltip text={T("tooltip.pvTilt")} iconSize={12} /></Label>
                    <Input type="number" min={0} max={90} value={form.tilt_deg} onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm({ ...form, tilt_deg: Math.min(90, Math.max(0, v)) });
                    }} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">{T("pv.azimuth")} <HelpTooltip text={T("tooltip.pvAzimuth")} iconSize={12} /></Label>
                    <Input type="number" min={0} max={360} value={form.azimuth_deg} onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm({ ...form, azimuth_deg: Math.min(360, Math.max(0, v)) });
                    }} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">{T("pv.meter")} <HelpTooltip text={T("tooltip.pvMeter")} iconSize={12} /></Label>
                    <Select value={form.pv_meter_id || "__none__"} onValueChange={(v) => setForm({ ...form, pv_meter_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{T("pv.none")}</SelectItem>
                        {solarMeters.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">Performance Ratio <HelpTooltip text="Systemwirkungsgrad (0.70–0.95)." iconSize={12} /></Label>
                    <Input type="number" min={0.5} max={1} step={0.01} value={form.performance_ratio} onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm({ ...form, performance_ratio: Math.min(1, Math.max(0.5, v)) });
                    }} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                    <Label>{T("pv.forecastActive")}</Label>
                  </div>
                  <Button onClick={handleSave} disabled={upsertSettings.isPending || settingsLoading} size="sm">
                    <Save className="h-4 w-4 mr-1" />
                    {T("common.save")}
                  </Button>
                </div>
              </div>
            )}

            {forecastLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : forecast && forecast.summary && forecast.hourly ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Alt-Prognose heute</p>
                    <p className="text-2xl font-bold" style={{ color: LEGACY_FORECAST }}>{computedTodayLegacyTotal.toFixed(0)} kWh</p>
                    {legacyDelta != null && <p className="text-xs text-muted-foreground">Δ {legacyDelta > 0 ? "+" : ""}{legacyDelta}%</p>}
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Neue Prognose heute</p>
                    <p className="text-2xl font-bold text-energy-strom">{computedTodayCorrectedTotal.toFixed(0)} kWh</p>
                    {correctedDelta != null && <p className="text-xs text-muted-foreground">Δ {correctedDelta > 0 ? "+" : ""}{correctedDelta}%</p>}
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("pv.actual")}</p>
                    <p className="text-2xl font-bold text-accent">{hasActual ? `${actualTodayTotal.toFixed(1)} kWh` : "–"}</p>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("pv.tomorrowTotal")}</p>
                    <p className="text-2xl font-bold">{computedTomorrowCorrectedTotal.toFixed(0)} kWh</p>
                    {typeof forecast.summary.ai_correction_factor === "number" && <p className="text-xs text-muted-foreground">KI-Faktor {forecast.summary.ai_correction_factor.toFixed(2)}</p>}
                  </div>
                </div>

                {(weatherSource || dwdReference) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {weatherSource && (
                        <>
                          <Badge variant="outline">Quelle: {weatherSource.provider}</Badge>
                          <Badge variant="outline">Modell: {weatherSource.model}</Badge>
                          <Badge variant="outline">TZ: {weatherSource.response_timezone}</Badge>
                        </>
                      )}
                      {dwdReference && <Badge variant="secondary">Bewölkung-Referenz</Badge>}
                      {forecast.summary.pr_auto_updated && <Badge variant="outline">PR auto-aktualisiert</Badge>}
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

                <div>
                  <h4 className="text-sm font-medium mb-2">Alt vs. Neu vs. Ist</h4>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ left: -10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={<CustomXTick />} interval={2} height={55} />
                      <YAxis tick={{ fontSize: 10 }} width={35} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                      <Tooltip
                        formatter={(v: number, name: string) => {
                          if (name === "alt") return [`${v.toFixed(2)} kWh`, "Alt-Prognose"];
                          if (name === "neu") return [`${v.toFixed(2)} kWh`, "Neue Prognose"];
                          if (name === "ist") return [`${v.toFixed(2)} kWh`, T("pv.actualGeneration")];
                          return [v, name];
                        }}
                      />
                      <Legend formatter={(v) => v === "alt" ? "Alt-Prognose" : v === "neu" ? "Neue Prognose" : T("pv.actualGeneration")} />
                      <Bar dataKey="alt" fill={LEGACY_FORECAST} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="neu" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
                      {hasActual && <Bar dataKey="ist" fill={ACTUAL_GREEN} radius={[2, 2, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {forecast.summary.ai_notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-energy-strom" />
                    {forecast.summary.ai_notes}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">{T("pv.configureHint")}</p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
