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

const PV_YELLOW = "hsl(45, 93%, 47%)";
const ACTUAL_GREEN = "hsl(142, 71%, 45%)";

function toLocalHourKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}

function toLocalTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
      const data = allData;

      if (!data || data.length === 0) {
        setActualReadings({});
        return;
      }

      // Convert power readings to energy: estimate interval between readings
      data.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      const hourBuckets: Record<string, number> = {};
      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        const hour = toLocalHourKey(r.recorded_at);
        let intervalMin = 5;
        if (i < data.length - 1) {
          const gap = (new Date(data[i + 1].recorded_at).getTime() - new Date(r.recorded_at).getTime()) / 60000;
          if (gap > 0 && gap <= 15) intervalMin = gap;
        }
        const energyKwh = r.power_value * (intervalMin / 60);
        hourBuckets[hour] = (hourBuckets[hour] ?? 0) + energyKwh;
      }
      const result: Record<string, number> = {};
      for (const [hour, kwh] of Object.entries(hourBuckets)) {
        result[hour] = Math.round(kwh * 100) / 100;
      }
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
  const chartData = forecast?.hourly
    .map((h) => {
      const d = new Date(h.timestamp);
      const hour = d.getHours();
      const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
      const hourKey = toLocalHourKey(h.timestamp);
      return {
        time: toLocalTime(h.timestamp),
        hour,
        dayLabel,
        prognose: h.ai_adjusted_kwh ?? h.estimated_kwh,
        ist: actualReadings[hourKey] ?? null,
        cloud: h.cloud_cover_pct,
        radiation: h.radiation_w_m2,
      };
    }) ?? [];

  const hasActual = Object.keys(actualReadings).length > 0;

  const CustomXTick = ({ x, y, payload }: any) => {
    const entry = chartData[payload?.index];
    if (!entry) return null;
    const showDate = entry.hour === 12;
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={9} fill="currentColor">
          {entry.time}
        </text>
        {showDate && (
          <text x={0} y={0} dy={24} textAnchor="middle" fontSize={9} fill="currentColor" fontWeight={600}>
            {entry.dayLabel}
          </text>
        )}
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
                  <Sun className="h-5 w-5 text-amber-500" />
                  {T("pv.sectionTitle")}
                  <HelpTooltip text={T("tooltip.pvForecast")} />
                </CardTitle>
                <CardDescription>
                  {T("pv.sectionDesc")}
                </CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {isAdmin && (
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-sm">{T("pv.settings")}</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    {(form.tilt_deg < 0 || form.tilt_deg > 90) && (
                      <p className="text-xs text-destructive mt-1">{T("pv.tiltRange")}</p>
                    )}
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">{T("pv.azimuth")} <HelpTooltip text={T("tooltip.pvAzimuth")} iconSize={12} /></Label>
                    <Input type="number" min={0} max={360} value={form.azimuth_deg} onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm({ ...form, azimuth_deg: Math.min(360, Math.max(0, v)) });
                    }} />
                    {(form.azimuth_deg < 0 || form.azimuth_deg > 360) && (
                      <p className="text-xs text-destructive mt-1">{T("pv.azimuthRange")}</p>
                    )}
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
                    <Label className="flex items-center gap-1">Performance Ratio <HelpTooltip text="Systemwirkungsgrad (0.70–0.95). Berücksichtigt Verluste durch Wechselrichter, Kabel, Verschmutzung etc. Standard: 0.85" iconSize={12} /></Label>
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
                  <Button onClick={handleSave} disabled={upsertSettings.isPending} size="sm">
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
                    <p className="text-xs text-muted-foreground">{T("pv.todayTotal")}</p>
                    <p className="text-2xl font-bold">{(forecast.summary.today_total_kwh ?? 0).toFixed(0)} kWh</p>
                    {Object.keys(actualReadings).length > 0 && (
                      <p className="text-sm font-semibold text-emerald-600">
                        {T("pv.actual")}: {Object.values(actualReadings).reduce((s, v) => s + v, 0).toFixed(1)} kWh
                      </p>
                    )}
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("pv.tomorrowTotal")}</p>
                    <p className="text-2xl font-bold">{(forecast.summary.tomorrow_total_kwh ?? 0).toFixed(0)} kWh</p>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("pv.peak")}</p>
                    <p className="text-2xl font-bold">{(forecast.summary.peak_kwh ?? 0).toFixed(1)} kW</p>
                    <p className="text-xs text-muted-foreground">{forecast.summary.peak_hour ? `${toLocalTime(forecast.summary.peak_hour)} ${T("pv.clock")}`.trim() : "–"}</p>
                  </div>
                  {forecast.summary.ai_confidence && (
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">{T("pv.aiConfidence")}</p>
                      <Badge variant="secondary" className="mt-1 gap-1">
                        <Sparkles className="h-3 w-3" />
                        {forecast.summary.ai_confidence}
                      </Badge>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">{T("pv.chartTitle")}{hasActual ? ` ${T("pv.vsActual")}` : ""}</h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} margin={{ left: -10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tick={<CustomXTick />}
                        interval={2}
                        height={55}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={35} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                      <Tooltip
                        formatter={(v: number, name: string) => {
                          if (name === "prognose") return [`${v.toFixed(2)} kWh`, T("pv.forecast")];
                          if (name === "ist") return [`${v.toFixed(2)} kWh`, T("pv.actualGeneration")];
                          return [v, name];
                        }}
                        labelFormatter={(_l: string, payload: any[]) => {
                          const entry = payload?.[0]?.payload;
                          return entry ? `${entry.dayLabel} ${entry.time} ${T("pv.clock")}`.trim() : _l;
                        }}
                      />
                      {hasActual && <Legend formatter={(v) => v === "prognose" ? T("pv.forecast") : T("pv.actualGeneration")} />}
                      <Bar dataKey="prognose" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
                      {hasActual && <Bar dataKey="ist" fill={ACTUAL_GREEN} radius={[2, 2, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {forecast.summary.ai_notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                    {forecast.summary.ai_notes}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {T("pv.configureHint")}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
