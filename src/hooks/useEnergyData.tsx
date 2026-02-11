import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useMeters } from "./useMeters";
import { Meter } from "./useMeters";

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
  const [liveReadings, setLiveReadings] = useState<ReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(true);

  // Fetch manual readings from DB
  useEffect(() => {
    if (!user) return;

    const fetchReadings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("meter_readings")
        .select("value, reading_date, meter_id")
        .order("reading_date", { ascending: true });

      if (error) {
        console.error("Error fetching readings:", error);
        setReadings([]);
      } else {
        setReadings((data ?? []) as ReadingRow[]);
      }
      setLoading(false);
    };

    fetchReadings();
  }, [user]);

  // Fetch live sensor values for automatic meters
  const fetchLiveValues = useCallback(async () => {
    setLiveLoading(true);
    const activeAutoMeters = meters.filter(
      (m) => !m.is_archived && m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id
    );
    if (activeAutoMeters.length === 0) {
      setLiveLoading(false);
      return;
    }

    // Group by integration
    const byIntegration = new Map<string, Meter[]>();
    activeAutoMeters.forEach((m) => {
      const key = m.location_integration_id!;
      const arr = byIntegration.get(key) || [];
      arr.push(m);
      byIntegration.set(key, arr);
    });

    const now = new Date().toISOString();
    const newLiveReadings: ReadingRow[] = [];

    for (const [integrationId, intMeters] of byIntegration) {
      try {
        const { data, error } = await supabase.functions.invoke("loxone-api", {
          body: { locationIntegrationId: integrationId, action: "getSensors" },
        });
        if (error || !data?.success) continue;

      for (const meter of intMeters) {
          const sensor = data.sensors?.find((s: any) => s.id === meter.sensor_uuid);
          if (sensor) {
            // Prefer rawValue (numeric), fall back to parsing value string
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
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch live sensors for integration ${integrationId}:`, err);
      }
    }

    setLiveReadings(newLiveReadings);
    setLiveLoading(false);
  }, [meters]);

  useEffect(() => {
    if (meters.length > 0) {
      fetchLiveValues();
      const interval = setInterval(fetchLiveValues, 300000); // 5 min
      return () => clearInterval(interval);
    }
  }, [fetchLiveValues, meters.length]);

  // Combine manual readings + live readings for automatic meters
  const allReadings = useMemo(() => {
    // For automatic meters, use live values instead of DB readings
    const autoMeterIds = new Set(
      meters.filter((m) => m.capture_type === "automatic" && !m.is_archived).map((m) => m.id)
    );
    // Keep manual readings only for non-automatic meters
    const manualOnly = readings.filter((r) => !autoMeterIds.has(r.meter_id));
    return [...manualOnly, ...liveReadings];
  }, [readings, liveReadings, meters]);

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
    loading: isLoading,
    hasData,
  };
}
