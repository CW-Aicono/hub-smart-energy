import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMeters } from "@/hooks/useMeters";
import { useGatewayLivePower } from "@/hooks/useGatewayLivePower";
import { useRealtimePower } from "@/hooks/useRealtimePower";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { useTranslation } from "@/hooks/useTranslation";

const LANG_TO_LOCALE: Record<string, string> = { de: "de-DE", en: "en-US", es: "es-ES", nl: "nl-NL" };
import {
  EnergyFlowNode,
  EnergyFlowConnection,
  EnergyFlowNodeRole,
} from "@/hooks/useCustomWidgetDefinitions";
import { computeRadialDefault } from "@/lib/energyFlowLayout";

const CENTER_NODE_ID = "__center__";
import { buildLoxoneResolver } from "@/lib/loxoneUuidResolver";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  Legend,
  Label as AxisLabel,
  Tooltip as RTooltip,
} from "recharts";
import {
  Zap,
  Home,
  Battery,
  Car,
  Fan,
  PlugZap,
  SunMedium,
  Router,
  Maximize2,
  type LucideIcon,
} from "lucide-react";

/* ── Role → icon component (rendered as SVG so we can size fluid) ── */
const ROLE_ICON: Record<EnergyFlowNodeRole, LucideIcon> = {
  pv: SunMedium,
  grid: Zap,
  house: Home,
  battery: Battery,
  wallbox: Car,
  heatpump: Fan,
  consumer: PlugZap,
};

const ROLE_LABEL: Record<EnergyFlowNodeRole, string> = {
  pv: "PV-Erzeugung",
  grid: "Netz",
  house: "Verbrauch",
  battery: "Speicher",
  wallbox: "Wallbox",
  heatpump: "Wärmepumpe",
  consumer: "Verbraucher",
};

const PERIOD_SUM_LABEL: Record<TimePeriod, string> = {
  day: "Heute",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  all: "Gesamt",
};

function getDateRange(period: TimePeriod): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now);
  switch (period) {
    case "day": from.setHours(0, 0, 0, 0); break;
    case "week": from.setDate(from.getDate() - 7); break;
    case "month": from.setMonth(from.getMonth() - 1); break;
    case "quarter": from.setMonth(from.getMonth() - 3); break;
    case "year": from.setFullYear(from.getFullYear() - 1); break;
    case "all": from.setFullYear(from.getFullYear() - 5); break;
  }
  return { from, to: now };
}

/** YYYY-MM-DD in Europe/Berlin — vermeidet den UTC-Shift von toISOString(). */
function toBerlinDateString(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}


function fmtDe(n: number, digits = 1): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPower(watts: number): string {
  const abs = Math.abs(watts);
  const sign = watts < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${fmtDe(abs / 1_000_000, 2)} MW`;
  if (abs >= 1000) return `${sign}${fmtDe(abs / 1000, 2)} kW`;
  return `${sign}${Math.round(abs).toLocaleString("de-DE")} W`;
}

function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${fmtDe(kwh / 1000, 2)} MWh`;
  return `${fmtDe(kwh, 1)} kWh`;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

interface EnergyFlowMonitorProps {
  nodes: EnergyFlowNode[];
  connections: EnergyFlowConnection[];
  locationId?: string | null;
  gatewayDeviceIds?: string[];
}

type GatewayStatus = "online" | "offline" | "error" | "unknown";

function normalizeIntegrationStatus(row: any): GatewayStatus {
  if (!row?.is_enabled) return "offline";
  const syncStatus = String(row?.sync_status ?? "").toLowerCase();
  if (syncStatus === "error" || syncStatus === "failed" || syncStatus === "faulted") return "error";
  if (syncStatus === "success" || syncStatus === "online" || syncStatus === "connected") return "online";

  const lastSyncMs = row?.last_sync_at ? new Date(row.last_sync_at).getTime() : 0;
  const syncFresh = lastSyncMs > 0 && Date.now() - lastSyncMs < 30 * 60_000;
  if (syncStatus === "syncing" && syncFresh) return "online";
  if (syncFresh) return "online";

  // Enabled non-heartbeat integrations such as Loxone can deliver live data
  // without a gateway_devices row. Treat the configured data-source as linked.
  return "online";
}

function normalizeGatewayDeviceStatus(row: any): GatewayStatus {
  const raw = String(row?.status ?? "").toLowerCase();
  if (raw === "error" || raw === "faulted" || raw === "failed") return "error";
  const lastHeartbeat = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : 0;
  const stale = !lastHeartbeat || Date.now() - lastHeartbeat > 3 * 60_000;
  if (raw === "online" && !stale) return "online";
  return "offline";
}

export default function EnergyFlowMonitor({
  nodes,
  connections,
  locationId,
  gatewayDeviceIds: configuredGatewayDeviceIds = [],
}: EnergyFlowMonitorProps) {
  const { selectedPeriod } = useDashboardFilter();
  const { meters } = useMeters();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 500, h: 320 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<EnergyFlowNode | null>(null);
  const [gatewayDetailOpen, setGatewayDetailOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const meterIds = useMemo(() => nodes.map((n) => n.meter_id).filter(Boolean), [nodes]);
  const relevantMeters = useMemo(
    () => (meters || []).filter((m: any) => meterIds.includes(m.id)),
    [meters, meterIds],
  );

  const { livePowerByMeter } = useGatewayLivePower(relevantMeters as any);
  const { latestByMeter } = useRealtimePower(meterIds);

  const { from, to } = useMemo(() => getDateRange(selectedPeriod), [selectedPeriod]);
  const { data: periodSums = {} } = useQuery({
    queryKey: ["energyflow-sums", meterIds, selectedPeriod],
    queryFn: async () => {
      if (!meterIds.length) return {};
      const { data } = await supabase.rpc("get_meter_daily_totals_with_fallback" as any, {
        p_meter_ids: meterIds,
        p_from_date: toBerlinDateString(from),
        p_to_date: toBerlinDateString(to),
      });
      if (!data) return {};
      const sums: Record<string, number> = {};
      for (const row of data) {
        sums[row.meter_id] = (sums[row.meter_id] ?? 0) + row.total_value;
      }
      return sums;
    },
    enabled: meterIds.length > 0,
    staleTime: 60_000,
  });

  // Battery SOC per meter (for role === "battery" nodes).
  // Link: energy_storages.location_id === meters.location_id (bevorzugt gateway_device_id match).
  const batteryMeterInfo = useMemo(() => {
    const info: Array<{ meterId: string; locationId: string | null; gatewayDeviceId: string | null }> = [];
    for (const node of nodes) {
      if (node.role !== "battery" || !node.meter_id) continue;
      const m = (relevantMeters as any[]).find((x) => x.id === node.meter_id);
      if (!m) continue;
      info.push({
        meterId: node.meter_id,
        locationId: m.location_id ?? null,
        gatewayDeviceId: m.gateway_device_id ?? null,
      });
    }
    return info;
  }, [nodes, relevantMeters]);

  const batteryLocationIds = useMemo(
    () => Array.from(new Set(batteryMeterInfo.map((b) => b.locationId).filter(Boolean))) as string[],
    [batteryMeterInfo],
  );
  const batteryLocKey = batteryLocationIds.slice().sort().join(",");

  const { data: socByMeter = {} } = useQuery({
    queryKey: ["energyflow-soc", batteryLocKey, batteryMeterInfo.map((b) => b.meterId).join(",")],
    enabled: batteryLocationIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await supabase
        .from("energy_storages")
        .select("id, location_id, gateway_device_id, power_meter_id, current_soc_pct")
        .in("location_id", batteryLocationIds);
      const rows = (data ?? []) as any[];
      const result: Record<string, number> = {};
      for (const b of batteryMeterInfo) {
        const match =
          rows.find((r) => r.power_meter_id && r.power_meter_id === b.meterId) ??
          rows.find((r) => r.gateway_device_id && r.gateway_device_id === b.gatewayDeviceId) ??
          rows.find((r) => r.location_id === b.locationId);
        if (match && match.current_soc_pct != null) {
          result[b.meterId] = Number(match.current_soc_pct);
        }
      }
      return result;
    },
  });


  // Loxone-Resolver: bildet Bridge-Sub-Output-UUIDs (Broadcast + Seed)
  // auf Meter-IDs ab. Nutzt exakten Match für Nicht-Loxone-Zähler und
  // Family+Nearest-3rd-Segment für Loxone (analog bridge-aggregator).
  const resolver = useMemo(
    () => buildLoxoneResolver(
      (relevantMeters as any[]).map((m) => ({
        id: m.id,
        tenant_id: m.tenant_id ?? null,
        energy_type: m.energy_type ?? null,
        sensor_uuid: m.sensor_uuid ?? null,
      })),
    ),
    [relevantMeters],
  );
  const tenantIds = useMemo(
    () => Array.from(new Set((relevantMeters as any[]).map((m) => m.tenant_id).filter(Boolean))) as string[],
    [relevantMeters],
  );

  // Seed A: meter_power_readings (60-min Fenster – Polling-Ingest-Pfad, z. B. Shelly/Gateway)
  const meterKey = useMemo(() => meterIds.slice().sort().join(","), [meterIds]);
  const { data: seedByMeter = {} } = useQuery({
    queryKey: ["energyflow-seed", meterKey],
    enabled: meterIds.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value, recorded_at")
        .in("meter_id", meterIds)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(2000);
      const latest: Record<string, number> = {};
      for (const row of data ?? []) {
        if (latest[row.meter_id] === undefined) {
          latest[row.meter_id] = Number(row.power_value);
        }
      }
      return latest;
    },
  });

  // Seed B: bridge_raw_samples (Loxone WS-Bridge – hier landen Live-Leistungen aus Loxone).
  // Wir laden über Family-Prefixe (nicht über exakte Meter-UUIDs), damit auch die
  // Sub-Output-UUIDs des WS-Workers gefunden werden. Die Auflösung passiert
  // clientseitig durch den `resolver`.
  const familyKey = useMemo(() => resolver.familyPrefixes.slice().sort().join(","), [resolver]);
  const tenantKey = tenantIds.join(",");
  const { data: bridgeByMeter = {} } = useQuery({
    queryKey: ["energyflow-bridge", familyKey, tenantKey],
    enabled: resolver.familyPrefixes.length > 0 && tenantIds.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const orExpr = resolver.familyPrefixes
        .map((p) => `uuid.ilike.${p}%`)
        .join(",");
      const { data } = await (supabase
        .from("bridge_raw_samples" as any)
        .select("uuid, value, received_at, tenant_id")
        .in("tenant_id", tenantIds)
        .or(orExpr)
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(4000));
      const latest: Record<string, number> = {};
      for (const row of ((data as any[]) ?? [])) {
        const value = Number(row.value);
        const meterId = resolver.resolve(String(row.uuid), row.tenant_id ?? null, value);
        if (!meterId) continue;
        if (latest[meterId] === undefined) {
          latest[meterId] = value;
        }
      }
      return latest;
    },
  });

  // Gateway-Status für den zentralen Knoten. Wir sammeln alle gateway_device_ids
  // der beteiligten Zähler UND als Fallback alle location_ids, um Gateways derselben
  // Location zu finden (bei manuellen/Loxone-Metern ohne direkte gateway_device_id).
  const meterGatewayDeviceIds = useMemo(
    () =>
      Array.from(
        new Set(
          (relevantMeters as any[])
            .map((m) => m.gateway_device_id)
            .filter((v): v is string => !!v),
        ),
      ),
    [relevantMeters],
  );
  const meterLocationIds = useMemo(
    () =>
      Array.from(
        new Set(
          (relevantMeters as any[])
            .map((m) => m.location_id)
            .filter((v): v is string => !!v),
        ),
      ),
    [relevantMeters],
  );
  const configuredGatewayIds = useMemo(
    () => Array.from(new Set((configuredGatewayDeviceIds || []).filter(Boolean))),
    [configuredGatewayDeviceIds],
  );
  const scopedLocationIds = useMemo(
    () => Array.from(new Set([locationId, ...meterLocationIds].filter(Boolean))) as string[],
    [locationId, meterLocationIds],
  );
  const gatewayKey = useMemo(
    () => Array.from(new Set([...meterGatewayDeviceIds, ...configuredGatewayIds])).sort().join(","),
    [meterGatewayDeviceIds, configuredGatewayIds],
  );
  const locationKey = scopedLocationIds.slice().sort().join(",");
  const { data: gatewayDevices = [] } = useQuery({
    queryKey: ["energyflow-gateway-devices", gatewayKey, locationKey],
    enabled: gatewayKey.length > 0 || scopedLocationIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Array<any>> => {
      const byId = new Map<string, any>();
      const integrationsById = new Map<string, any>();
      const selectedIntegrationIds = new Set<string>();
      const allScopeIds = Array.from(new Set([...meterGatewayDeviceIds, ...configuredGatewayIds]));

      const addIntegrationRows = (rows: any[] | null) => {
        for (const row of rows ?? []) {
          integrationsById.set(row.id, row);
          if (configuredGatewayIds.includes(row.id)) selectedIntegrationIds.add(row.id);
        }
      };

      if (configuredGatewayIds.length > 0) {
        const { data } = await supabase
          .from("location_integrations")
          .select("id, location_id, is_enabled, sync_status, last_sync_at, config, integrations(name, type)")
          .in("id", configuredGatewayIds);
        addIntegrationRows(data as any[] | null);
      }

      if (scopedLocationIds.length > 0) {
        const { data } = await supabase
          .from("location_integrations")
          .select("id, location_id, is_enabled, sync_status, last_sync_at, config, integrations(name, type)")
          .in("location_id", scopedLocationIds)
          .eq("is_enabled", true);
        addIntegrationRows(data as any[] | null);
      }

      const integrationIds = Array.from(integrationsById.keys());

      const addGatewayDeviceRows = (rows: any[] | null) => {
        for (const r of rows ?? []) {
          if (
            selectedIntegrationIds.size > 0 &&
            r.location_integration_id &&
            !selectedIntegrationIds.has(r.location_integration_id)
          ) {
            continue;
          }
          const integration = r.location_integration_id ? integrationsById.get(r.location_integration_id) : null;
          const effectiveStatus = normalizeGatewayDeviceStatus(r);
          byId.set(r.id, {
            ...r,
            source: "gateway_device",
            status: r.status || effectiveStatus,
            effective_status: effectiveStatus,
            sync_status: integration?.sync_status ?? null,
            last_sync_at: integration?.last_sync_at ?? null,
          });
        }
      };

      if (allScopeIds.length > 0) {
        const { data } = await supabase
          .from("gateway_devices")
          .select("id, device_name, device_type, local_ip, mac_address, ha_version, addon_version, latest_available_version, status, last_heartbeat_at, offline_buffer_count, location_integration_id")
          .in("id", allScopeIds);
        addGatewayDeviceRows(data as any[] | null);
      }

      const gatewayDeviceIntegrationIds = selectedIntegrationIds.size > 0
        ? Array.from(selectedIntegrationIds)
        : integrationIds;

      if (gatewayDeviceIntegrationIds.length > 0) {
        const { data } = await supabase
          .from("gateway_devices")
          .select("id, device_name, device_type, local_ip, mac_address, ha_version, addon_version, latest_available_version, status, last_heartbeat_at, offline_buffer_count, location_integration_id")
          .in("location_integration_id", gatewayDeviceIntegrationIds);
        addGatewayDeviceRows(data as any[] | null);
      }

      const deviceIntegrationIds = new Set(
        Array.from(byId.values())
          .map((d: any) => d.location_integration_id)
          .filter(Boolean),
      );

      for (const li of integrationsById.values()) {
        if (deviceIntegrationIds.has(li.id)) continue;
        if (selectedIntegrationIds.size > 0 && !selectedIntegrationIds.has(li.id)) continue;

        const integrationName = li.integrations?.name || li.integrations?.type || "Integration";
        const configName = (li.config as any)?.device_name || (li.config as any)?.name;
        const effectiveStatus = normalizeIntegrationStatus(li);
        byId.set(`integration:${li.id}`, {
          id: li.id,
          source: "location_integration",
          location_integration_id: li.id,
          device_name: configName || integrationName,
          device_type: integrationName,
          status: effectiveStatus,
          effective_status: effectiveStatus,
          local_ip: null,
          mac_address: null,
          ha_version: null,
          addon_version: null,
          latest_available_version: null,
          last_heartbeat_at: null,
          last_sync_at: li.last_sync_at ?? null,
          sync_status: li.sync_status ?? null,
          offline_buffer_count: 0,
        });
      }

      return Array.from(byId.values());
    },
  });

  const gatewayStatus: GatewayStatus = useMemo(() => {
    if (gatewayDevices.length === 0) return "unknown";
    const normalized = gatewayDevices.map((g: any) => {
      if (g.effective_status) return g.effective_status as GatewayStatus;
      const s = String(g.status ?? "").toLowerCase();
      if (s === "online") return "online";
      if (s === "error" || s === "faulted") return "error";
      return "offline";
    });
    if (normalized.some((s) => s === "offline")) return "offline";
    if (normalized.some((s) => s === "error")) return "error";
    return "online";
  }, [gatewayDevices]);

  const gatewayStatusColor =
    gatewayStatus === "online"
      ? "hsl(152 55% 42%)"
      : gatewayStatus === "offline"
        ? "hsl(0 72% 55%)"
        : gatewayStatus === "error"
          ? "hsl(45 95% 50%)"
          : "hsl(var(--muted-foreground))";

  // Realtime: Loxone broadcast (loxone-live-{tenantId}) – sub-sekündliche Updates
  const [broadcastByMeter, setBroadcastByMeter] = useState<Record<string, number>>({});
  const [broadcastSocByMeter, setBroadcastSocByMeter] = useState<Record<string, number>>({});
  useEffect(() => {
    if (tenantIds.length === 0 || resolver.exactByUuid.size === 0) return;
    const channels = tenantIds.map((tenantId) =>
      supabase
        .channel(`loxone-live-${tenantId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "readings" }, (msg: any) => {
          const events = msg?.payload?.events ?? [];
          if (!events.length) return;
          setBroadcastByMeter((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const ev of events) {
              const role = ev.role ?? "pwr";
              if (role !== "pwr") continue;
              const value = Number(ev.value);
              if (!Number.isFinite(value) || Math.abs(value) > 10_000) continue;
              const meterId = resolver.resolve(String(ev.uuid), tenantId, value);
              if (!meterId) continue;
              next[meterId] = value;
              changed = true;
            }
            return changed ? next : prev;
          });
          setBroadcastSocByMeter((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const ev of events) {
              const role = ev.role ?? "pwr";
              if (role !== "soc") continue;
              const value = Number(ev.value);
              if (!Number.isFinite(value) || value < 0 || value > 100) continue;
              // SOC hat eigene UUID-Familie, kein Nearest-Match — nur exact.
              const meter = resolver.exactByUuid.get(String(ev.uuid).toLowerCase());
              if (!meter) continue;
              next[meter.id] = value;
              changed = true;
            }
            return changed ? next : prev;
          });
        })
        .subscribe(),
    );
    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey, resolver]);

  const getLiveWatts = useCallback(
    (meterId: string): number | null => {
      // Priorität: Loxone-Broadcast → Realtime → Gateway-API → Bridge-Seed → Polling-Seed
      // (alle Seeds/Broadcast liefern kW; Realtime liefert bereits kW aus meter_power_readings.)
      if (broadcastByMeter[meterId] != null) return broadcastByMeter[meterId] * 1000;
      if (latestByMeter[meterId] != null) return latestByMeter[meterId] * 1000;
      const gw = livePowerByMeter[meterId];
      if (gw) {
        if (gw.unit === "kW") return gw.value * 1000;
        if (gw.unit === "MW") return gw.value * 1_000_000;
        return gw.value;
      }
      if (bridgeByMeter[meterId] != null) return bridgeByMeter[meterId] * 1000;
      const seed = seedByMeter[meterId];
      if (seed != null) return seed * 1000;
      return null;
    },
    [broadcastByMeter, latestByMeter, livePowerByMeter, bridgeByMeter, seedByMeter],
  );

  const getSocPct = useCallback(
    (meterId: string): number | null => broadcastSocByMeter[meterId] ?? socByMeter[meterId] ?? null,
    [broadcastSocByMeter, socByMeter],
  );

  const hasLive = useMemo(
    () => meterIds.some(
      (id) =>
        broadcastByMeter[id] != null ||
        latestByMeter[id] != null ||
        livePowerByMeter[id] != null ||
        bridgeByMeter[id] != null ||
        seedByMeter[id] != null,
    ),
    [meterIds, broadcastByMeter, latestByMeter, livePowerByMeter, bridgeByMeter, seedByMeter],
  );

  const { language } = useTranslation();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  useEffect(() => {
    if (hasLive) setLastUpdate(new Date());
  }, [hasLive, broadcastByMeter, latestByMeter, livePowerByMeter, bridgeByMeter, seedByMeter]);
  const lastUpdateStr = useMemo(() => {
    if (!lastUpdate) return null;
    try {
      return new Intl.DateTimeFormat(LANG_TO_LOCALE[language] ?? "de-DE", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(lastUpdate);
    } catch { return lastUpdate.toLocaleTimeString(); }
  }, [lastUpdate, language]);




  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const nodeRadius = Math.min(dims.w, dims.h) * 0.09;
  const centerRadius = Math.max(10, nodeRadius * 0.55);
  const iconSize = Math.round(nodeRadius * 1.1);

  // Layout-Knoten: fehlende oder Default-Positionen (50/50) werden radial verteilt.
  const layoutUserNodes = useMemo<EnergyFlowNode[]>(() => {
    return nodes.map((n, i) => {
      const missing =
        typeof n.x !== "number" ||
        typeof n.y !== "number" ||
        (n.x === 50 && n.y === 50);
      if (!missing) return n;
      const p = computeRadialDefault(i, nodes.length);
      return { ...n, x: p.x, y: p.y };
    });
  }, [nodes]);

  // Zentraler Knoten (implizit, unbeschriftet, nicht klickbar).
  const centerNode: EnergyFlowNode = useMemo(
    () => ({
      id: CENTER_NODE_ID,
      role: "consumer",
      label: "",
      meter_id: "",
      color: "hsl(var(--muted-foreground))",
      x: 50,
      y: 50,
    }),
    [],
  );

  const lookupNodes = useMemo(
    () => [centerNode, ...layoutUserNodes],
    [centerNode, layoutUserNodes],
  );

  // Verbindungen werden automatisch erzeugt: jeder User-Knoten ↔ Zentrum.
  // Die gespeicherte `connections`-Prop wird bewusst ignoriert.
  const derivedConnections = useMemo<EnergyFlowConnection[]>(
    () => layoutUserNodes.map((n) => ({ from: n.id, to: CENTER_NODE_ID })),
    [layoutUserNodes],
  );


  const nodePos = useCallback(
    (node: EnergyFlowNode) => ({
      x: (node.x / 100) * dims.w,
      y: (node.y / 100) * dims.h,
    }),
    [dims],
  );

  const getClippedLine = useCallback(
    (fromNode: EnergyFlowNode, toNode: EnergyFlowNode) => {
      const p1 = nodePos(fromNode);
      const p2 = nodePos(toNode);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, dist: 0, mx: p1.x, my: p1.y };
      const ux = dx / dist;
      const uy = dy / dist;
      const rFrom = fromNode.id === CENTER_NODE_ID ? centerRadius : nodeRadius;
      const rTo = toNode.id === CENTER_NODE_ID ? centerRadius : nodeRadius;
      return {
        x1: p1.x + ux * rFrom,
        y1: p1.y + uy * rFrom,
        x2: p2.x - ux * rTo,
        y2: p2.y - uy * rTo,
        dist: dist - rFrom - rTo,
        mx: (p1.x + p2.x) / 2,
        my: (p1.y + p2.y) / 2,
      };
    },
    [nodePos, nodeRadius, centerRadius],
  );

  const getAnimDuration = useCallback((watts: number | null): number => {
    const abs = watts != null ? Math.abs(watts) : 0;
    if (abs <= 0) return 40;
    return Math.max(2.5, 40 - Math.log10(Math.max(abs, 1)) * 11);
  }, []);

  // Autarkie/Eigenverbrauch werden in der Gebäude-Detailansicht (MeterDetailDialog,
  // role === "house") auf Energiemengen (kWh) über das gewählte Zeitfenster berechnet,
  // nicht mehr live im Flow-Widget.


  const selectedNode = selectedNodeId ? layoutUserNodes.find((n) => n.id === selectedNodeId) ?? null : null;

  if (!nodes.length) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Keine Knoten konfiguriert
      </div>
    );
  }

  return (
    <div className="relative w-full h-72">
      {/* Live-Badge */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border bg-background/70 backdrop-blur px-2 py-0.5 text-[10px] text-muted-foreground">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            hasLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
          }`}
        />
        {hasLive ? "Live" : "Offline"}
        {lastUpdateStr && (
          <span className="tabular-nums opacity-80">· {lastUpdateStr}</span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {derivedConnections.map((conn, i) => {
            const fromNode = lookupNodes.find((n) => n.id === conn.from);
            const toNode = lookupNodes.find((n) => n.id === conn.to);
            if (!fromNode || !toNode) return null;
            return (
              <linearGradient key={`grad-${i}`} id={`flow-grad-${i}`} gradientUnits="userSpaceOnUse"
                x1={nodePos(fromNode).x} y1={nodePos(fromNode).y}
                x2={nodePos(toNode).x} y2={nodePos(toNode).y}>
                <stop offset="0%" stopColor={fromNode.color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={toNode.color} stopOpacity={0.9} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Connections (auto: user-node ↔ center) */}
        {derivedConnections.map((conn, i) => {
          const fromNode = lookupNodes.find((n) => n.id === conn.from);
          const toNode = lookupNodes.find((n) => n.id === conn.to);

          if (!fromNode || !toNode) return null;

          const { x1, y1, x2, y2, dist, mx, my } = getClippedLine(fromNode, toNode);
          if (dist <= 0) return null;

          const rawWatts = getLiveWatts(fromNode.meter_id);
          // Flussrichtung folgt der pro Zähler konfigurierten Vorzeichenkonvention
          // (Feld `flow_direction_convention` auf meters, analog zur Loxone-Einstellung
          // "Leistung/Durchfluss Richtung"):
          //   - "negative_delivery" (Default): negativ = Lieferung/vom Gerät weg,
          //                                    positiv = Bezug/zum Gerät hin
          //   - "positive_delivery":            umgekehrt
          const meterRow = (relevantMeters as any[]).find((m) => m.id === fromNode.meter_id);
          const convention: "negative_delivery" | "positive_delivery" =
            (meterRow?.flow_direction_convention as any) || "negative_delivery";
          const flowWatts = rawWatts;
          const hasFlow = flowWatts != null && Math.abs(flowWatts) > 0;
          const dur = getAnimDuration(flowWatts);
          // Partikel laufen von fromNode → toNode ("vom Gerät weg"), wenn der Wert
          // Lieferung bedeutet. Bei Bezug wird die Animation umgekehrt.
          const isDelivery =
            flowWatts != null &&
            (convention === "negative_delivery" ? flowWatts < 0 : flowWatts > 0);
          const isReversed = hasFlow && !isDelivery;

          const animPath = isReversed
            ? `M${x2},${y2} L${x1},${y1}`
            : `M${x1},${y1} L${x2},${y2}`;

          // Farbe der Linie & des Partikels = Farbe des äußeren (Nicht-Zentrum-)Knotens.
          const outerNode = fromNode.id === CENTER_NODE_ID ? toNode : fromNode;
          const sourceColor = outerNode.color;
          const particleR = Math.min(5, 3 + Math.log10(Math.abs(flowWatts ?? 0) + 10) * 0.4);

          return (
            <g key={i}>
              {/* Base line: always solid, colored by outer node when active, muted when idle */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={hasFlow ? sourceColor : "hsl(var(--muted-foreground))"}
                strokeWidth={hasFlow ? 2 : 1.5}
                strokeOpacity={hasFlow ? 0.55 : 0.25}
              />
              {/* Ein einzelner Partikel; Geschwindigkeit spiegelt die Leistung wider.
                  Fade-in 300ms am Start, Fade-out 300ms am Ziel; ein neuer Partikel
                  startet erst nach Abschluss des Fadeouts. */}
              {hasFlow && !reducedMotion && (() => {
                const fade = 0.3; // Sekunden
                const total = dur + fade * 2;
                const t1 = (fade / total).toFixed(4);
                const t2 = ((fade + dur) / total).toFixed(4);
                return (
                  <circle r={particleR} fill={sourceColor} opacity={0}>
                    <animateMotion
                      dur={`${total}s`}
                      repeatCount="indefinite"
                      path={animPath}
                      rotate="auto"
                      keyPoints="0;0;1;1"
                      keyTimes={`0;${t1};${t2};1`}
                      calcMode="linear"
                    />
                    <animate
                      attributeName="opacity"
                      dur={`${total}s`}
                      repeatCount="indefinite"
                      values="0;0.95;0.95;0"
                      keyTimes={`0;${t1};${t2};1`}
                      calcMode="linear"
                    />
                  </circle>
                );
              })()}
              {/* Flow label at midpoint */}
              {hasFlow && (
                <g transform={`translate(${mx}, ${my})`}>
                  <rect
                    x={-26} y={-9}
                    width={52} height={18}
                    rx={9}
                    fill="hsl(var(--background))"
                    stroke={sourceColor}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <text
                    x={0} y={4}
                    textAnchor="middle"
                    className="fill-foreground text-[10px] font-semibold tabular-nums"
                  >
                    {formatPower(Math.abs(flowWatts!))}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <style>{`
          @keyframes energyflow-dash {
            to { stroke-dashoffset: -44; }
          }
        `}</style>

        {/* Zentraler Knoten – zeigt Gateway-Status (grün/rot/gelb). */}
        {(() => {
          const { x: ccx, y: ccy } = nodePos(centerNode);
          const gwIconSize = Math.max(14, Math.round(centerRadius * 1.1));
          const title =
            gatewayStatus === "online" ? "Gateway online"
            : gatewayStatus === "offline" ? "Gateway offline"
            : gatewayStatus === "error" ? "Gateway-Fehler"
            : "Gateway-Status unbekannt";
          return (
            <g
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={title}
              onClick={() => setGatewayDetailOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setGatewayDetailOpen(true);
                }
              }}
            >
              <title>{title}</title>
              <circle
                cx={ccx}
                cy={ccy}
                r={centerRadius}
                fill={gatewayStatusColor}
                fillOpacity={0.15}
                stroke={gatewayStatusColor}
                strokeOpacity={0.9}
                strokeWidth={2}
              />
              <foreignObject
                x={ccx - gwIconSize / 2}
                y={ccy - gwIconSize / 2}
                width={gwIconSize}
                height={gwIconSize}
                className="pointer-events-none"
              >
                <div
                  style={{ color: gatewayStatusColor, width: gwIconSize, height: gwIconSize }}
                  className="flex items-center justify-center"
                >
                  <Router size={Math.round(gwIconSize * 0.7)} />
                </div>
              </foreignObject>
            </g>
          );
        })()}

        {/* Nodes */}
        {layoutUserNodes.map((node) => {
          const { x: cx, y: cy } = nodePos(node);
          const liveW = getLiveWatts(node.meter_id);
          const periodSum = periodSums[node.meter_id];
          const isActive = liveW != null && Math.abs(liveW) > 0;
          const Icon = ROLE_ICON[node.role];
          const isSelected = selectedNodeId === node.id;

          // Label side: default "bottom"; flip to "top" if any adjacent connection
          // leaves this node downward (angle in [45°, 135°]) — avoids overlap with flow.
          let labelSide: "top" | "bottom" = "bottom";
          for (const conn of derivedConnections) {
            let neighborId: string | null = null;
            if (conn.from === node.id) neighborId = conn.to;
            else if (conn.to === node.id) neighborId = conn.from;
            if (!neighborId) continue;
            const neighbor = lookupNodes.find((n) => n.id === neighborId);
            if (!neighbor) continue;
            const np = nodePos(neighbor);
            const angleDeg = (Math.atan2(np.y - cy, np.x - cx) * 180) / Math.PI;
            if (angleDeg >= 45 && angleDeg <= 135) {
              labelSide = "top";
              break;
            }
          }
          const labelY = labelSide === "bottom" ? cy + nodeRadius + 14 : cy - nodeRadius - 22;
          const sumY   = labelSide === "bottom" ? cy + nodeRadius + 28 : cy - nodeRadius - 8;


          return (
            <g
              key={node.id}
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${ROLE_LABEL[node.role]} ${node.label}${liveW != null ? `, ${formatPower(liveW)}` : ""}`}
              onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedNodeId(isSelected ? null : node.id);
                }
              }}
            >
              {/* Subtle glow ring when active */}
              {isActive && !reducedMotion && (
                <circle
                  cx={cx} cy={cy} r={nodeRadius + 4}
                  fill="none"
                  stroke={node.color}
                  strokeOpacity={0.35}
                  strokeWidth={2}
                  style={{ animation: "energyflow-pulse 2.4s ease-in-out infinite" }}
                />
              )}
              <circle
                cx={cx} cy={cy} r={nodeRadius}
                fill={node.color}
                fillOpacity={isActive ? 0.14 : 0.05}
                stroke={node.color}
                strokeOpacity={isActive ? 1 : 0.45}
                strokeWidth={isSelected ? 3.5 : 2.5}
              />
              {/* Icon centered */}
              <foreignObject
                x={cx - iconSize / 2}
                y={cy - iconSize / 2}
                width={iconSize}
                height={iconSize}
                className="pointer-events-none"
              >
                <div
                  style={{ color: node.color, width: iconSize, height: iconSize }}
                  className="flex items-center justify-center"
                >
                  <Icon size={Math.round(iconSize * 0.72)} />
                </div>
              </foreignObject>

              {/* Label + Periodensumme, dynamisch oben oder unten */}
              <text
                x={cx} y={labelY}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-medium"
              >
                {node.label}
              </text>
              {periodSum != null && periodSum !== 0 && node.role !== "battery" && (
                <text
                  x={cx} y={sumY}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {PERIOD_SUM_LABEL[selectedPeriod]}: {periodSum < 0 ? "−" : ""}{formatEnergy(Math.abs(periodSum))}
                </text>
              )}
              {node.role === "battery" && getSocPct(node.meter_id) != null && (
                <text
                  x={cx} y={sumY}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  SOC: {fmtDe(getSocPct(node.meter_id) ?? 0, 0)} %
                </text>
              )}
            </g>
          );
        })}

        <style>{`
          @keyframes energyflow-pulse {
            0%, 100% { stroke-opacity: 0.15; transform-origin: center; }
            50% { stroke-opacity: 0.55; }
          }
        `}</style>
      </svg>




      {/* Detail-Popover als Overlay (Portal via Radix) */}
      {selectedNode && (
        <NodeDetailOverlay
          node={selectedNode}
          liveWatts={getLiveWatts(selectedNode.meter_id)}
          periodSum={periodSums[selectedNode.meter_id]}
          periodLabel={PERIOD_SUM_LABEL[selectedPeriod]}
          socPct={getSocPct(selectedNode.meter_id)}
          allNodes={layoutUserNodes}
          getLiveWatts={getLiveWatts}
          anchor={{
            x: (selectedNode.x / 100) * dims.w,
            y: (selectedNode.y / 100) * dims.h,
            w: dims.w,
            h: dims.h,
          }}
          onClose={() => setSelectedNodeId(null)}
          onOpenDetail={(n) => {
            setDetailNode(n);
            setSelectedNodeId(null);
          }}
        />
      )}

      {detailNode && (
        <MeterDetailDialog
          node={detailNode}
          socPct={getSocPct(detailNode.meter_id)}
          allNodes={nodes}
          metersById={Object.fromEntries((relevantMeters as any[]).map((m) => [m.id, m]))}
          onClose={() => setDetailNode(null)}
        />
      )}

      {gatewayDetailOpen && (
        <GatewayDetailDialog
          devices={gatewayDevices as any[]}
          status={gatewayStatus}
          statusColor={gatewayStatusColor}
          onClose={() => setGatewayDetailOpen(false)}
        />
      )}

    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Detail Overlay                                          */
/* ─────────────────────────────────────────────────────── */

interface NodeDetailOverlayProps {
  node: EnergyFlowNode;
  liveWatts: number | null;
  periodSum: number | undefined;
  periodLabel: string;
  socPct?: number | null;
  allNodes: EnergyFlowNode[];
  getLiveWatts: (id: string) => number | null;
  anchor: { x: number; y: number; w: number; h: number };
  onClose: () => void;
  onOpenDetail: (node: EnergyFlowNode) => void;
}

function NodeDetailOverlay({
  node,
  liveWatts,
  periodSum,
  periodLabel,
  socPct,
  allNodes,
  getLiveWatts,
  anchor,
  onClose,
  onOpenDetail,
}: NodeDetailOverlayProps) {
  const Icon = ROLE_ICON[node.role];

  // Anteil am Fluss (heuristisch, wenn PV+house vorhanden)
  const share = useMemo(() => {
    if (node.role !== "pv") return null;
    const house = allNodes.find((n) => n.role === "house");
    if (!house) return null;
    const pvW = Math.max(0, liveWatts ?? 0);
    const houseW = Math.max(0, getLiveWatts(house.meter_id) ?? 0);
    if (houseW <= 0) return null;
    return Math.min(100, (pvW / houseW) * 100);
  }, [node, allNodes, liveWatts, getLiveWatts]);

  // Sparkline: letzte 24 h
  const { data: sparkline = [] } = useQuery({
    queryKey: ["energyflow-sparkline", node.meter_id],
    queryFn: async () => {
      if (!node.meter_id) return [];
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data } = await supabase
        .from("meter_power_readings")
        .select("recorded_at, power_value")
        .eq("meter_id", node.meter_id)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(500);
      return (data ?? []).map((r: any) => ({
        t: new Date(r.recorded_at).getTime(),
        v: Number(r.power_value) * 1000, // kW → W
      }));
    },
    enabled: !!node.meter_id,
    staleTime: 60_000,
  });

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span
          style={{
            position: "absolute",
            left: anchor.x,
            top: anchor.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={16}
        className="w-72 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: `${node.color}22`, color: node.color }}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{ROLE_LABEL[node.role]}</div>
            <div className="text-sm font-semibold truncate">{node.label}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Aktuell</div>
            <div
              className={`text-sm font-semibold tabular-nums ${
                liveWatts != null && liveWatts < 0 ? "text-emerald-500" : ""
              }`}
            >
              {liveWatts != null ? formatPower(liveWatts) : "–"}
            </div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">{periodLabel}</div>
            <div className="text-sm font-semibold tabular-nums">
              {periodSum != null ? `${periodSum < 0 ? "−" : ""}${formatEnergy(Math.abs(periodSum))}` : "–"}
            </div>
        </div>

        {node.role === "battery" && socPct != null && (
          <div className="rounded-md border p-2 text-xs mb-3">
            <div className="text-muted-foreground">Ladezustand (SOC)</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, socPct))}%`,
                    backgroundColor: node.color,
                  }}
                />
              </div>
              <div className="text-sm font-semibold tabular-nums">{fmtDe(socPct, 0)} %</div>
            </div>
          </div>
        )}
        </div>

        {share != null && (
          <div className="text-[11px] text-muted-foreground mb-2">
            PV deckt aktuell{" "}
            <span className="font-semibold text-foreground">{fmtDe(share, 0)} %</span>{" "}
            des Verbrauchs.
          </div>
        )}

        <div className="h-20 -mx-1">
          {sparkline.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${node.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={node.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={node.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <RTooltip
                  contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                  labelFormatter={(v) =>
                    new Date(v as number).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  formatter={(v: any) => [formatPower(Number(v)), "Leistung"]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={node.color}
                  strokeWidth={1.5}
                  fill={`url(#spark-${node.id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
              Keine Daten für die letzten 24 h
            </div>
          )}
        </div>

        {node.meter_id && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 h-7 text-xs"
            onClick={() => onOpenDetail(node)}
          >
            Detailansicht
            <Maximize2 className="ml-1 h-3 w-3" />
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Großer Detail-Dialog mit ausführlichen Graphen          */
/* ─────────────────────────────────────────────────────── */

type DetailRange = "1h" | "24h" | "7d" | "30d";

type StorageDetailInfo = {
  id: string;
  created_at: string;
  current_soc_pct: number | null;
  soc_sensor_uuid: string | null;
  soc_updated_at: string | null;
  power_meter_id: string | null;
};

const RANGE_LABEL: Record<DetailRange, string> = {
  "1h": "1 Stunde",
  "24h": "24 Stunden",
  "7d": "7 Tage",
  "30d": "30 Tage",
};

const RANGE_MS: Record<DetailRange, number> = {
  "1h": 3600_000,
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

export function MeterDetailDialog({
  node,
  socPct,
  allNodes = [],
  metersById = {},
  onClose,
}: {
  node: EnergyFlowNode;
  socPct?: number | null;
  allNodes?: EnergyFlowNode[];
  metersById?: Record<string, any>;
  onClose: () => void;
}) {

  const Icon = ROLE_ICON[node.role];
  const [range, setRange] = useState<DetailRange>("24h");

  const isBattery = node.role === "battery";
  const isHouse = node.role === "house";


  const { data: storageInfo, isLoading: isStorageLoading } = useQuery({
    queryKey: ["meter-detail-storage-info", node.meter_id],
    enabled: isBattery && !!node.meter_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StorageDetailInfo | null> => {
      const { data } = await supabase
        .from("energy_storages")
        .select("id, created_at, current_soc_pct, soc_sensor_uuid, soc_updated_at, power_meter_id")
        .eq("power_meter_id", node.meter_id)
        .maybeSingle();
      return (data as StorageDetailInfo | null) ?? null;
    },
  });

  const visibleStartMs = useMemo(() => {
    const rangeStart = Date.now() - RANGE_MS[range];
    if (!isBattery || !storageInfo?.created_at) return rangeStart;
    const storageStart = new Date(storageInfo.created_at).getTime();
    return Number.isFinite(storageStart) ? Math.max(rangeStart, storageStart) : rangeStart;
  }, [isBattery, range, storageInfo?.created_at]);

  const effectiveSocPct = storageInfo?.current_soc_pct != null
    ? Number(storageInfo.current_soc_pct)
    : socPct;

  const { data: series = [], isLoading } = useQuery({
    queryKey: ["meter-detail-series", node.meter_id, range, visibleStartMs],
    queryFn: async () => {
      if (!node.meter_id) return [];
      const since = new Date(visibleStartMs).toISOString();
      const limit = range === "30d" ? 8000 : range === "7d" ? 5000 : 2000;
      const pageSize = 1000;
      const rows: any[] = [];
      for (let offset = 0; offset < limit; offset += pageSize) {
        const to = Math.min(offset + pageSize, limit) - 1;
        const { data, error } = await supabase
          .from("meter_power_readings")
          .select("recorded_at, power_value")
          .eq("meter_id", node.meter_id)
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: true })
          .range(offset, to);
        if (error || !data || data.length === 0) break;
        rows.push(...data);
        if (data.length < to - offset + 1) break;
      }
      return rows.map((r: any) => ({
        t: new Date(r.recorded_at).getTime(),
        // kW aus der DB (power_value ist bereits kW)
        kw: Number(r.power_value),
      }));
    },
    enabled: !!node.meter_id && (!isBattery || !isStorageLoading),
    staleTime: 30_000,
  });

  // Echte SOC-Historie: wird ab jetzt separat persistiert, damit Power/kW-Werte
  // nicht mehr fälschlich als Ladezustand (%) interpretiert werden.
  const { data: socSeries = [] } = useQuery({
    queryKey: ["meter-detail-soc-readings", storageInfo?.id, range, visibleStartMs],
    enabled: isBattery && !!storageInfo?.id && (!isStorageLoading),
    staleTime: 30_000,
    queryFn: async () => {
      const since = new Date(visibleStartMs).toISOString();
      const limit = range === "30d" ? 8000 : range === "7d" ? 5000 : 2000;
      const pageSize = 1000;
      const rows: any[] = [];
      for (let offset = 0; offset < limit; offset += pageSize) {
        const to = Math.min(offset + pageSize, limit) - 1;
        const { data, error } = await ((supabase as any)
          .from("storage_soc_readings")
          .select("recorded_at, soc_pct")
          .eq("storage_id", storageInfo!.id)
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: true })
          .range(offset, to));
        if (error || !data || data.length === 0) break;
        rows.push(...data);
        if (data.length < to - offset + 1) break;
      }
      return rows
        .map((r: any) => ({ t: new Date(r.recorded_at).getTime(), soc: Number(r.soc_pct) }))
        .filter((d) => Number.isFinite(d.soc) && d.soc >= 0 && d.soc <= 100);
    },
  });

  // Power- und SOC-Reihen auf gemeinsame Zeit-Buckets mergen. Die Ingest-Pfade
  // für Power und SOC schreiben ~500 ms versetzt, daher würde ein Merge auf
  // exakter Millisekunde jeden Punkt entweder nur mit `kw` oder nur mit `soc`
  // füllen — mit `connectNulls={false}` wäre die SOC-Linie danach unsichtbar.
  const mergedSeries = useMemo(() => {
    const bucketMs =
      range === "1h" ? 60_000
      : range === "24h" ? 5 * 60_000
      : range === "7d" ? 15 * 60_000
      : 60 * 60_000;
    const map = new Map<number, { t: number; kw: number | null; soc: number | null }>();
    const put = (rawT: number, patch: { kw?: number | null; soc?: number | null }) => {
      const key = Math.round(rawT / bucketMs) * bucketMs;
      const cur = map.get(key) ?? { t: key, kw: null, soc: null };
      if (patch.kw != null && Number.isFinite(patch.kw)) cur.kw = patch.kw;
      if (patch.soc != null && Number.isFinite(patch.soc)) cur.soc = patch.soc;
      map.set(key, cur);
    };
    for (const p of series) put(p.t, { kw: p.kw });
    for (const s of socSeries) put(s.t, { soc: s.soc });
    return Array.from(map.values()).sort((a, b) => a.t - b.t);
  }, [series, socSeries, range]);
  const hasSoc = socSeries.length > 0;
  const hasSocLine = socSeries.length >= 2;
  // Rechte SOC-Achse auch dann anzeigen, wenn nur der aktuelle SOC bekannt ist.
  const showSocAxis = hasSoc || (isBattery && effectiveSocPct != null);


  const stats = useMemo(() => {
    if (!series.length) return null;
    const vals = series.map((d) => d.kw);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const bidirectional = min < -0.001 && max > 0.001;
    return { min, max, avg, bidirectional };
  }, [series]);

  // Energie pro Bucket via Trapez-Integration – prefilled über den gesamten Zeitraum
  const energyBuckets = useMemo(() => {
    const bucketMs =
      range === "1h" ? 5 * 60_000
      : range === "24h" ? 60 * 60_000
      : range === "7d" ? 6 * 60 * 60_000
      : 24 * 60 * 60_000;
    const now = Date.now();
    const startAligned = Math.floor(visibleStartMs / bucketMs) * bucketMs;
    const endAligned = Math.floor(now / bucketMs) * bucketMs;
    const map = new Map<number, { import: number; export: number }>();
    // Alle Buckets vorab mit 0 initialisieren, damit keine Lücken entstehen
    for (let k = startAligned; k <= endAligned; k += bucketMs) {
      map.set(k, { import: 0, export: 0 });
    }
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1];
      const b = series[i];
      const dtH = (b.t - a.t) / 3_600_000;
      if (dtH <= 0 || dtH > 1) continue; // echte Datenlücken überspringen
      const kw = (a.kw + b.kw) / 2;
      const kwh = kw * dtH;
      const bucketKey = Math.floor(b.t / bucketMs) * bucketMs;
      const cur = map.get(bucketKey) ?? { import: 0, export: 0 };
      if (kwh >= 0) cur.import += kwh;
      else cur.export += -kwh;
      map.set(bucketKey, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ t, import: v.import, export: v.export }));
  }, [series, range, visibleStartMs]);

  const fmtTime = (t: number) => {
    const d = new Date(t);
    if (range === "1h" || range === "24h") {
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  };

  const fmtDeNum = (n: number, digits = 2) =>
    n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const totalImport = energyBuckets.reduce((s, b) => s + b.import, 0);
  const totalExport = energyBuckets.reduce((s, b) => s + b.export, 0);

  // Gemeinsame Zeitachse für beide Charts
  const xDomain = useMemo<[number, number]>(() => {
    const now = Date.now();
    return [now - RANGE_MS[range], now];
  }, [range]);
  const xTicks = useMemo(() => {
    const step =
      range === "1h" ? 10 * 60_000
      : range === "24h" ? 3 * 60 * 60_000
      : range === "7d" ? 24 * 60 * 60_000
      : 7 * 24 * 60 * 60_000;
    const ticks: number[] = [];
    const start = Math.ceil(xDomain[0] / step) * step;
    for (let t = start; t <= xDomain[1]; t += step) ticks.push(t);
    return ticks;
  }, [xDomain, range]);
  const firstPowerTs = mergedSeries.find((d) => d.kw != null)?.t;
  const firstSocTs = mergedSeries.find((d) => d.soc != null)?.t;
  const fmtHintTime = (t: number) => {
    const d = new Date(t);
    if (range === "1h" || range === "24h") {
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  };
  const powerLate = firstPowerTs != null && firstPowerTs - xDomain[0] > 60 * 60_000;
  const socLate = firstSocTs != null && firstSocTs - xDomain[0] > 60 * 60_000;
  const gapHintText = (() => {
    if (powerLate && socLate && hasSoc) {
      return `Leistung ab ${fmtHintTime(firstPowerTs!)} · SOC ab ${fmtHintTime(firstSocTs!)}`;
    }
    if (powerLate && hasSoc) return `Leistung ab ${fmtHintTime(firstPowerTs!)} (SOC älter verfügbar)`;
    const anyTs = firstPowerTs ?? firstSocTs;
    if (anyTs != null && anyTs - xDomain[0] > 60 * 60_000) {
      return `Daten ab ${fmtHintTime(anyTs)}`;
    }
    return "";
  })();
  const showGapHint = gapHintText.length > 0;



  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${node.color}22`, color: node.color }}
            >
              <Icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{node.label}</DialogTitle>
              <DialogDescription>
                {ROLE_LABEL[node.role]}
                {isBattery && effectiveSocPct != null && (
                  <> · Ladezustand aktuell <span className="font-semibold text-foreground">{fmtDeNum(effectiveSocPct, 0)} %</span></>
                )}
              </DialogDescription>
            </div>
            {isBattery && effectiveSocPct != null && (
              <Badge variant="secondary" className="tabular-nums">SOC {fmtDeNum(effectiveSocPct, 0)} %</Badge>
            )}
          </div>
        </DialogHeader>

        {/* Zeitraum-Umschalter */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RANGE_LABEL) as DetailRange[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? "default" : "outline"}
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </div>

        {/* KPI-Kacheln */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Ø Leistung</div>
            <div className="text-base font-semibold tabular-nums">
              {stats ? `${fmtDeNum(stats.avg)} kW` : "–"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Max</div>
            <div className="text-base font-semibold tabular-nums">
              {stats ? `${fmtDeNum(stats.max)} kW` : "–"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Min</div>
            <div className="text-base font-semibold tabular-nums">
              {stats ? `${fmtDeNum(stats.min)} kW` : "–"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">
              Energie{stats?.bidirectional ? " (Bezug/Einspeisung)" : ""}
            </div>
            <div className="text-base font-semibold tabular-nums">
              {stats?.bidirectional
                ? `${fmtDeNum(totalImport)} / ${fmtDeNum(totalExport)} kWh`
                : `${fmtDeNum(totalImport - totalExport)} kWh`}
            </div>
          </div>
        </div>

        {isHouse && (
          <HouseSelfSufficiencyPanel
            allNodes={allNodes}
            metersById={metersById}
            visibleStartMs={visibleStartMs}
            rangeLabel={RANGE_LABEL[range]}
          />
        )}

        {/* Chart 1: Leistungsverlauf (+ optional SOC bei Speichern) */}

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              Leistungsverlauf{showSocAxis ? " & Ladezustand" : ""} · {RANGE_LABEL[range]}
            </div>
            {!hasSoc && showSocAxis && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                SOC-Historie ab dem nächsten Gateway-Wert
              </Badge>
            )}
          </div>
          <div className="h-[320px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Lade Daten…
              </div>
            ) : mergedSeries.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Keine Daten im gewählten Zeitraum
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mergedSeries} margin={{ top: 8, right: showSocAxis ? 60 : 16, left: 8, bottom: 28 }}>
                  <defs>
                    <linearGradient id={`det-${node.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={node.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={node.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={xDomain}
                    ticks={xTicks}
                    scale="time"
                    tickFormatter={fmtTime}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    allowDataOverflow
                    height={40}
                  >
                    <AxisLabel value={gapHintText ? `Zeit — ${gapHintText}` : "Zeit"} position="insideBottom" offset={-4} style={{ fontSize: 11 }} />
                  </XAxis>
                  <YAxis
                    yAxisId="kw"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.toLocaleString("de-DE")}
                    width={70}
                  >
                    <AxisLabel value="Leistung (kW)" angle={-90} position="insideLeft" style={{ fontSize: 11, textAnchor: "middle" }} />
                  </YAxis>
                  {showSocAxis && (
                    <YAxis
                      yAxisId="soc"
                      orientation="right"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}`}
                      width={50}
                    >
                      <AxisLabel value="SOC (%)" angle={-90} position="insideRight" style={{ fontSize: 11, textAnchor: "middle" }} />

                    </YAxis>
                  )}
                  {stats?.bidirectional && <ReferenceLine yAxisId="kw" y={0} stroke="hsl(var(--muted-foreground))" />}
                  {showSocAxis && (socSeries.length === 1 || (!hasSoc && effectiveSocPct != null)) && (
                    <ReferenceDot
                      yAxisId="soc"
                      x={socSeries[0]?.t ?? xDomain[1]}
                      y={Math.max(0, Math.min(100, socSeries[0]?.soc ?? effectiveSocPct ?? 0))}
                      r={5}
                      fill="hsl(217 91% 60%)"
                      stroke="hsl(217 91% 60%)"
                      isFront
                      label={{
                        value: `SOC aktuell: ${fmtDeNum(socSeries[0]?.soc ?? effectiveSocPct ?? 0, 0)} %`,
                        position: "left",
                        fill: "hsl(217 91% 60%)",
                        fontSize: 11,
                      }}
                    />
                  )}
                  <RTooltip
                    contentStyle={{ fontSize: 11 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const kwEntry = payload.find((p: any) => p.dataKey === "kw");
                      const socEntry = payload.find((p: any) => p.dataKey === "soc");
                      const kw = kwEntry?.value;
                      const soc = socEntry?.value;
                      return (
                        <div className="rounded-md border bg-background/95 px-2 py-1.5 text-[11px] shadow-md">
                          <div className="mb-1 text-muted-foreground">
                            {new Date(label as number).toLocaleString("de-DE", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </div>
                          {kw != null && (
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: node.color }} />
                              <span>Leistung: <span className="font-medium tabular-nums">{fmtDeNum(Number(kw))} kW</span></span>
                            </div>
                          )}
                          {soc != null && (
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "hsl(217 91% 60%)" }} />
                              <span>SOC: <span className="font-medium tabular-nums">{fmtDeNum(Number(soc), 0)} %</span></span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {hasSocLine && (
                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                      formatter={(v) => (v === "soc" ? "Ladezustand (SOC %)" : "Leistung (kW)")}
                    />
                  )}
                  <Area
                    yAxisId="kw"
                    type="monotone"
                    dataKey="kw"
                    stroke={node.color}
                    strokeWidth={1.8}
                    fill={`url(#det-${node.id})`}
                    isAnimationActive={false}
                    connectNulls
                    name="kw"
                  />
                  {hasSocLine && (
                    <Line
                      yAxisId="soc"
                      type="monotone"
                      dataKey="soc"
                      stroke="hsl(217 91% 60%)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      isAnimationActive={false}
                      connectNulls={false}
                      name="soc"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>


        {/* Chart 2: Energie pro Bucket */}
        {energyBuckets.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-1">
              Energie pro {range === "1h" ? "5 Min" : range === "24h" ? "Stunde" : range === "7d" ? "6 h" : "Tag"}
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={energyBuckets.map((b) => ({ t: b.t, import: b.import, exportNeg: -b.export }))}
                  margin={{ top: 8, right: showSocAxis ? 60 : 16, left: 8, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={xDomain}
                    ticks={xTicks}
                    scale="time"
                    tickFormatter={fmtTime}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    allowDataOverflow
                    height={40}
                  >
                    <AxisLabel value="Zeit" position="insideBottom" offset={-4} style={{ fontSize: 11 }} />
                  </XAxis>
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => Math.abs(Number(v)).toLocaleString("de-DE")}
                    domain={[
                      (dataMin: number) => (Number.isFinite(dataMin) ? Math.min(0, dataMin) : 0),
                      (dataMax: number) => (Number.isFinite(dataMax) ? Math.max(0, dataMax) : 0),
                    ]}
                    width={70}
                  >
                    <AxisLabel value="Energie (kWh)" angle={-90} position="insideLeft" style={{ fontSize: 11, textAnchor: "middle" }} />
                  </YAxis>
                  {stats?.bidirectional && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />}
                  <RTooltip
                    contentStyle={{ fontSize: 11 }}
                    labelFormatter={(v) => new Date(v as number).toLocaleString("de-DE")}
                    formatter={(v: any, name: string) => [
                      `${fmtDeNum(Math.abs(Number(v)))} kWh`,
                      name === "import" ? "Bezug" : "Einspeisung",
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                    formatter={(v) => (v === "import" ? "Bezug" : "Einspeisung")}
                  />
                  <Bar dataKey="import" fill={node.color} />
                  {stats?.bidirectional && (
                    <Bar dataKey="exportNeg" fill="hsl(152 55% 42%)" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Details-Fußzeile */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pt-2 border-t">
          <div>
            <div className="text-muted-foreground">Rolle</div>
            <div className="font-medium">{ROLE_LABEL[node.role]}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Datenpunkte</div>
            <div className="font-medium tabular-nums">{series.length.toLocaleString("de-DE")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Letzter Wert</div>
            <div className="font-medium">
              {series.length ? new Date(series[series.length - 1].t).toLocaleString("de-DE") : "–"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground">Meter-ID</div>
            <div className="font-mono text-[10px] truncate" title={node.meter_id}>{node.meter_id || "–"}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Autarkie & Eigenverbrauch (Gebäude-Detailansicht)       */
/* ─────────────────────────────────────────────────────── */

function HouseSelfSufficiencyPanel({
  allNodes,
  metersById,
  visibleStartMs,
  rangeLabel,
}: {
  allNodes: EnergyFlowNode[];
  metersById: Record<string, any>;
  visibleStartMs: number;
  rangeLabel: string;
}) {
  const pvNodes = allNodes.filter((n) => n.role === "pv" && n.meter_id);
  const gridNodes = allNodes.filter((n) => n.role === "grid" && n.meter_id);
  const batteryNodes = allNodes.filter((n) => n.role === "battery" && n.meter_id);

  const involvedMeterIds = useMemo(
    () => [...pvNodes, ...gridNodes, ...batteryNodes].map((n) => n.meter_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pvNodes.map((n) => n.meter_id).join(","), gridNodes.map((n) => n.meter_id).join(","), batteryNodes.map((n) => n.meter_id).join(",")],
  );

  const { data: seriesByMeter = {}, isLoading } = useQuery({
    queryKey: ["house-selfsuff-series", involvedMeterIds, visibleStartMs],
    enabled: involvedMeterIds.length > 0 && (pvNodes.length > 0 || gridNodes.length > 0),
    staleTime: 30_000,
    queryFn: async () => {
      const since = new Date(visibleStartMs).toISOString();
      const result: Record<string, { t: number; kw: number }[]> = {};
      await Promise.all(
        involvedMeterIds.map(async (mid) => {
          const { data } = await supabase
            .from("meter_power_readings")
            .select("recorded_at, power_value")
            .eq("meter_id", mid)
            .gte("recorded_at", since)
            .order("recorded_at", { ascending: true })
            .limit(3000);
          result[mid] = (data ?? []).map((r: any) => ({
            t: new Date(r.recorded_at).getTime(),
            kw: Number(r.power_value),
          }));
        }),
      );
      return result;
    },
  });

  // Vorzeichen laut Zähler-Konvention normalisieren, sodass +kW bei
  // Netz = Bezug, bei PV = Erzeugung, bei Speicher = Ladung bedeutet.
  const normalizedKw = (meterId: string, kw: number): number => {
    const conv = metersById[meterId]?.flow_direction_convention || "negative_delivery";
    // Default: negativ = Lieferung/vom Gerät weg, positiv = Bezug/zum Gerät hin.
    // Bei "positive_delivery" ist es umgekehrt → Vorzeichen flippen.
    return conv === "positive_delivery" ? -kw : kw;
  };

  // Trapez-Integration: liefert getrennte positive/negative kWh-Anteile
  // (positiv = Zufluss zum Gerät, negativ = Abfluss vom Gerät).
  const integrate = (rows: { t: number; kw: number }[], meterId: string) => {
    let pos = 0;
    let neg = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      const dtH = (b.t - a.t) / 3_600_000;
      if (dtH <= 0 || dtH > 1) continue; // Datenlücken ignorieren
      const kw = (normalizedKw(meterId, a.kw) + normalizedKw(meterId, b.kw)) / 2;
      const kwh = kw * dtH;
      if (kwh >= 0) pos += kwh;
      else neg += -kwh;
    }
    return { pos, neg };
  };

  const kpi = useMemo(() => {
    if (pvNodes.length === 0 && gridNodes.length === 0) return null;
    let ePv = 0;
    for (const n of pvNodes) {
      const { pos } = integrate(seriesByMeter[n.meter_id] ?? [], n.meter_id);
      ePv += pos;
    }
    let eGridImport = 0;
    let eGridExport = 0;
    for (const n of gridNodes) {
      const { pos, neg } = integrate(seriesByMeter[n.meter_id] ?? [], n.meter_id);
      eGridImport += pos;
      eGridExport += neg;
    }
    let eBattCharge = 0;
    let eBattDischarge = 0;
    for (const n of batteryNodes) {
      const { pos, neg } = integrate(seriesByMeter[n.meter_id] ?? [], n.meter_id);
      eBattCharge += pos;
      eBattDischarge += neg;
    }
    const eLoad = Math.max(
      0,
      ePv + eGridImport + eBattDischarge - eGridExport - eBattCharge,
    );
    const clamp01 = (x: number) => Math.max(0, Math.min(100, x));
    const autarkie = eLoad > 0 ? clamp01(((eLoad - eGridImport) / eLoad) * 100) : null;
    const eigenverbrauch = ePv > 0 ? clamp01(((ePv - eGridExport) / ePv) * 100) : null;
    return { autarkie, eigenverbrauch, ePv, eGridImport, eGridExport, eLoad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesByMeter, pvNodes.length, gridNodes.length, batteryNodes.length]);

  if (pvNodes.length === 0 && gridNodes.length === 0) return null;

  const fmtPct = (v: number | null) =>
    v == null ? "–" : `${v.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;
  const fmtKwh = (v: number) =>
    `${v.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} kWh`;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-sm font-medium">
        Autarkie & Eigenverbrauch · {rangeLabel}
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Lade Daten…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Autarkiegrad</div>
            <div className="text-base font-semibold tabular-nums">{fmtPct(kpi?.autarkie ?? null)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Eigenverbrauch / Gesamtverbrauch</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Eigenverbrauchsquote</div>
            <div className="text-base font-semibold tabular-nums">{fmtPct(kpi?.eigenverbrauch ?? null)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Selbst genutzte PV / PV-Erzeugung</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">PV-Erzeugung</div>
            <div className="text-base font-semibold tabular-nums">{kpi ? fmtKwh(kpi.ePv) : "–"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Netz Bezug / Einspeisung</div>
            <div className="text-base font-semibold tabular-nums">
              {kpi ? `${fmtKwh(kpi.eGridImport)} / ${fmtKwh(kpi.eGridExport)}` : "–"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Gateway Detail Dialog                                   */
/* ─────────────────────────────────────────────────────── */

interface GatewayDetailDialogProps {
  devices: any[];
  status: GatewayStatus;
  statusColor: string;
  onClose: () => void;
}

function GatewayDetailDialog({ devices, status, statusColor, onClose }: GatewayDetailDialogProps) {
  const statusLabel =
    status === "online" ? "Online"
    : status === "offline" ? "Offline"
    : status === "error" ? "Fehler"
    : "Unbekannt";

  const fmtBerlin = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "short",
        timeStyle: "medium",
      });
    } catch { return iso; }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2"
              style={{ color: statusColor, borderColor: statusColor, backgroundColor: `${statusColor}22` }}
            >
              <Router size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>Gateway</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                Status: {statusLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {devices.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Kein Gateway mit den ausgewählten Zählern verknüpft.
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {devices.map((d) => {
              const effectiveStatus = String(d.effective_status || d.status || "unknown").toLowerCase();
              const color =
                effectiveStatus === "online" ? "hsl(152 55% 42%)"
                : effectiveStatus === "error" || effectiveStatus === "faulted" ? "hsl(45 95% 50%)"
                : "hsl(0 72% 55%)";
              return (
                <div key={d.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">{d.device_name || "Gateway"}</div>
                    <Badge variant="outline" style={{ color, borderColor: color }}>
                      {effectiveStatus === "online" ? "Online"
                        : effectiveStatus === "error" || effectiveStatus === "faulted" ? "Fehler"
                        : "Offline"}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {d.device_type && (<><dt className="text-muted-foreground">Typ</dt><dd className="tabular-nums">{d.device_type}</dd></>)}
                    {d.local_ip && (<><dt className="text-muted-foreground">Lokale IP</dt><dd className="tabular-nums">{d.local_ip}</dd></>)}
                    {d.mac_address && (<><dt className="text-muted-foreground">MAC</dt><dd className="tabular-nums text-xs">{d.mac_address}</dd></>)}
                    {d.ha_version && (<><dt className="text-muted-foreground">HA-Version</dt><dd className="tabular-nums">{d.ha_version}</dd></>)}
                    {d.addon_version && (
                      <>
                        <dt className="text-muted-foreground">Add-on-Version</dt>
                        <dd className="tabular-nums">
                          {d.addon_version}
                          {d.latest_available_version && d.latest_available_version !== d.addon_version && (
                            <span className="ml-1 text-xs text-muted-foreground">(verfügbar: {d.latest_available_version})</span>
                          )}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">{d.last_heartbeat_at ? "Letzter Heartbeat" : "Letzter Sync"}</dt>
                    <dd className="tabular-nums">{fmtBerlin(d.last_heartbeat_at || d.last_sync_at)}</dd>
                    {typeof d.offline_buffer_count === "number" && d.offline_buffer_count > 0 && (
                      <><dt className="text-muted-foreground">Offline-Puffer</dt><dd className="tabular-nums">{d.offline_buffer_count.toLocaleString("de-DE")}</dd></>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


