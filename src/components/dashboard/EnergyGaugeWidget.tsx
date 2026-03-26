import { useMemo, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { useMeters } from "@/hooks/useMeters";
import { useLocationEnergyTypesSet } from "@/hooks/useLocationEnergySources";
import { useRealtimePower } from "@/hooks/useRealtimePower";
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
  const allowedTypes = useLocationEnergyTypesSet(locationId);
  const [initialPeaksLoaded, setInitialPeaksLoaded] = useState(false);
  const [initialCurrentLoaded, setInitialCurrentLoaded] = useState(false);

  // Filter to main meters with automatic capture
  const activeMeters = useMemo(() => {
    return meters.filter(
      (m) =>
        !m.is_archived &&
        m.capture_type === "automatic" &&
        m.is_main_meter &&
        (!locationId || m.location_id === locationId)
    );
  }, [meters, locationId]);

  const meterIds = useMemo(() => activeMeters.map((m) => m.id), [activeMeters]);

  // Subscribe to Realtime for instant updates
  const { latestByMeter, peakByMeter, resetPeaks } = useRealtimePower(meterIds);

  // Load initial current values from the latest power readings
  const [initialCurrent, setInitialCurrent] = useState<Record<string, number>>({});

  useEffect(() => {
    if (meterIds.length === 0) return;
    // Fetch the latest reading per meter to seed gauges before first Realtime event
    const fetchLatest = async () => {
      const promises = meterIds.map((id) =>
        supabase
          .from("meter_power_readings")
          .select("meter_id, power_value")
          .eq("meter_id", id)
          .order("recorded_at", { ascending: false })
          .limit(1)
      );
      const results = await Promise.all(promises);
      const current: Record<string, number> = {};
      for (const { data } of results) {
        if (data && data.length > 0) {
          current[data[0].meter_id] = Math.abs(data[0].power_value);
        }
      }
      setInitialCurrent(current);
      setInitialCurrentLoaded(true);
    };
    fetchLatest();
  }, [meterIds.join(",")]);

  // Load initial daily peaks
  const [initialPeaks, setInitialPeaks] = useState<Record<string, number>>({});

  useEffect(() => {
    if (meterIds.length === 0) return;
    const fetchPeaks = async () => {
      const today = new Date();
      const { data } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value")
        .in("meter_id", meterIds)
        .gte("recorded_at", startOfDay(today).toISOString())
        .lte("recorded_at", endOfDay(today).toISOString())
        .order("power_value", { ascending: false });
      if (!data) return;
      const peaks: Record<string, number> = {};
      for (const row of data) {
        if ((peaks[row.meter_id] ?? 0) < row.power_value) {
          peaks[row.meter_id] = row.power_value;
        }
      }
      setInitialPeaks(peaks);
      setInitialPeaksLoaded(true);
    };
    fetchPeaks();
  }, [meterIds.join(",")]);

  const handleResetPeaks = useCallback(() => {
    resetPeaks();
    setInitialPeaks({});
  }, [resetPeaks]);

  // Build gauge data from Realtime values (with initial seed as fallback)
  const gaugeData = useMemo((): GaugeData[] => {
    const currentByType: Record<string, number> = {};
    const peaksByType: Record<string, number> = {};

    for (const meter of activeMeters) {
      const et = meter.energy_type;
      // Realtime value takes priority, then initial seed
      const current = latestByMeter[meter.id] ?? initialCurrent[meter.id];
      if (current != null) {
        currentByType[et] = (currentByType[et] ?? 0) + current;
      }
      // Peak: max of Realtime peak and initial peak
      const rtPeak = peakByMeter[meter.id] ?? 0;
      const initPeak = initialPeaks[meter.id] ?? 0;
      const peak = Math.max(rtPeak, initPeak);
      if (peak > 0) {
        peaksByType[et] = Math.max(peaksByType[et] ?? 0, (peaksByType[et] ?? 0) > 0 ? peaksByType[et] : 0);
        // Accumulate peaks per type properly
        peaksByType[et] = Math.max(peaksByType[et] ?? 0, peak);
      }
    }

    const energyTypes = ["strom", "gas", "waerme", "wasser"].filter(
      (et) => allowedTypes.has(et) && (currentByType[et] != null || peaksByType[et] != null)
    );

    return energyTypes.map((et) => {
      const current = currentByType[et] ?? 0;
      const peak = peaksByType[et] ?? 0;
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
  }, [activeMeters, latestByMeter, initialCurrent, peakByMeter, initialPeaks, allowedTypes, t]);

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

  const isLoading = !initialCurrentLoaded && meterIds.length > 0;

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

  const hasPeaks = gaugeData.some((g) => g.peakValue > 0);

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
