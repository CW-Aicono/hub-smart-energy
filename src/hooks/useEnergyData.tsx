import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useMeters } from "./useMeters";
import { useLoxoneSensorsMulti } from "./useLoxoneSensors";
import { useTenant } from "./useTenant";
import { useGatewayLivePower } from "./useGatewayLivePower";
import type { GatewaySensor } from "./useLoxoneSensors";

export interface MonthlyEnergyData {
  month: string;
  strom: number;
  gas: number;
  waerme: number;
  wasser: number;
}

export interface CostOverviewData {
  currentMonth: number;
  previousMonth: number;
  savings: number;
  savingsPercent: number;
}

export interface EnergyDistribution {
  name: string;
  value: number;
  totalValue: number;
  unit: string;
  color: string;
}

type EnergyTypeKey = "strom" | "gas" | "waerme" | "wasser";

interface EnergyTypeTotals {
  strom: number;
  gas: number;
  waerme: number;
  wasser: number;
}

const ENERGY_TYPE_KEYS: EnergyTypeKey[] = ["strom", "gas", "waerme", "wasser"];

function isEnergyTypeKey(key: string): key is EnergyTypeKey {
  return ENERGY_TYPE_KEYS.includes(key as EnergyTypeKey);
}

function addToTotals(totals: EnergyTypeTotals, energyType: string, value: number): void {
  if (isEnergyTypeKey(energyType)) {
    totals[energyType] += value;
  }
}

function addAutoMeterTotals(
  totals: EnergyTypeTotals,
  meters: { id: string; is_archived: boolean; capture_type: string; energy_type: string; location_id: string }[],
  livePeriodTotals: Record<string, PeriodTotals>,
  meterMap: Record<string, { energy_type: string; location_id: string }>,
  locationId?: string | null,
): void {
  for (const m of meters) {
    if (m.is_archived || m.capture_type !== "automatic") continue;
    if (locationId && meterMap[m.id]?.location_id !== locationId) continue;
    const pt = livePeriodTotals[m.id];
    if (pt?.totalMonth != null) {
      addToTotals(totals, m.energy_type, pt.totalMonth);
    }
  }
}

function aggregateEnergyTotals(
  filteredReadings: ReadingRow[],
  meterMap: Record<string, { energy_type: string; location_id: string }>,
  meters: { id: string; is_archived: boolean; capture_type: string; energy_type: string; location_id: string }[],
  livePeriodTotals: Record<string, PeriodTotals>,
  locationId?: string | null,
): EnergyTypeTotals {
  const totals: EnergyTypeTotals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
  filteredReadings.forEach((r) => {
    const energyType = meterMap[r.meter_id]?.energy_type || "strom";
    addToTotals(totals, energyType, r.value);
  });
  addAutoMeterTotals(totals, meters, livePeriodTotals, meterMap, locationId);
  return totals;
}

/**
 * Converts absolute meter readings into consumption deltas.
 * First reading per meter = baseline (skipped), subsequent readings = delta to previous.
 * Negative deltas (e.g. meter swap) are clamped to 0.
 */
function computeConsumptionDeltas(readings: ReadingRow[]): ReadingRow[] {
  const byMeter = new Map<string, ReadingRow[]>();
  readings.forEach((r) => {
    const arr = byMeter.get(r.meter_id) || [];
    arr.push(r);
    byMeter.set(r.meter_id, arr);
  });

  const result: ReadingRow[] = [];
  for (const [, meterReadings] of byMeter) {
    meterReadings.sort((a, b) => a.reading_date.localeCompare(b.reading_date));
    for (let i = 1; i < meterReadings.length; i++) {
      const delta = meterReadings[i].value - meterReadings[i - 1].value;
      result.push({
        meter_id: meterReadings[i].meter_id,
        value: Math.max(0, delta),
        reading_date: meterReadings[i].reading_date,
      });
    }
  }
  return result;
}

/**
 * Distributes manual consumption deltas evenly across the days between readings.
 * Instead of assigning the entire delta to the reading date, this creates one
 * synthetic reading per day with value = delta / daysBetween.
 */
function distributeManualDeltas(
  deltas: ReadingRow[],
  originalReadings: ReadingRow[],
): ReadingRow[] {
  const byMeter = new Map<string, ReadingRow[]>();
  originalReadings.forEach((r) => {
    const arr = byMeter.get(r.meter_id) || [];
    arr.push(r);
    byMeter.set(r.meter_id, arr);
  });

  // Pre-sort each meter's readings once
  for (const [, arr] of byMeter) {
    arr.sort((a, b) => a.reading_date.localeCompare(b.reading_date));
  }

  const result: ReadingRow[] = [];
  for (const delta of deltas) {
    const meterReadings = byMeter.get(delta.meter_id);
    if (!meterReadings) continue;

    const idx = meterReadings.findIndex((r) => r.reading_date === delta.reading_date);
    if (idx <= 0) continue;

    const prevDate = new Date(meterReadings[idx - 1].reading_date);
    const currDate = new Date(delta.reading_date);
    const daysBetween = Math.max(1, Math.round((currDate.getTime() - prevDate.getTime()) / 86400000));
    const dailyValue = delta.value / daysBetween;

    for (let d = 1; d <= daysBetween; d++) {
      const date = new Date(prevDate);
      date.setDate(date.getDate() + d);
      result.push({
        meter_id: delta.meter_id,
        value: dailyValue,
        reading_date: date.toISOString(),
      });
    }
  }
  return result;
}

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

interface ReadingRow {
  value: number;
  reading_date: string;
  meter_id: string;
}

interface PeriodTotals {
  totalDay: number | null;
  totalWeek: number | null;
  totalMonth: number | null;
  totalYear: number | null;
}

export function useEnergyData(locationId?: string | null) { 
  const { user } = useAuth();
  const { meters } = useMeters();
  const { tenant } = useTenant();
  const showManualMeters = tenant?.show_manual_meters ?? false;

  // Shared react-query cache for readings + virtual sources
  const { data: dbData, isLoading: dbLoading } = useQuery({
    queryKey: ["energy-readings-and-sources", user?.id],
    queryFn: async () => {
      const [readingsRes, sourcesRes] = await Promise.all([
        supabase
          .from("meter_readings")
          .select("value, reading_date, meter_id")
          .order("reading_date", { ascending: true }),
        supabase
          .from("virtual_meter_sources")
          .select("virtual_meter_id, source_meter_id, operator, sort_order")
          .order("sort_order"),
      ]);
      return {
        readings: (readingsRes.data ?? []) as ReadingRow[],
        virtualSources: (sourcesRes.data ?? []) as { virtual_meter_id: string; source_meter_id: string; operator: string; sort_order: number }[],
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const readings = dbData?.readings ?? [];
  const virtualSources = dbData?.virtualSources ?? [];

  // Group automatic meters by integration ID
  const integrationIds = useMemo(() => {
    const ids = new Set<string>();
    meters.forEach((m) => {
      if (!m.is_archived && m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id) {
        ids.add(m.location_integration_id);
      }
    });
    return Array.from(ids);
  }, [meters]);

  // Resolve integration types dynamically so non-Loxone gateways call the right edge function
  const { data: resolvedIntegrationTypes } = useQuery({
    queryKey: ["energy-data-integration-types", integrationIds.join(",")],
    queryFn: async () => {
      if (integrationIds.length === 0) return [] as (string | undefined)[];
      const { data } = await supabase
        .from("location_integrations")
        .select("id, integration:integrations(type)")
        .in("id", integrationIds);
      const typeMap = new Map<string, string>();
      data?.forEach((row: any) => {
        if (row.integration?.type) typeMap.set(row.id, row.integration.type);
      });
      return integrationIds.map((id) => typeMap.get(id));
    },
    enabled: integrationIds.length > 0,
    staleTime: 300_000,
  });

  const integrationTypes = resolvedIntegrationTypes ?? integrationIds.map(() => undefined);

  // Use centralized cached sensor queries with dynamic type resolution
  const sensorQueries = useLoxoneSensorsMulti(integrationIds, integrationTypes);

  // Gateway live power fallback for sensors without period totals (e.g. Shelly)
  const { livePowerByMeter } = useGatewayLivePower(meters);

  // Build live readings and period totals from cached sensor data
  const { liveReadings, livePeriodTotals } = useMemo(() => {
    const activeAutoMeters = meters.filter(
      (m) => !m.is_archived && m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id
    );
    if (activeAutoMeters.length === 0) return { liveReadings: [] as ReadingRow[], livePeriodTotals: {} as Record<string, PeriodTotals> };

    const now = new Date().toISOString();
    const newLiveReadings: ReadingRow[] = [];
    const periodTotals: Record<string, PeriodTotals> = {};

    const sensorsByIntegration = new Map<string, GatewaySensor[]>();
    integrationIds.forEach((id, idx) => {
      const query = sensorQueries[idx];
      if (query?.data) {
        sensorsByIntegration.set(id, query.data);
      }
    });

    for (const meter of activeAutoMeters) {
      const sensors = sensorsByIntegration.get(meter.location_integration_id!);
      if (!sensors) continue;

      const sensor = sensors.find((s) => s.id === meter.sensor_uuid);
      if (sensor) {
        periodTotals[meter.id] = {
          totalDay: sensor.totalDay ?? null,
          totalWeek: sensor.totalWeek ?? null,
          totalMonth: sensor.totalMonth ?? null,
          totalYear: sensor.totalYear ?? null,
        };

        const power = sensor.rawValue;
        if (power != null && !isNaN(power)) {
          newLiveReadings.push({
            meter_id: meter.id,
            value: Math.abs(power),
            reading_date: now,
          });
        }
      }

      // Fallback: if sensor had no period totals, use live gateway power as instantaneous value
      if (!periodTotals[meter.id]?.totalDay && !periodTotals[meter.id]?.totalMonth) {
        const gatewayLive = livePowerByMeter[meter.id];
        if (gatewayLive) {
          // Convert W to kW for energy-type consistency
          const valueKw = gatewayLive.unit === "W" ? gatewayLive.value / 1000 : gatewayLive.value;
          // Use live power as a pseudo period total (instantaneous → shown in Sankey as current flow)
          if (!periodTotals[meter.id]) {
            periodTotals[meter.id] = { totalDay: null, totalWeek: null, totalMonth: null, totalYear: null };
          }
          // Surface as totalDay so Sankey/pie display something
          periodTotals[meter.id].totalDay = valueKw;
          periodTotals[meter.id].totalMonth = valueKw;

          // Also add as live reading if not already present
          const alreadyHasReading = newLiveReadings.some((r) => r.meter_id === meter.id);
          if (!alreadyHasReading) {
            newLiveReadings.push({
              meter_id: meter.id,
              value: gatewayLive.value,
              reading_date: now,
            });
          }
        }
      }
    }

    return { liveReadings: newLiveReadings, livePeriodTotals: periodTotals };
  }, [meters, integrationIds, sensorQueries, livePowerByMeter]);

  const liveLoading = sensorQueries.some((q) => q.isLoading);

  // Combine manual readings + live readings + virtual meter readings
  const allReadings = useMemo(() => {
    const autoMeterIds = new Set(
      meters.filter((m) => m.capture_type === "automatic" && !m.is_archived).map((m) => m.id)
    );
    const manualOnly = readings.filter((r) => !autoMeterIds.has(r.meter_id));

    let combined: ReadingRow[];
    if (showManualMeters) {
      const manualDeltas = computeConsumptionDeltas(manualOnly);
      const distributedManual = distributeManualDeltas(manualDeltas, manualOnly);
      combined = [...distributedManual, ...liveReadings];
    } else {
      combined = [...liveReadings];
    }

    const virtualMeterIds = new Set(virtualSources.map((s) => s.virtual_meter_id));
    const readingsByMeter = new Map<string, ReadingRow[]>();
    combined.forEach((r) => {
      const arr = readingsByMeter.get(r.meter_id) || [];
      arr.push(r);
      readingsByMeter.set(r.meter_id, arr);
    });

    const virtualReadings: ReadingRow[] = [];
    for (const vmId of virtualMeterIds) {
      const sources = virtualSources
        .filter((s) => s.virtual_meter_id === vmId)
        .sort((a, b) => a.sort_order - b.sort_order);

      let total: number | null = null;
      let allResolved = true;
      for (const src of sources) {
        const srcReadings = readingsByMeter.get(src.source_meter_id);
        if (!srcReadings || srcReadings.length === 0) {
          allResolved = false;
          break;
        }
        const latestVal = srcReadings[srcReadings.length - 1].value;
        if (total === null) {
          total = src.operator === "-" ? -latestVal : latestVal;
        } else {
          total = src.operator === "-" ? total - latestVal : total + latestVal;
        }
      }

      if (allResolved && total !== null) {
        virtualReadings.push({
          meter_id: vmId,
          value: total,
          reading_date: new Date().toISOString(),
        });
      }
    }

    return [...combined, ...virtualReadings];
  }, [readings, liveReadings, meters, virtualSources, showManualMeters]);

  // Build a meter_id -> energy_type + location_id map
  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; location_id: string }> = {};
    meters.forEach((m) => {
      map[m.id] = { energy_type: m.energy_type, location_id: m.location_id };
    });
    return map;
  }, [meters]);

  // Filter readings by location if specified
  const filteredReadings = useMemo(() => {
    if (!locationId) return allReadings;
    return allReadings.filter((r) => meterMap[r.meter_id]?.location_id === locationId);
  }, [allReadings, locationId, meterMap]);

  // Monthly energy data grouped by energy type
  const monthlyData = useMemo((): MonthlyEnergyData[] => {
    const buckets: Record<string, EnergyTypeTotals> = {};
    MONTH_LABELS.forEach((m) => {
      buckets[m] = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    });

    filteredReadings.forEach((r) => {
      const date = new Date(r.reading_date);
      const monthLabel = MONTH_LABELS[date.getMonth()];
      const energyType = meterMap[r.meter_id]?.energy_type || "strom";
      if (buckets[monthLabel]) {
        addToTotals(buckets[monthLabel], energyType, r.value);
      }
    });

    const currentMonthLabel = MONTH_LABELS[new Date().getMonth()];
    if (buckets[currentMonthLabel]) {
      addAutoMeterTotals(buckets[currentMonthLabel], meters, livePeriodTotals, meterMap, locationId);
    }

    return MONTH_LABELS.map((m) => ({ month: m, ...buckets[m] }));
  }, [filteredReadings, meterMap, livePeriodTotals, meters, locationId]);

  // Cost overview based on current vs previous month
  const costOverview = useMemo((): CostOverviewData => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const currentYear = now.getFullYear();
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    let currentTotal = 0;
    let prevTotal = 0;

    filteredReadings.forEach((r) => {
      const date = new Date(r.reading_date);
      if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        currentTotal += r.value;
      } else if (date.getMonth() === prevMonth && date.getFullYear() === prevYear) {
        prevTotal += r.value;
      }
    });

    const autoTotals = aggregateEnergyTotals([], meterMap, meters, livePeriodTotals, locationId);
    currentTotal += autoTotals.strom + autoTotals.gas + autoTotals.waerme + autoTotals.wasser;

    const savings = prevTotal - currentTotal;
    const savingsPercent = prevTotal > 0 ? Math.round((savings / prevTotal) * 1000) / 10 : 0;

    return { currentMonth: currentTotal, previousMonth: prevTotal, savings: Math.max(savings, 0), savingsPercent };
  }, [filteredReadings, livePeriodTotals, meters, meterMap, locationId]);

  // Energy distribution for pie chart
  const energyDistribution = useMemo((): EnergyDistribution[] => {
    const totals = aggregateEnergyTotals(filteredReadings, meterMap, meters, livePeriodTotals, locationId);
    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    if (total === 0) {
      return [
        { name: "strom", value: 0, totalValue: 0, unit: "kWh", color: "hsl(var(--energy-strom))" },
        { name: "gas", value: 0, totalValue: 0, unit: "m³", color: "hsl(var(--energy-gas))" },
        { name: "waerme", value: 0, totalValue: 0, unit: "kWh", color: "hsl(var(--energy-waerme))" },
        { name: "wasser", value: 0, totalValue: 0, unit: "m³", color: "hsl(var(--energy-wasser))" },
      ];
    }

    return [
      { name: "strom", value: Math.round((totals.strom / total) * 100), totalValue: Math.round(totals.strom * 100) / 100, unit: "kWh", color: "hsl(var(--energy-strom))" },
      { name: "gas", value: Math.round((totals.gas / total) * 100), totalValue: Math.round(totals.gas * 100) / 100, unit: "m³", color: "hsl(var(--energy-gas))" },
      { name: "waerme", value: Math.round((totals.waerme / total) * 100), totalValue: Math.round(totals.waerme * 100) / 100, unit: "kWh", color: "hsl(var(--energy-waerme))" },
      { name: "wasser", value: Math.round((totals.wasser / total) * 100), totalValue: Math.round(totals.wasser * 100) / 100, unit: "m³", color: "hsl(var(--energy-wasser))" },
    ];
  }, [filteredReadings, meterMap, livePeriodTotals, meters, locationId]);

  // Total by energy type for Sankey
  const energyTotals = useMemo(
    () => aggregateEnergyTotals(filteredReadings, meterMap, meters, livePeriodTotals, locationId),
    [filteredReadings, meterMap, livePeriodTotals, meters, locationId],
  );

  const hasData = filteredReadings.length > 0 || Object.keys(livePeriodTotals).length > 0;
  const isLoading = dbLoading || liveLoading;

  return {
    monthlyData,
    costOverview,
    energyDistribution,
    energyTotals,
    readings: filteredReadings,
    livePeriodTotals,
    loading: isLoading,
    hasData,
  };
}
