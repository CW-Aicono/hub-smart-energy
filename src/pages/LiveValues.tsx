import { useState, useEffect, useCallback, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, RefreshCw, Search, Gauge, Zap, Flame, Droplets, Thermometer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatEnergy, formatGasDual } from "@/lib/formatEnergy";
import { cn } from "@/lib/utils";

interface MeterLiveValue {
  meterId: string;
  value: number | null;
  totalDay: number | null;
  totalWeek: number | null;
  totalMonth: number | null;
  totalYear: number | null;
  loading: boolean;
}

const getBerlinDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
};

const LiveValues = () => {
  const { user, loading: authLoading } = useAuth();
  const { locations, loading: locationsLoading } = useLocations();
  const { meters, loading: metersLoading } = useMeters();
  const { t, language } = useTranslation();

  const ENERGY_TYPE_CONFIG: Record<string, { label: string; icon: typeof Zap; colorClass: string }> = {
    strom: { label: t("liveValues.strom" as any), icon: Zap, colorClass: "text-[hsl(var(--energy-strom))]" },
    gas: { label: t("liveValues.gas" as any), icon: Flame, colorClass: "text-[hsl(var(--energy-gas))]" },
    waerme: { label: t("liveValues.waerme" as any), icon: Thermometer, colorClass: "text-[hsl(var(--energy-waerme))]" },
    wasser: { label: t("liveValues.wasser" as any), icon: Droplets, colorClass: "text-[hsl(var(--energy-wasser))]" },
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedEnergyType, setSelectedEnergyType] = useState<string>("all");
  const [selectedCaptureType, setSelectedCaptureType] = useState<string>("all");
  const [liveValues, setLiveValues] = useState<Map<string, { value: number; unit: string; totalDay: number | null; totalWeek: number | null; totalMonth: number | null; totalYear: number | null; meterReading: number | null; meterReadingUnit: string }>>(new Map());
  const [manualValues, setManualValues] = useState<Map<string, { value: number; date: string }>>(new Map());
  const [manualDailyTotals, setManualDailyTotals] = useState<Map<string, number>>(new Map());
  const [virtualSources, setVirtualSources] = useState<{ virtual_meter_id: string; source_meter_id: string | null; source_charge_point_id: string | null; source_charge_point_group_id: string | null; source_all_charge_points: boolean | null; operator: string; sort_order: number }[]>([]);
  const [cpVirtualValues, setCpVirtualValues] = useState<Map<string, { value: number; totalDay: number | null; totalMonth: number | null; totalYear: number | null; meterReading: number | null }>>(new Map());
  const [loadingLive, setLoadingLive] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch virtual meter sources
  useEffect(() => {
    if (!user) return;
    const fetchVirtualSources = async () => {
      const { data } = await supabase
        .from("virtual_meter_sources")
        .select("virtual_meter_id, source_meter_id, source_charge_point_id, source_charge_point_group_id, source_all_charge_points, operator, sort_order")
        .order("sort_order");
      if (data) setVirtualSources(data as any);
    };
    fetchVirtualSources();
  }, [user]);


  // Fetch latest manual readings + compute daily totals for manual meters
  useEffect(() => {
    if (!user) return;
    const fetchLatestReadings = async () => {
      const { data } = await supabase
        .from("meter_readings")
        .select("meter_id, value, reading_date")
        .order("reading_date", { ascending: false });

      if (data) {
        const map = new Map<string, { value: number; date: string }>();
        data.forEach((r: any) => {
          if (!map.has(r.meter_id)) {
            map.set(r.meter_id, { value: r.value, date: r.reading_date });
          }
        });
        setManualValues(map);

        // Compute daily consumption: latest reading - previous reading for each meter
        const dailyMap = new Map<string, number>();
        const byMeter = new Map<string, { value: number; reading_date: string }[]>();
        data.forEach((r: any) => {
          const arr = byMeter.get(r.meter_id) || [];
          arr.push({ value: r.value, reading_date: r.reading_date });
          byMeter.set(r.meter_id, arr);
        });
        for (const [meterId, readings] of byMeter) {
          // readings are sorted desc by date already
          if (readings.length >= 2) {
            const latest = readings[0];
            const previous = readings[1];
            const diff = latest.value - previous.value;
            if (diff >= 0) {
              dailyMap.set(meterId, diff);
            }
          }
        }
        setManualDailyTotals(dailyMap);
      }
    };
    fetchLatestReadings();
  }, [user]);

  // Resolve CP-based virtual meter values (live kW from ocpp_meter_samples + kWh sums from charging_sessions)
  const fetchCpVirtualValues = useCallback(async () => {
    const cpSources = virtualSources.filter(
      (s) => s.source_charge_point_id || s.source_charge_point_group_id || s.source_all_charge_points
    );
    if (cpSources.length === 0) {
      setCpVirtualValues(new Map());
      return;
    }

    // Load all CPs of the tenant once (RLS scopes by tenant automatically)
    const { data: allCps } = await supabase
      .from("charge_points")
      .select("id, location_id, group_id");
    if (!allCps) return;

    const virtualMeters = meters.filter((m) => m.capture_type === "virtual");

    // Resolve each CP-based source row to a concrete list of charge_point_ids
    const resolveSourceCps = (
      src: typeof cpSources[number],
      vmLocationId: string | null,
    ): string[] => {
      if (src.source_charge_point_id) return [src.source_charge_point_id];
      if (src.source_charge_point_group_id) {
        return allCps.filter((cp) => cp.group_id === src.source_charge_point_group_id).map((cp) => cp.id);
      }
      if (src.source_all_charge_points && vmLocationId) {
        return allCps.filter((cp) => cp.location_id === vmLocationId).map((cp) => cp.id);
      }
      return [];
    };

    // Collect all CP IDs we need data for
    const vmIds = Array.from(new Set(cpSources.map((s) => s.virtual_meter_id)));
    const vmToCps = new Map<string, { cpIds: string[]; operator: string }[]>();
    const allCpIds = new Set<string>();
    for (const vmId of vmIds) {
      const vm = virtualMeters.find((m) => m.id === vmId);
      const vmLocationId = vm?.location_id || null;
      const entries = cpSources
        .filter((s) => s.virtual_meter_id === vmId)
        .map((s) => {
          const cpIds = resolveSourceCps(s, vmLocationId);
          cpIds.forEach((id) => allCpIds.add(id));
          return { cpIds, operator: s.operator };
        });
      vmToCps.set(vmId, entries);
    }

    if (allCpIds.size === 0) {
      setCpVirtualValues(new Map());
      return;
    }
    const cpIdList = Array.from(allCpIds);

    // 1) Live power: latest Power.Active.Import (and Export) sample per CP within last 5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: powerSamples } = await supabase
      .from("ocpp_meter_samples")
      .select("charge_point_id, measurand, unit, value, sampled_at")
      .in("charge_point_id", cpIdList)
      .in("measurand", ["Power.Active.Import", "Power.Active.Export"])
      .gte("sampled_at", fiveMinAgo)
      .order("sampled_at", { ascending: false });

    // Build per-CP latest import/export in kW
    const livePerCp = new Map<string, number>(); // net kW (import - export)
    if (powerSamples) {
      const seen = new Set<string>();
      for (const s of powerSamples) {
        const key = `${s.charge_point_id}::${s.measurand}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const factor = (s.unit === "W" || s.unit == null) ? 0.001 : 1; // assume W if no unit
        const kw = Number(s.value) * factor;
        const cur = livePerCp.get(s.charge_point_id) ?? 0;
        livePerCp.set(s.charge_point_id, cur + (s.measurand === "Power.Active.Export" ? -kw : kw));
      }
    }

    // 2) Energy sums per CP: today / month / year / total
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

    const { data: sessions } = await supabase
      .from("charging_sessions")
      .select("charge_point_id, energy_kwh, start_time")
      .in("charge_point_id", cpIdList);

    const sumPerCp = { day: new Map<string, number>(), month: new Map<string, number>(), year: new Map<string, number>(), total: new Map<string, number>() };
    if (sessions) {
      for (const s of sessions) {
        if (!s.charge_point_id) continue;
        const kwh = Number(s.energy_kwh) || 0;
        sumPerCp.total.set(s.charge_point_id, (sumPerCp.total.get(s.charge_point_id) ?? 0) + kwh);
        if (s.start_time >= startOfYear) sumPerCp.year.set(s.charge_point_id, (sumPerCp.year.get(s.charge_point_id) ?? 0) + kwh);
        if (s.start_time >= startOfMonth) sumPerCp.month.set(s.charge_point_id, (sumPerCp.month.get(s.charge_point_id) ?? 0) + kwh);
        if (s.start_time >= startOfDay) sumPerCp.day.set(s.charge_point_id, (sumPerCp.day.get(s.charge_point_id) ?? 0) + kwh);
      }
    }

    // 3) Aggregate per virtual meter with operator
    const result = new Map<string, { value: number; totalDay: number | null; totalMonth: number | null; totalYear: number | null; meterReading: number | null }>();
    for (const [vmId, entries] of vmToCps) {
      let kw = 0, day = 0, month = 0, year = 0, total = 0;
      for (const entry of entries) {
        const sign = entry.operator === "-" ? -1 : 1;
        for (const cpId of entry.cpIds) {
          kw += sign * (livePerCp.get(cpId) ?? 0);
          day += sign * (sumPerCp.day.get(cpId) ?? 0);
          month += sign * (sumPerCp.month.get(cpId) ?? 0);
          year += sign * (sumPerCp.year.get(cpId) ?? 0);
          total += sign * (sumPerCp.total.get(cpId) ?? 0);
        }
      }
      result.set(vmId, { value: kw, totalDay: day, totalMonth: month, totalYear: year, meterReading: total });
    }
    setCpVirtualValues(result);
  }, [virtualSources, meters]);

  useEffect(() => {
    if (!user) return;
    fetchCpVirtualValues();
    const interval = setInterval(fetchCpVirtualValues, 60_000);
    return () => clearInterval(interval);
  }, [user, fetchCpVirtualValues]);


  // Load initial power values from DB (last known value per meter)
  const loadInitialPowerValues = useCallback(async () => {
    const autoMeters = meters.filter(
      (m) => !m.is_archived && m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id
    );
    if (autoMeters.length === 0) return;

    setLoadingLive(true);

    const meterIds = autoMeters.map((m) => m.id);
    const uuids = autoMeters.map((m) => m.sensor_uuid!.toLowerCase());
    const uuidToMeterId = new Map<string, string>();
    for (const m of autoMeters) uuidToMeterId.set(m.sensor_uuid!.toLowerCase(), m.id);

    const today = getBerlinDateKey(new Date());
    const firstOfMonth = today.substring(0, 7) + "-01";
    const firstOfYear = today.substring(0, 4) + "-01-01";

    // Parallel: DB-Polling-Wert, Bridge-Raw-Wert (Live), Perioden-Totals
    const [powerRes, bridgeRes, periodRes] = await Promise.all([
      supabase
        .from("meter_power_readings")
        .select("meter_id, power_value, recorded_at")
        .in("meter_id", meterIds)
        .gte("recorded_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("recorded_at", { ascending: false }),
      supabase
        .from("bridge_raw_samples")
        .select("uuid, value, received_at")
        .in("uuid", uuids)
        .gte("received_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("received_at", { ascending: false }),
      supabase
        .from("meter_period_totals")
        .select("meter_id, period_type, period_start, total_value, energy_type")
        .in("meter_id", meterIds)
        .in("period_type", ["day", "month", "year"])
        .in("period_start", [today, firstOfMonth, firstOfYear]),
    ]);

    // Letzten Bridge-Wert pro UUID extrahieren
    const bridgeLatest = new Map<string, { value: number; at: number }>();
    for (const row of bridgeRes.data ?? []) {
      const u = row.uuid.toLowerCase();
      if (bridgeLatest.has(u)) continue;
      bridgeLatest.set(u, { value: Number(row.value), at: new Date(row.received_at).getTime() });
    }

    // Letzten Polling-Wert pro Meter extrahieren
    const pollingLatest = new Map<string, { value: number; at: number }>();
    for (const row of powerRes.data ?? []) {
      if (pollingLatest.has(row.meter_id)) continue;
      pollingLatest.set(row.meter_id, { value: Number(row.power_value), at: new Date(row.recorded_at).getTime() });
    }

    const periodMap = new Map<string, { totalDay: number | null; totalMonth: number | null; totalYear: number | null }>();
    for (const row of periodRes.data ?? []) {
      const existing = periodMap.get(row.meter_id) ?? { totalDay: null, totalMonth: null, totalYear: null };
      if (row.period_type === "day" && row.period_start === today) existing.totalDay = row.total_value;
      if (row.period_type === "month" && row.period_start === firstOfMonth) existing.totalMonth = row.total_value;
      if (row.period_type === "year" && row.period_start === firstOfYear) existing.totalYear = row.total_value;
      periodMap.set(row.meter_id, existing);
    }

    setLiveValues((prev) => {
      const next = new Map(prev);
      for (const m of autoMeters) {
        const polling = pollingLatest.get(m.id);
        const bridge = bridgeLatest.get(m.sensor_uuid!.toLowerCase());
        let chosen: { value: number } | undefined;
        // Neueres Sample gewinnt; Bridge bei Gleichstand bevorzugt
        if (bridge && polling) {
          chosen = bridge.at >= polling.at ? bridge : polling;
        } else {
          chosen = bridge ?? polling;
        }
        if (!chosen) continue;
        const periods = periodMap.get(m.id) ?? { totalDay: null, totalMonth: null, totalYear: null };
        next.set(m.id, {
          value: chosen.value,
          unit: "",
          totalDay: periods.totalDay,
          totalWeek: null,
          totalMonth: periods.totalMonth,
          totalYear: periods.totalYear,
          meterReading: null,
          meterReadingUnit: "kWh",
        });
      }
      return next;
    });
    setLastRefresh(new Date());
    setLoadingLive(false);
  }, [meters]);


  // On mount: load only existing DB values, then subscribe to Loxone-WS-Bridge via Realtime-Broadcast.
  // Temporär: KEIN loxone-api/getSensors HTTP-Polling auf dieser Seite.
  useEffect(() => {
    if (meters.length === 0) return;

    loadInitialPowerValues();

    // uuid → meter_id Map (für schnelles Lookup im Broadcast-Handler)
    const uuidToMeterId = new Map<string, string>();
    for (const m of meters) {
      if (m.sensor_uuid) uuidToMeterId.set(m.sensor_uuid.toLowerCase(), m.id);
    }

    // Eindeutige tenant_ids der angezeigten Meter
    const tenantIds = [...new Set(meters.map((m) => m.tenant_id).filter(Boolean))] as string[];
    if (tenantIds.length === 0) return;

    // Pro Tenant einen Broadcast-Channel abonnieren
    const channels = tenantIds.map((tenantId) => {
      const channelName = `loxone-live-${tenantId}`;
      const ch = supabase
        .channel(channelName, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "readings" }, (msg: { payload: { events?: Array<{ uuid: string; value: number; at: string }> } }) => {
          const events = msg.payload?.events ?? [];
          if (events.length === 0) return;
          setLiveValues((prev) => {
            let changed = false;
            const next = new Map(prev);
            let unmatched = 0;
            for (const ev of events) {
              const meterId = uuidToMeterId.get(ev.uuid.toLowerCase());
              if (!meterId) { unmatched++; continue; }
              const existing = next.get(meterId);
              // Auch ohne initial geladenen DB-Wert den Live-Wert aus der WS-Bridge übernehmen.
              next.set(meterId, existing
                ? { ...existing, value: ev.value }
                : { value: ev.value, unit: "", totalDay: null, totalWeek: null, totalMonth: null, totalYear: null, meterReading: null, meterReadingUnit: "kWh" });
              changed = true;
            }
            if (unmatched > 0) {
              console.log(`[live-values] ${unmatched}/${events.length} broadcast events ohne passenden Zähler (UUID nicht gemappt).`);
            }
            return changed ? next : prev;
          });
          setLastRefresh(new Date());
        })
        .subscribe((status) => {
          console.log(`[live-values] channel ${channelName} status: ${status}`);
        });
      return ch;
    });

    return () => {
      for (const ch of channels) supabase.removeChannel(ch);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters.length]);

  // Manuell-Refresh-Button: temporär nur DB lesen, kein loxone-api/getSensors HTTP-Polling.
  const handleManualRefresh = useCallback(async () => {
    await loadInitialPowerValues();
  }, [loadInitialPowerValues]);



  // Filter meters
  const filteredMeters = useMemo(() => {
    return meters
      .filter((m) => !m.is_archived)
      .filter((m) => {
        if (selectedLocationId !== "all" && m.location_id !== selectedLocationId) return false;
        if (selectedEnergyType !== "all" && m.energy_type !== selectedEnergyType) return false;
        if (selectedCaptureType !== "all" && m.capture_type !== selectedCaptureType) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const loc = locations.find((l) => l.id === m.location_id);
          return (
            m.name.toLowerCase().includes(q) ||
            (m.meter_number || "").toLowerCase().includes(q) ||
            (loc?.name || "").toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [meters, selectedLocationId, selectedEnergyType, selectedCaptureType, searchQuery, locations]);

  // Helper to get a source meter's current value (live or manual)
  const getSourceValue = useCallback((meterId: string): number | null => {
    if (liveValues.has(meterId)) return liveValues.get(meterId)!.value;
    const manual = manualValues.get(meterId);
    if (manual) return manual.value;
    return null;
  }, [liveValues, manualValues]);

  // Helper to get a source meter's totalDay value
  const getSourceTotalDay = useCallback((meterId: string): number | null => {
    if (liveValues.has(meterId)) return liveValues.get(meterId)!.totalDay ?? null;
    return manualDailyTotals.get(meterId) ?? null;
  }, [liveValues, manualDailyTotals]);

  // Compute virtual meter values (instantaneous + daily total) — supports meter and CP sources (mixed)
  const virtualValues = useMemo(() => {
    const map = new Map<string, { value: number; totalDay: number | null; totalMonth: number | null; totalYear: number | null; meterReading: number | null }>();
    const virtualMeterIds = new Set(virtualSources.map((s) => s.virtual_meter_id));

    for (const vmId of virtualMeterIds) {
      const sources = virtualSources
        .filter((s) => s.virtual_meter_id === vmId)
        .sort((a, b) => a.sort_order - b.sort_order);

      let total = 0;
      let totalDay = 0;
      let allResolved = true;
      let allDayResolved = true;
      let hasMeterSource = false;

      for (const src of sources) {
        if (!src.source_meter_id) continue; // CP sources handled via cpVirtualValues
        hasMeterSource = true;
        const val = getSourceValue(src.source_meter_id);
        if (val === null) { allResolved = false; break; }
        total += src.operator === "-" ? -val : val;
        const dayVal = getSourceTotalDay(src.source_meter_id);
        if (dayVal === null) allDayResolved = false;
        else if (allDayResolved) totalDay += src.operator === "-" ? -dayVal : dayVal;
      }

      const cp = cpVirtualValues.get(vmId);
      if (!allResolved) continue;
      if (!hasMeterSource && !cp) continue;

      const finalValue = total + (cp?.value ?? 0);
      const finalDay = (hasMeterSource && !allDayResolved) ? null : (totalDay + (cp?.totalDay ?? 0));
      const finalMonth = cp?.totalMonth ?? null;
      const finalYear = cp?.totalYear ?? null;
      const finalReading = cp?.meterReading ?? null;

      map.set(vmId, { value: finalValue, totalDay: finalDay, totalMonth: finalMonth, totalYear: finalYear, meterReading: finalReading });
    }
    return map;
  }, [virtualSources, getSourceValue, getSourceTotalDay, cpVirtualValues]);

  const getValue = (meter: typeof meters[0]): { value: number | null; unit: string; totalDay: number | null; totalMonth: number | null; totalYear: number | null; meterReading: number | null; meterReadingUnit: string; source: "live" | "manual" | "virtual" | "none"; date?: string } => {
    if (meter.capture_type === "virtual" && virtualValues.has(meter.id)) {
      const vv = virtualValues.get(meter.id)!;
      return { value: vv.value, unit: "", totalDay: vv.totalDay, totalMonth: vv.totalMonth, totalYear: vv.totalYear, meterReading: vv.meterReading, meterReadingUnit: "kWh", source: "virtual" };
    }

    if (meter.capture_type === "automatic" && liveValues.has(meter.id)) {
      const live = liveValues.get(meter.id)!;
      return { value: live.value, unit: live.unit, totalDay: live.totalDay, totalMonth: live.totalMonth, totalYear: live.totalYear, meterReading: live.meterReading, meterReadingUnit: live.meterReadingUnit, source: "live" };
    }
    const manual = manualValues.get(meter.id);
    if (manual) {
      const dailyTotal = manualDailyTotals.get(meter.id) ?? null;
      return { value: manual.value, unit: meter.unit, totalDay: dailyTotal, totalMonth: null, totalYear: null, meterReading: null, meterReadingUnit: "", source: "manual", date: manual.date };
    }
    return { value: null, unit: "", totalDay: null, totalMonth: null, totalYear: null, meterReading: null, meterReadingUnit: "", source: "none" };
  };

  const dateLocale = language === "de" ? "de-DE" : language === "nl" ? "nl-NL" : language === "es" ? "es-ES" : "en-US";

  if (authLoading || locationsLoading || metersLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                {t("liveValues.title" as any)}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("liveValues.subtitle" as any)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-muted-foreground">
                  {t("common.refreshed" as any)}: {lastRefresh.toLocaleTimeString(dateLocale)}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={loadingLive}>
                <RefreshCw className={cn("h-4 w-4 mr-2", loadingLive && "animate-spin")} />
                {t("common.refresh" as any)}
              </Button>

            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("liveValues.searchMeters" as any)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("liveValues.allLocations" as any)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("liveValues.allLocations" as any)}</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedEnergyType} onValueChange={setSelectedEnergyType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("liveValues.allEnergyTypes" as any)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("liveValues.allEnergyTypes" as any)}</SelectItem>
                {Object.entries(ENERGY_TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCaptureType} onValueChange={setSelectedCaptureType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("liveValues.allTypes" as any)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("liveValues.allTypes" as any)}</SelectItem>
                <SelectItem value="automatic">{t("common.automatic" as any)}</SelectItem>
                <SelectItem value="manual">{t("common.manual" as any)}</SelectItem>
                <SelectItem value="virtual">{t("common.virtual" as any)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="h-4 w-4" />
            <span>{filteredMeters.length} {t("liveValues.meters" as any)}</span>
          </div>

          {/* Meter Cards */}
          {filteredMeters.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("liveValues.noMeters" as any)}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredMeters.map((meter) => {
                const { value, unit: sensorUnit, totalDay, totalMonth, totalYear, meterReading, meterReadingUnit, source, date } = getValue(meter);
                const config = ENERGY_TYPE_CONFIG[meter.energy_type] || ENERGY_TYPE_CONFIG.strom;
                const Icon = config.icon;
                const location = locations.find((l) => l.id === meter.location_id);
                const isFlowType = meter.energy_type === "wasser" || meter.energy_type === "gas";

                return (
                  <Card key={meter.id} className="relative overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className={cn("h-4 w-4 shrink-0", config.colorClass)} />
                          <CardTitle className="text-sm font-medium truncate">{meter.name}</CardTitle>
                        </div>
                        <Badge variant={source === "live" ? "default" : source === "virtual" ? "outline" : "secondary"} className="shrink-0 text-[10px] px-1.5 py-0">
                          {source === "live" ? "Live" : source === "virtual" ? t("common.virtual" as any) : source === "manual" ? t("common.manual" as any) : "–"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-2xl font-bold tracking-tight">
                          {value !== null ? (
                            <>
                              {meter.energy_type === "gas" ? (
                                <>
                                  {value.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                                  {isFlowType && (
                                    <span className="text-sm font-normal text-muted-foreground ml-1">{t("liveValues.flow" as any)}</span>
                                  )}
                                </>
                              ) : (
                                <>
                              {(() => {
                                    if (source === "live" && sensorUnit) {
                                      return `${value.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sensorUnit}`;
                                    }
                                    if (source === "live") {
                                      const srcPower = (meter as any).source_unit_power || "kW";
                                      if (srcPower === "W") {
                                        return `${(value / 1000).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW`;
                                      }
                                      return `${value.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW`;
                                    }
                                    return `${value.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${meter.unit}`;
                                  })()}
                                  {isFlowType && (
                                    <span className="text-sm font-normal text-muted-foreground ml-1">{t("liveValues.flow" as any)}</span>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground text-lg">{t("common.noValue" as any)}</span>
                          )}
                        </div>
                        {meter.energy_type === "gas" && value !== null && (
                          <div className="text-sm text-muted-foreground font-medium">
                            ≈ {formatGasDual(value, (meter as any).gas_type, (meter as any).brennwert, (meter as any).zustandszahl).kwhStr}
                          </div>
                        )}
                        {totalDay != null && totalDay !== undefined && (
                          <div className="text-sm text-muted-foreground font-medium">
                            {meter.energy_type === "gas" ? (
                              <>
                                {Number(totalDay).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                                <span className="ml-1 font-normal">{source === "manual" ? t("liveValues.consumption" as any) : t("liveValues.totalToday" as any)}</span>
                                <span className="ml-2 text-xs">
                                  (≈ {formatGasDual(Number(totalDay), (meter as any).gas_type, (meter as any).brennwert, (meter as any).zustandszahl).kwhStr})
                                </span>
                              </>
                            ) : meter.energy_type === "wasser" ? (
                              <>
                                {Number(totalDay).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
                                <span className="ml-1 font-normal">{source === "manual" ? t("liveValues.consumption" as any) : t("liveValues.totalToday" as any)}</span>
                              </>
                            ) : (
                              <>
                                {(() => {
                                  if (source === "manual") {
                                    return formatEnergy(Number(totalDay) * (meter.unit === "kWh" ? 1000 : 1));
                                  }
                                  const srcEnergy = (meter as any).source_unit_energy || "kWh";
                                  const factor = srcEnergy === "Wh" ? 1 : 1000;
                                  return formatEnergy(Number(totalDay) * factor);
                                })()}
                                <span className="ml-1 font-normal">{source === "manual" ? t("liveValues.consumption" as any) : t("liveValues.totalToday" as any)}</span>
                              </>
                            )}
                          </div>
                        )}
                        {(source === "live" || source === "virtual") && meterReading != null && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">
                              {meter.energy_type === "wasser" || meter.energy_type === "gas"
                                ? `${Number(meterReading).toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m³`
                                : source === "virtual"
                                  ? formatEnergy(Number(meterReading) * 1000)
                                  : formatEnergy(Number(meterReading) * (((meter as any).source_unit_energy || "kWh") === "Wh" ? 1 : 1000))}
                            </span>
                            <span className="ml-1 font-normal">{t("liveValues.meterReading" as any)}</span>
                          </div>
                        )}
                        {(source === "live" || source === "virtual") && (totalMonth != null || totalYear != null) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {totalMonth != null && (
                              <span>{t("liveValues.month" as any)}: {meter.energy_type === "wasser" || meter.energy_type === "gas"
                                ? `${Number(totalMonth).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³`
                                : source === "virtual"
                                  ? formatEnergy(Number(totalMonth) * 1000)
                                  : formatEnergy(Number(totalMonth) * (((meter as any).source_unit_energy || "kWh") === "Wh" ? 1 : 1000))}</span>
                            )}
                            {totalYear != null && (
                              <span>{t("liveValues.year" as any)}: {meter.energy_type === "wasser" || meter.energy_type === "gas"
                                ? `${Number(totalYear).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³`
                                : source === "virtual"
                                  ? formatEnergy(Number(totalYear) * 1000)
                                  : formatEnergy(Number(totalYear) * (((meter as any).source_unit_energy || "kWh") === "Wh" ? 1 : 1000))}</span>
                            )}
                          </div>
                        )}

                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground truncate">
                            {location?.name || "–"}
                          </p>
                          {meter.meter_number && (
                            <p className="text-xs text-muted-foreground">
                              Nr. {meter.meter_number}
                            </p>
                          )}
                          {source === "manual" && date && (
                            <p className="text-xs text-muted-foreground">
                              {t("liveValues.reading" as any)}: {new Date(date).toLocaleDateString(dateLocale)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LiveValues;
