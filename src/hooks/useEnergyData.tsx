import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useMeters } from "./useMeters";
import { useLoxoneSensorsMulti } from "./useLoxoneSensors";

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

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

interface ReadingRow {
  value: number;
  reading_date: string;
  meter_id: string;
}

export function useEnergyData(locationId?: string | null) {
  const { user } = useAuth();
  const { meters } = useMeters();
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [virtualSources, setVirtualSources] = useState<{ virtual_meter_id: string; source_meter_id: string; operator: string; sort_order: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch manual readings and virtual sources from DB
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
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

      if (readingsRes.error) {
        console.error("Error fetching readings:", readingsRes.error);
        setReadings([]);
      } else {
        setReadings((readingsRes.data ?? []) as ReadingRow[]);
      }

      if (!sourcesRes.error && sourcesRes.data) {
        setVirtualSources(sourcesRes.data);
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

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

  // Use centralized cached sensor queries (stable hook call)
  const sensorQueries = useLoxoneSensorsMulti(integrationIds);

  // Build live readings and period totals from cached sensor data
  const { liveReadings, livePeriodTotals } = useMemo(() => {
    const activeAutoMeters = meters.filter(
      (m) => !m.is_archived && m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id
    );
    if (activeAutoMeters.length === 0) return { liveReadings: [] as ReadingRow[], livePeriodTotals: {} as Record<string, { totalDay: number | null; totalWeek: number | null; totalMonth: number | null; totalYear: number | null }> };

    const now = new Date().toISOString();
    const newLiveReadings: ReadingRow[] = [];
    const periodTotals: Record<string, { totalDay: number | null; totalWeek: number | null; totalMonth: number | null; totalYear: number | null }> = {};

    const sensorsByIntegration = new Map<string, any[]>();
    integrationIds.forEach((id, idx) => {
      const query = sensorQueries[idx];
      if (query?.data) {
        sensorsByIntegration.set(id, query.data);
      }
    });

    for (const meter of activeAutoMeters) {
      const sensors = sensorsByIntegration.get(meter.location_integration_id!);
      if (!sensors) continue;

      const sensor = sensors.find((s: any) => s.id === meter.sensor_uuid);
      if (sensor) {
        let numVal: number;
        if (typeof sensor.rawValue === "number") {
          numVal = sensor.rawValue;
        } else if (typeof sensor.rawValue === "string") {
          numVal = parseFloat(sensor.rawValue.replace(",", "."));
        } else if (typeof sensor.value === "string") {
          numVal = parseFloat(sensor.value.replace(",", "."));
        } else {
          numVal = typeof sensor.value === "number" ? sensor.value : NaN;
        }

        if (!isNaN(numVal)) {
          newLiveReadings.push({
            meter_id: meter.id,
            value: numVal,
            reading_date: now,
          });
        }

        // Extract period totals
        periodTotals[meter.id] = {
          totalDay: sensor.totalDay ?? null,
          totalWeek: sensor.totalWeek ?? null,
          totalMonth: sensor.totalMonth ?? null,
          totalYear: sensor.totalYear ?? null,
        };
      }
    }

    return { liveReadings: newLiveReadings, livePeriodTotals: periodTotals };
  }, [meters, integrationIds, sensorQueries]);

  const liveLoading = sensorQueries.some((q) => q.isLoading);

  // Combine manual readings + live readings + virtual meter readings
  const allReadings = useMemo(() => {
    const autoMeterIds = new Set(
      meters.filter((m) => m.capture_type === "automatic" && !m.is_archived).map((m) => m.id)
    );
    const manualOnly = readings.filter((r) => !autoMeterIds.has(r.meter_id));
    const combined = [...manualOnly, ...liveReadings];

    // Compute virtual meter readings from sources
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

      // Use latest value from each source
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
  }, [readings, liveReadings, meters, virtualSources]);

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
    const buckets: Record<string, { strom: number; gas: number; waerme: number; wasser: number }> = {};
    MONTH_LABELS.forEach((m) => {
      buckets[m] = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    });

    filteredReadings.forEach((r) => {
      const date = new Date(r.reading_date);
      const monthLabel = MONTH_LABELS[date.getMonth()];
      const energyType = meterMap[r.meter_id]?.energy_type || "strom";
      if (buckets[monthLabel] && energyType in buckets[monthLabel]) {
        (buckets[monthLabel] as any)[energyType] += r.value;
      }
    });

    return MONTH_LABELS.map((m) => ({ month: m, ...buckets[m] }));
  }, [filteredReadings, meterMap]);

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

    const savings = prevTotal - currentTotal;
    const savingsPercent = prevTotal > 0 ? Math.round((savings / prevTotal) * 1000) / 10 : 0;

    return { currentMonth: currentTotal, previousMonth: prevTotal, savings: Math.max(savings, 0), savingsPercent };
  }, [filteredReadings]);

  // Energy distribution for pie chart
  const energyDistribution = useMemo((): EnergyDistribution[] => {
    const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    filteredReadings.forEach((r) => {
      const energyType = meterMap[r.meter_id]?.energy_type || "strom";
      if (energyType in totals) {
        (totals as any)[energyType] += r.value;
      }
    });

    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    if (total === 0) {
      return [
        { name: "Strom", value: 0, totalValue: 0, unit: "kWh", color: "hsl(var(--energy-strom))" },
        { name: "Gas", value: 0, totalValue: 0, unit: "m³", color: "hsl(var(--energy-gas))" },
        { name: "Wärme", value: 0, totalValue: 0, unit: "kWh", color: "hsl(var(--energy-waerme))" },
        { name: "Wasser", value: 0, totalValue: 0, unit: "m³", color: "hsl(var(--energy-wasser))" },
      ];
    }

    return [
      { name: "Strom", value: Math.round((totals.strom / total) * 100), totalValue: Math.round(totals.strom * 100) / 100, unit: "kWh", color: "hsl(var(--energy-strom))" },
      { name: "Gas", value: Math.round((totals.gas / total) * 100), totalValue: Math.round(totals.gas * 100) / 100, unit: "m³", color: "hsl(var(--energy-gas))" },
      { name: "Wärme", value: Math.round((totals.waerme / total) * 100), totalValue: Math.round(totals.waerme * 100) / 100, unit: "kWh", color: "hsl(var(--energy-waerme))" },
      { name: "Wasser", value: Math.round((totals.wasser / total) * 100), totalValue: Math.round(totals.wasser * 100) / 100, unit: "m³", color: "hsl(var(--energy-wasser))" },
    ];
  }, [filteredReadings, meterMap]);

  // Total by energy type for Sankey
  const energyTotals = useMemo(() => {
    const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    filteredReadings.forEach((r) => {
      const energyType = meterMap[r.meter_id]?.energy_type || "strom";
      if (energyType in totals) {
        (totals as any)[energyType] += r.value;
      }
    });
    return totals;
  }, [filteredReadings, meterMap]);

  const hasData = filteredReadings.length > 0;
  const isLoading = loading || liveLoading;

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
