import { useState, useEffect } from "react";
import { usePvForecast, usePvForecastSettings } from "@/hooks/usePvForecast";
import { useMeters } from "@/hooks/useMeters";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sun, ChevronDown, ChevronRight, Sparkles, Plus } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { fetchPvActualHourly, toLocalHourKey } from "@/lib/pvActuals";
import { PvArraySettingsCard } from "./PvArraySettingsCard";

const PV_YELLOW = "hsl(var(--energy-strom))";
const ACTUAL_GREEN = "hsl(var(--pv-actual))";

function toLocalTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getDisplayValue(hour: { ai_adjusted_kwh?: number | null; estimated_kwh?: number | null }) {
  return hour.ai_adjusted_kwh != null && hour.ai_adjusted_kwh > 0
    ? hour.ai_adjusted_kwh
    : hour.estimated_kwh ?? 0;
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
  const { settingsList, isLoading: settingsLoading, upsertSettings, deleteSettings } = usePvForecastSettings(locationId);
  const { forecast, isLoading: forecastLoading } = usePvForecast(isOpen ? locationId : null);
  const { meters } = useMeters(locationId);
  const [actualReadings, setActualReadings] = useState<Record<string, number>>({});
  const [actualReadingsEstimated, setActualReadingsEstimated] = useState(false);

  const solarMeters = meters.filter((meter) => meter.meter_function === "generation" || meter.energy_type === "solar" || meter.energy_type === "pv" || meter.energy_type === "strom" && meter.meter_function === "generation");

  // Collect all pv_meter_ids from all arrays
  const allPvMeterIds = settingsList
    .map((s) => s.pv_meter_id)
    .filter((id): id is string => !!id);

  useEffect(() => {
    if (allPvMeterIds.length === 0 || !isOpen) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    (async () => {
      const result = await fetchPvActualHourly({
        meterIds: allPvMeterIds,
        locationId,
        rangeStart: todayStart,
        rangeEnd: todayEnd,
        forecastHours: forecast?.hourly ?? [],
      });

      // PV generation meters: always show absolute values (negative = feed-in)
      const absReadings = Object.fromEntries(
        Object.entries(result.readings).map(([k, v]) => [k, Math.abs(v)])
      );
      setActualReadings(absReadings);
      setActualReadingsEstimated(result.isEstimated);
    })();
  }, [allPvMeterIds.join(","), isOpen, locationId, forecast?.hourly]);

  const handleAddArray = () => {
    upsertSettings.mutate({
      name: `Anlage ${settingsList.length + 1}`,
      peak_power_kwp: 10,
      tilt_deg: 30,
      azimuth_deg: 180,
      performance_ratio: 0.8,
      pv_meter_id: null,
      is_active: true,
    });
  };

  const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const todayLocalStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();
  const tomorrowLocalStr = (() => {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const chartData = forecast?.hourly.map((hour) => {
    const date = new Date(hour.timestamp);
    const hourKey = toLocalHourKey(hour.timestamp);
    return {
      time: toLocalTime(hour.timestamp),
      dayLabel: `${dayNames[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`,
      dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      forecast: getDisplayValue(hour),
      actual: actualReadings[hourKey] ?? null,
      cloud: hour.cloud_cover_pct,
      radiation: hour.radiation_w_m2,
      poa: hour.poa_w_m2 ?? null,
      dhi: hour.dhi_w_m2 ?? null,
      moduleTemp: hour.cell_temp_c ?? null,
      ambientTemp: hour.temperature_2m ?? null,
    };
  }) ?? [];

  const weatherSource = forecast?.weather_source ?? null;
  const dwdReference = forecast?.validation?.dwd_reference ?? null;
  const computedTodayTotal = chartData.filter((entry) => entry.dateStr === todayLocalStr).reduce((sum, entry) => sum + entry.forecast, 0);
  const computedTomorrowTotal = chartData.filter((entry) => entry.dateStr === tomorrowLocalStr).reduce((sum, entry) => sum + entry.forecast, 0);
  const actualTodayTotal = Object.values(actualReadings).reduce((sum, value) => sum + value, 0);
  const delta = formatDeltaPercent(computedTodayTotal, actualTodayTotal || null);
  const hasActual = Object.keys(actualReadings).length > 0;
  const actualSeriesLabel = actualReadingsEstimated ? T("pv.actualGenerationEstimated") : T("pv.actualGeneration");

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
                  {settingsList.length > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      {settingsList.length} {T("pv.arrays")}
                    </Badge>
                  )}
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">{T("pv.settings")}</h4>
                  <Button variant="outline" size="sm" onClick={handleAddArray} disabled={upsertSettings.isPending}>
                    <Plus className="h-4 w-4 mr-1" />
                    {T("pv.addArray")}
                  </Button>
                </div>

                {settingsList.map((arraySettings, idx) => (
                  <PvArraySettingsCard
                    key={arraySettings.id}
                    initial={arraySettings}
                    solarMeters={solarMeters}
                    index={idx}
                    saving={upsertSettings.isPending}
                    onSave={(values) => upsertSettings.mutate(values)}
                    onDelete={settingsList.length > 1 ? () => deleteSettings.mutate(arraySettings.id) : undefined}
                  />
                ))}

                {settingsList.length === 0 && !settingsLoading && (
                  <p className="text-sm text-muted-foreground text-center py-4">{T("pv.noArraysYet")}</p>
                )}
              </div>
            )}

            {forecastLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : forecast && forecast.summary && forecast.hourly ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("dashboard.pvForecast")}</p>
                    <p className="text-2xl font-bold text-energy-strom">{computedTodayTotal.toFixed(0)} kWh</p>
                    {delta != null && <p className="text-xs text-muted-foreground">Δ {delta > 0 ? "+" : ""}{delta}%</p>}
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("pv.actual")}</p>
                    <p className="text-2xl font-bold text-pv-actual">{hasActual ? `${actualTodayTotal.toFixed(1)} kWh` : "–"}</p>
                    {actualReadingsEstimated && hasActual && <p className="text-xs text-muted-foreground">{T("pv.estimatedFromDailyTotal")}</p>}
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{T("pv.tomorrowTotal")}</p>
                    <p className="text-2xl font-bold">{computedTomorrowTotal.toFixed(0)} kWh</p>
                    {typeof forecast.summary.ai_correction_factor === "number" && <p className="text-xs text-muted-foreground">KI-Faktor {forecast.summary.ai_correction_factor.toFixed(2)}</p>}
                  </div>
                </div>

                {/* Array badges */}
                {forecast.arrays && forecast.arrays.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {forecast.arrays.map((arr, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {arr.name} · {arr.peak_power_kwp} kWp · {arr.azimuth_deg}°
                      </Badge>
                    ))}
                  </div>
                )}

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
                  <h4 className="text-sm font-medium mb-2">{T("dashboard.pvForecast")} vs. {T("pv.actual")}</h4>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ left: -10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={<CustomXTick />} interval={2} height={55} />
                      <YAxis tick={{ fontSize: 10 }} width={35} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === "forecast") return [`${value.toFixed(2)} kWh`, T("dashboard.pvForecast")];
                          if (name === "actual") return [`${value.toFixed(2)} kWh`, actualSeriesLabel];
                          return [value, name];
                        }}
                      />
                      <Legend formatter={(value) => value === "forecast" ? T("dashboard.pvForecast") : actualSeriesLabel} />
                      <Bar dataKey="forecast" fill={PV_YELLOW} radius={[2, 2, 0, 0]} />
                      {hasActual && <Bar dataKey="actual" fill={ACTUAL_GREEN} radius={[2, 2, 0, 0]} />}
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
