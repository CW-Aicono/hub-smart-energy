import { useMemo, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { useMeters } from "@/hooks/useMeters";
import { useLoxoneSensorsMulti } from "@/hooks/useLoxoneSensors";
import { useLocationEnergySources } from "@/hooks/useLocationEnergySources";
import { ENERGY_TYPE_LABELS, ENERGY_HEX_COLORS } from "@/lib/energyTypeColors";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";
import AnalogGauge, { type GaugeData } from "./AnalogGauge";

interface EnergyGaugeWidgetProps {
  locationId: string | null;
}

function getPowerUnit(energyType: string): string {
  return energyType === "wasser" || energyType === "gas" ? "m³/h" : "kW";
}

function autoScale(value: number, peak: number): number {
  const ref = Math.max(value, peak, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(ref)));
  const normalized = ref / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function computeEcoScore(gaugeData: GaugeData[]): number {
  const energyGauges = gaugeData.filter((g) => !g.hidePeak);
  if (energyGauges.length === 0) return 100;
  let totalRatio = 0;
  let count = 0;
  for (const g of energyGauges) {
    const ref = Math.max(g.peakValue, g.maxScale * 0.5, 1);
    const ratio = Math.min(g.currentValue / ref, 1);
    totalRatio += ratio;
    count++;
  }
  const avgRatio = totalRatio / count;
  return Math.round((1 - avgRatio) * 100);
}

const EnergyGaugeWidget = ({ locationId }: EnergyGaugeWidgetProps) => {
  const { meters } = useMeters();
  const { t } = useTranslation();
  const allowedTypes = useLocationEnergySources(locationId);
  const [dailyPeaks, setDailyPeaks] = useState<Record<string, number>>({});
  const [peakResetAt, setPeakResetAt] = useState<string | null>(null);

  const activeMeters = useMemo(() => {
    return meters.filter(
      (m) =>
        !m.is_archived &&
        m.capture_type === "automatic" &&
        m.is_main_meter &&
        m.sensor_uuid &&
        m.location_integration_id &&
        (!locationId || m.location_id === locationId)
    );
  }, [meters, locationId]);

  const integrationIds = useMemo(() => {
    const ids = new Set<string>();
    activeMeters.forEach((m) => {
      if (m.location_integration_id) ids.add(m.location_integration_id);
    });
    return Array.from(ids);
  }, [activeMeters]);

  const sensorQueries = useLoxoneSensorsMulti(integrationIds);

  const fetchPeaks = useCallback(async () => {
    const meterIds = activeMeters.map((m) => m.id);
    if (meterIds.length === 0) return;
    const today = new Date();
    const fromTime = peakResetAt || startOfDay(today).toISOString();
    const { data, error } = await supabase
      .from("meter_power_readings")
      .select("meter_id, power_value")
      .in("meter_id", meterIds)
      .gte("recorded_at", fromTime)
      .lte("recorded_at", endOfDay(today).toISOString())
      .order("power_value", { ascending: false });
    if (error || !data) return;
    const peaks: Record<string, number> = {};
    for (const row of data) {
      const meter = activeMeters.find((m) => m.id === row.meter_id);
      if (!meter) continue;
      const et = meter.energy_type;
      if ((peaks[et] ?? 0) < row.power_value) peaks[et] = row.power_value;
    }
    setDailyPeaks(peaks);
  }, [activeMeters, peakResetAt]);

  useEffect(() => {
    fetchPeaks();
    const interval = setInterval(fetchPeaks, 60_000);
    return () => clearInterval(interval);
  }, [fetchPeaks]);

  const handleResetPeaks = useCallback(() => {
    setDailyPeaks({});
    setPeakResetAt(new Date().toISOString());
  }, []);

  const gaugeData = useMemo((): GaugeData[] => {
    const sensorsByIntegration = new Map<string, any[]>();
    integrationIds.forEach((id, idx) => {
      const query = sensorQueries[idx];
      if (query?.data) sensorsByIntegration.set(id, query.data);
    });
    const currentByType: Record<string, number> = {};
    for (const meter of activeMeters) {
      const sensors = sensorsByIntegration.get(meter.location_integration_id!);
      if (!sensors) continue;
      const sensor = sensors.find((s: any) => s.id === meter.sensor_uuid);
      if (!sensor || sensor.rawValue == null) continue;
      const et = meter.energy_type;
      currentByType[et] = (currentByType[et] ?? 0) + Math.abs(sensor.rawValue);
    }
    const energyTypes = ["strom", "gas", "waerme", "wasser"].filter(
      (et) => allowedTypes.has(et) && (currentByType[et] != null || dailyPeaks[et] != null)
    );
    return energyTypes.map((et) => {
      const current = currentByType[et] ?? 0;
      const peak = dailyPeaks[et] ?? 0;
      return {
        energyType: et,
        label: t(`energy.${et}` as any) || ENERGY_TYPE_LABELS[et] || et,
        currentValue: Math.round(current * 10) / 10,
        peakValue: Math.round(peak * 10) / 10,
        maxScale: autoScale(current, peak),
        unit: getPowerUnit(et),
        color: ENERGY_HEX_COLORS[et] || "#888",
      };
    });
  }, [activeMeters, integrationIds, sensorQueries, allowedTypes, dailyPeaks]);

  const ecoScore = useMemo(() => computeEcoScore(gaugeData), [gaugeData]);

  const ecoGauge: GaugeData = {
    energyType: "eco",
    label: t("dashboard.ecoScore" as any) || "Öko-Score",
    currentValue: ecoScore,
    peakValue: 0,
    maxScale: 100,
    unit: "%",
    color: ecoScore >= 70 ? "#22c55e" : ecoScore >= 40 ? "#eab308" : "#ef4444",
    hidePeak: true,
  };

  const isLoading = sensorQueries.some((q) => q.isLoading);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="font-display text-lg flex items-center gap-2">{t("dashboard.livePower" as any)} <HelpTooltip text={t("tooltip.liveGauge" as any)} /></CardTitle></CardHeader>
        <CardContent><Skeleton className="h-[200px]" /></CardContent>
      </Card>
    );
  }

  if (gaugeData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="font-display text-lg flex items-center gap-2">{t("dashboard.livePower" as any)} <HelpTooltip text={t("tooltip.liveGauge" as any)} /></CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            {t("dashboard.noActiveMeters" as any)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasPeaks = Object.values(dailyPeaks).some((v) => v > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-lg flex items-center gap-2">{t("dashboard.livePower" as any)} <HelpTooltip text={t("tooltip.liveGauge" as any)} /></CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("dashboard.currentValues" as any)} · <span className="text-destructive">▲</span> {t("dashboard.dailyPeak" as any)}
            </p>
          </div>
          {hasPeaks && (
            <Button
              variant="ghost" size="sm"
              onClick={handleResetPeaks}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              title="Peak-Werte zurücksetzen"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Peak Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="grid grid-cols-2 xl:flex xl:items-start xl:justify-around gap-4 xl:gap-0 place-items-center">
          {gaugeData.map((g) => (
            <AnalogGauge key={g.energyType} data={g} />
          ))}
          <AnalogGauge data={ecoGauge} />
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyGaugeWidget;
