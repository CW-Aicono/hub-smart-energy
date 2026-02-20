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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";

interface PvForecastSectionProps {
  locationId: string;
}

export function PvForecastSection({ locationId }: PvForecastSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isAdmin } = useUserRole();
  const { settings, isLoading: settingsLoading, upsertSettings } = usePvForecastSettings(locationId);
  const { forecast, isLoading: forecastLoading } = usePvForecast(isOpen ? locationId : null);
  const { meters } = useMeters(locationId);

  const solarMeters = meters.filter((m) => m.energy_type === "solar" || m.energy_type === "pv");

  const [form, setForm] = useState({
    peak_power_kwp: 10,
    tilt_deg: 30,
    azimuth_deg: 180,
    pv_meter_id: "" as string,
    is_active: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        peak_power_kwp: settings.peak_power_kwp,
        tilt_deg: settings.tilt_deg,
        azimuth_deg: settings.azimuth_deg,
        pv_meter_id: settings.pv_meter_id || "",
        is_active: settings.is_active,
      });
    }
  }, [settings]);

  const handleSave = () => {
    upsertSettings.mutate({
      ...form,
      pv_meter_id: form.pv_meter_id || null,
    });
  };

  const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const chartData = forecast?.hourly
    .map((h) => {
      const d = new Date(h.timestamp);
      const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
      return {
        time: h.timestamp.slice(11, 16),
        dayLabel,
        kwh: h.ai_adjusted_kwh ?? h.estimated_kwh,
        cloud: h.cloud_cover_pct,
        radiation: h.radiation_w_m2,
      };
    }) ?? [];

  // Build tick labels: show day header at first hour of each day
  const seenDays = new Set<string>();
  const chartDataWithLabel = chartData.map((d) => {
    if (!seenDays.has(d.dayLabel)) {
      seenDays.add(d.dayLabel);
      return { ...d, xLabel: `${d.dayLabel} ${d.time}` };
    }
    return { ...d, xLabel: d.time };
  });

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
                  PV-Prognose
                </CardTitle>
                <CardDescription>
                  KI-gestützte Solarprognose basierend auf Standortdaten und Wetter
                </CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Settings */}
            {isAdmin && (
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-sm">Anlagen-Einstellungen</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Spitzenleistung (kWp)</Label>
                    <Input type="number" value={form.peak_power_kwp} onChange={(e) => setForm({ ...form, peak_power_kwp: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Neigung (°)</Label>
                    <Input type="number" value={form.tilt_deg} onChange={(e) => setForm({ ...form, tilt_deg: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Ausrichtung (°)</Label>
                    <Input type="number" value={form.azimuth_deg} onChange={(e) => setForm({ ...form, azimuth_deg: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>PV-Zähler</Label>
                    <Select value={form.pv_meter_id || "__none__"} onValueChange={(v) => setForm({ ...form, pv_meter_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Keiner</SelectItem>
                        {solarMeters.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                    <Label>Prognose aktiv</Label>
                  </div>
                  <Button onClick={handleSave} disabled={upsertSettings.isPending} size="sm">
                    <Save className="h-4 w-4 mr-1" />
                    Speichern
                  </Button>
                </div>
              </div>
            )}

            {/* Forecast Chart */}
            {forecastLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : forecast ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Heute gesamt</p>
                    <p className="text-2xl font-bold">{forecast.summary.today_total_kwh.toFixed(0)} kWh</p>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Morgen gesamt</p>
                    <p className="text-2xl font-bold">{forecast.summary.tomorrow_total_kwh.toFixed(0)} kWh</p>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Spitze</p>
                    <p className="text-2xl font-bold">{forecast.summary.peak_kwh.toFixed(1)} kW</p>
                    <p className="text-xs text-muted-foreground">{forecast.summary.peak_hour?.slice(11, 16)} Uhr</p>
                  </div>
                  {forecast.summary.ai_confidence && (
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">KI-Konfidenz</p>
                      <Badge variant="secondary" className="mt-1 gap-1">
                        <Sparkles className="h-3 w-3" />
                        {forecast.summary.ai_confidence}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* 48h Chart */}
                <div>
                  <h4 className="text-sm font-medium mb-2">48-Stunden-Prognose</h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartDataWithLabel} margin={{ left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="xLabel"
                        tick={{ fontSize: 9 }}
                        interval={3}
                        angle={-30}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={35} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                      <Tooltip
                        formatter={(v: number, name: string) => {
                          if (name === "kwh") return [`${v.toFixed(2)} kWh`, "Erzeugung"];
                          return [v, name];
                        }}
                        labelFormatter={(l) => `${l}`}
                      />
                      <Bar dataKey="kwh" radius={[2, 2, 0, 0]} fill="hsl(45, 93%, 47%)" />
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
                Konfigurieren Sie oben die PV-Einstellungen, um eine Prognose zu erhalten.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
