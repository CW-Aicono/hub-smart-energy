import { useMemo, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { useMeters } from "@/hooks/useMeters";
import { useLocationEnergyTypesSet } from "@/hooks/useLocationEnergySources";
import { useGatewayLivePower } from "@/hooks/useGatewayLivePower";
import { useRealtimePower } from "@/hooks/useRealtimePower";
import { ENERGY_TYPE_LABELS, ENERGY_HEX_COLORS } from "@/lib/energyTypeColors";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";
import AnalogGauge, { type GaugeData } from "./AnalogGauge";

interface EnergyGaugeWidgetProps {
  locationId: string | null;
}

type GaugeUnit = "W" | "kW" | "MW" | "m³/h";

const POWER_UNIT_FACTORS: Record<Exclude<GaugeUnit, "m³/h">, number> = {
  W: 1,
  kW: 1000,
  MW: 1_000_000,
};

function normalizeGaugeUnit(unit?: string | null): GaugeUnit | null {
  if (!unit) return null;
  if (unit === "m³") return "m³/h";
  if (unit === "W" || unit === "kW" || unit === "MW" || unit === "m³/h") return unit;
  return null;
}

function getMeterGaugeUnit(meter: any, liveUnit?: string): GaugeUnit {
  return (
    normalizeGaugeUnit(liveUnit) ??
    normalizeGaugeUnit(meter.source_unit_power) ??
    normalizeGaugeUnit(meter.unit) ??
    (meter.energy_type === "wasser" || meter.energy_type === "gas" ? "m³/h" : "kW")
  );
}

function toGaugeBaseValue(value: number, unit: GaugeUnit): number {
  if (unit === "m³/h") return value;
  return value * POWER_UNIT_FACTORS[unit];
}

function fromGaugeBaseValue(value: number, unit: GaugeUnit): number {
  if (unit === "m³/h") return value;
  return value / POWER_UNIT_FACTORS[unit];
}

function getAutoGaugeUnit(baseValue: number, energyType: string): GaugeUnit {
  if (energyType === "wasser" || energyType === "gas") return "m³/h";
  if (baseValue >= 1_000_000) return "MW";
  if (baseValue >= 1000) return "kW";
  return "W";
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
  const { livePowerByMeter, isLoading: liveGatewayLoading } = useGatewayLivePower(activeMeters);

  // Load initial current values from the latest power readings
  const [initialCurrent, setInitialCurrent] = useState<Record<string, number>>({});

  useEffect(() => {
    if (meterIds.length === 0) return;
    // Ein einziger Sammel-Aufruf statt einer Abfrage pro Zähler.
    // Rohwert nur, wenn er wirklich frisch ist (≤ 15 Min) — sonst würde ein
    // Stunden alter Rest-Datensatz als "Jetzt" angezeigt.
    const fetchLatest = async () => {
      const freshCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const today = new Date();
      const { data } = await supabase.rpc("get_meter_power_gauge_seed" as any, {
        _meter_ids: meterIds,
        _fresh_cutoff: freshCutoff,
        _day_start: startOfDay(today).toISOString(),
        _day_end: endOfDay(today).toISOString(),
      });
      const current: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        if (row.latest_value != null) current[row.meter_id] = Number(row.latest_value);
      }

      const missing = meterIds.filter((id) => current[id] === undefined);
      if (missing.length > 0) {
        const aggPromises = missing.map((id) =>
          supabase
            .from("meter_power_readings_5min")
            .select("meter_id, power_avg")
            .eq("meter_id", id)
            .order("bucket", { ascending: false })
            .limit(1)
        );
        const aggResults = await Promise.all(aggPromises);
        for (const { data: aggData } of aggResults) {
          if (aggData && aggData.length > 0 && aggData[0].power_avg != null) {
            current[aggData[0].meter_id] = Number(aggData[0].power_avg);
          }
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
      const peaks: Record<string, number> = {};
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();

      // Primärquelle: 5-Min-Aggregat (power_max). Die Rohtabelle wird für
      // Worker-Zähler nicht mehr durchgängig befüllt und liefert allein
      // einen viel zu niedrigen Tages-Peak.
      const { data: agg } = await supabase
        .from("meter_power_readings_5min")
        .select("meter_id, power_max, power_avg")
        .in("meter_id", meterIds)
        .gte("bucket", dayStart)
        .lte("bucket", dayEnd);
      for (const row of agg ?? []) {
        const v = Math.abs(Number(row.power_max ?? row.power_avg ?? 0));
        if (v > (peaks[row.meter_id] ?? 0)) peaks[row.meter_id] = v;
      }

      // Top-up aus Rohwerten (Polling-Ingest-Zähler, jüngste Minuten).
      const peakResults = await Promise.all(
        meterIds.map((mid) =>
          supabase
            .from("meter_power_readings")
            .select("meter_id, power_value")
            .eq("meter_id", mid)
            .gte("recorded_at", dayStart)
            .lte("recorded_at", dayEnd)
            .order("power_value", { ascending: false })
            .limit(1),
        ),
      );
      for (const res of peakResults) {
        for (const row of res.data ?? []) {
          const v = Math.abs(Number(row.power_value ?? 0));
          if (v > (peaks[row.meter_id] ?? 0)) peaks[row.meter_id] = v;
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
    const currentByTypeBase: Record<string, number> = {};
    const peaksByTypeBase: Record<string, number> = {};

    for (const meter of activeMeters) {
      const et = meter.energy_type;
      const liveGatewayValue = livePowerByMeter[meter.id];
      const gaugeUnit = getMeterGaugeUnit(meter, liveGatewayValue?.unit);

      // Realtime value takes priority, then initial seed
      const current = latestByMeter[meter.id] ?? initialCurrent[meter.id] ?? liveGatewayValue?.value;
      if (current != null) {
        currentByTypeBase[et] = (currentByTypeBase[et] ?? 0) + toGaugeBaseValue(current, gaugeUnit);
      }

      // Peak: max of Realtime peak and initial peak
      const rtPeak = peakByMeter[meter.id] ?? 0;
      const initPeak = initialPeaks[meter.id] ?? 0;
      const peak = Math.max(rtPeak, initPeak);
      if (peak > 0) {
        peaksByTypeBase[et] = Math.max(peaksByTypeBase[et] ?? 0, toGaugeBaseValue(peak, gaugeUnit));
      }
    }

    const energyTypes = ["strom", "gas", "waerme", "wasser"].filter(
      (et) => allowedTypes.has(et) && (currentByTypeBase[et] != null || peaksByTypeBase[et] != null)
    );

    return energyTypes.map((et) => {
      const currentBase = currentByTypeBase[et] ?? 0;
      const peakBase = peaksByTypeBase[et] ?? 0;
      const unit = getAutoGaugeUnit(Math.max(currentBase, peakBase), et);
      const current = fromGaugeBaseValue(currentBase, unit);
      const peak = fromGaugeBaseValue(peakBase, unit);

      return {
        energyType: et,
        label: t(`energy.${et}` as any) || ENERGY_TYPE_LABELS[et] || et,
        currentValue: Math.round(current * 10) / 10,
        peakValue: Math.round(peak * 10) / 10,
        maxScale: autoScale(current, peak),
        unit,
        color: ENERGY_HEX_COLORS[et] || "#888",
      };
    });
  }, [activeMeters, latestByMeter, initialCurrent, peakByMeter, initialPeaks, allowedTypes, t, livePowerByMeter]);

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

  const isLoading = meterIds.length > 0 && (!initialCurrentLoaded || liveGatewayLoading);

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
