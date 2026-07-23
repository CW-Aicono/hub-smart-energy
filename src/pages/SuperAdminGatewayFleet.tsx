import { Navigate, useSearchParams } from "react-router-dom";
import WorkerControlsPanel from "@/components/super-admin/WorkerControlsPanel";
import WorkerKeyPanel from "@/components/super-admin/WorkerKeyPanel";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, RefreshCw, RocketIcon, CheckCircle2, XCircle, Clock, Loader2, ChevronRight, ChevronDown, Radio, Activity, AlertCircle, Search } from "lucide-react";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface FleetDevice {
  id: string;
  tenant_id: string | null;
  device_name: string;
  device_type: string;
  status: string;
  addon_version: string | null;
  latest_available_version: string | null;
  ha_version: string | null;
  last_heartbeat_at: string | null;
  auto_update_enabled: boolean;
  update_channel: string;
  last_update_attempt_at: string | null;
  last_update_error: string | null;
  location_id: string | null;
  location_name: string | null;
  local_ip: string | null;
  mac_address: string | null;
  ws_connected_since: string | null;
  last_ws_ping_at: string | null;
  offline_buffer_count: number | null;
  local_time: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ReleaseChannel {
  id: string;
  channel: string;
  version: string;
  image_ref: string;
  release_notes: string | null;
  is_latest: boolean;
  released_at: string;
}

interface UpdateJob {
  id: string;
  gateway_device_id: string;
  target_version: string;
  image_ref: string;
  channel: string;
  status: string;
  triggered_by: string;
  log_excerpt: string | null;
  error_message: string | null;
  dispatched_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface LoxoneSessionRow {
  id: string;
  tenant_id: string;
  location_integration_id: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  events_received: number | null;
  reconnect_count: number | null;
  worker_host: string | null;
  disconnect_reason: string | null;
}

interface LoxoneDetails {
  integrationId: string;
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
  eventsReceived: number | null;
  reconnectCount: number | null;
  disconnectReason: string | null;
  serials: string[];
}

interface UnifiedRow {
  key: string;
  type: "AICONO EMS" | "Loxone Miniserver";
  tenantName: string;
  locationName: string;
  status: "active" | "stale" | "disconnected" | "online" | "offline" | "unknown";
  statusLabel: string;
  connectedSince: string | null;
  lastHeartbeat: string | null;
  heartbeatAgeMs: number | null;
  eventsLast24h: number | null;
  reconnectsLast24h: number | null;
  uptimeRatio24h: number | null;
  sessionsLast24h: number | null;
  worker: string | null;
  lastDisconnect: string | null;
  serials: string[];
  device?: FleetDevice;
  loxone?: LoxoneDetails;
}


const LOOKBACK_MS = 24 * 60 * 60 * 1000;
// Loxone worker heartbeat = 5 min; threshold 6 min so display stays green between beats.
const LOXONE_FRESH_HEARTBEAT_MS = 360_000;
// AICONO gateway heartbeat threshold (3 min — see status-monitoring-logic memory).
const AICONO_FRESH_HEARTBEAT_MS = 180_000;

async function callControl(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("gateway-update-control", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

async function fetchLoxoneRows(): Promise<UnifiedRow[]> {
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data: sessions, error: sErr } = await supabase
    .from("loxone_ws_session_log")
    .select("id, tenant_id, location_integration_id, started_at, ended_at, updated_at, events_received, reconnect_count, worker_host, disconnect_reason")
    .or(`started_at.gte.${sinceIso},ended_at.is.null`)
    .order("started_at", { ascending: false });
  if (sErr) throw sErr;
  const rows = (sessions ?? []) as LoxoneSessionRow[];
  const integrationIds = Array.from(new Set(rows.map((r) => r.location_integration_id)));
  if (integrationIds.length === 0) return [];

  const { data: integrations } = await supabase
    .from("location_integrations").select("id, location_id").in("id", integrationIds);
  const locationIds = Array.from(new Set((integrations ?? []).map((i: any) => i.location_id).filter(Boolean)));
  const { data: locations } = locationIds.length
    ? await supabase.from("locations").select("id, name, tenant_id").in("id", locationIds)
    : { data: [] as any[] };
  const tenantIds = Array.from(new Set((locations ?? []).map((l: any) => l.tenant_id).filter(Boolean)));
  const { data: tenants } = tenantIds.length
    ? await supabase.from("tenants").select("id, name").in("id", tenantIds)
    : { data: [] as any[] };

  // Miniserver-Seriennummern pro (tenant_id, location_id) auflösen
  const { data: links } = tenantIds.length && locationIds.length
    ? await supabase
        .from("bridge_miniserver_links")
        .select("tenant_id, location_id, miniserver_serial")
        .in("tenant_id", tenantIds)
        .in("location_id", locationIds)
    : { data: [] as any[] };
  const serialsByKey = new Map<string, string[]>();
  (links ?? []).forEach((l: any) => {
    if (!l.tenant_id || !l.location_id || !l.miniserver_serial) return;
    const k = `${l.tenant_id}:${l.location_id}`;
    const arr = serialsByKey.get(k) ?? [];
    if (!arr.includes(l.miniserver_serial)) arr.push(l.miniserver_serial);
    serialsByKey.set(k, arr);
  });

  const locById = new Map((locations ?? []).map((l: any) => [l.id, l]));
  const tenantById = new Map((tenants ?? []).map((t: any) => [t.id, t]));
  const infoMap = new Map<string, { tenant: string; location: string; serials: string[] }>();
  (integrations ?? []).forEach((it: any) => {
    const loc: any = locById.get(it.location_id);
    const tenant: any = loc ? tenantById.get(loc.tenant_id) : null;
    const serials = loc && tenant ? (serialsByKey.get(`${tenant.id}:${loc.id}`) ?? []) : [];
    infoMap.set(it.id, { tenant: tenant?.name ?? "—", location: loc?.name ?? "—", serials });
  });


  const now = Date.now();
  const windowStart = now - LOOKBACK_MS;
  const result: UnifiedRow[] = [];
  for (const intId of integrationIds) {
    const intSessions = rows.filter((r) => r.location_integration_id === intId);
    if (intSessions.length === 0) continue;
    const current = intSessions[0];
    let onlineMs = 0, sessionsLast24h = 0, reconnectsLast24h = 0, eventsLast24h = 0;
    for (const s of intSessions) {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
      const cs = Math.max(start, windowStart);
      const ce = Math.max(cs, Math.min(end, now));
      if (ce > cs) {
        const ms = ce - cs;
        onlineMs += ms;
        sessionsLast24h++;
        reconnectsLast24h += s.reconnect_count ?? 0;
        const fullMs = Math.max(1, end - start);
        eventsLast24h += Math.round((s.events_received ?? 0) * Math.min(1, ms / fullMs));
      }
    }
    const info = infoMap.get(intId);
    const heartbeatAge = current ? now - new Date(current.updated_at).getTime() : null;
    let status: UnifiedRow["status"] = "disconnected";
    let statusLabel = "Getrennt";
    if (current && !current.ended_at) {
      if (heartbeatAge !== null && heartbeatAge < LOXONE_FRESH_HEARTBEAT_MS) {
        status = "active"; statusLabel = "Aktiv";
      } else {
        status = "stale"; statusLabel = `Stale (${Math.round((heartbeatAge ?? 0) / 1000)}s)`;
      }
    }
    result.push({
      key: `loxone:${intId}`,
      type: "Loxone Miniserver",
      tenantName: info?.tenant ?? "—",
      locationName: info?.location ?? "—",
      status, statusLabel,
      connectedSince: current && !current.ended_at ? current.started_at : null,
      lastHeartbeat: current?.updated_at ?? null,
      heartbeatAgeMs: heartbeatAge,
      eventsLast24h, reconnectsLast24h,
      uptimeRatio24h: Math.min(1, onlineMs / LOOKBACK_MS),
      sessionsLast24h,
      worker: current?.worker_host ?? null,
      lastDisconnect: current?.disconnect_reason ?? (current && !current.ended_at ? null : "unbekannt"),
      serials: info?.serials ?? [],
      loxone: current ? {
        integrationId: intId,
        sessionId: current.id,
        startedAt: current.started_at,
        endedAt: current.ended_at,
        updatedAt: current.updated_at,
        eventsReceived: current.events_received,
        reconnectCount: current.reconnect_count,
        disconnectReason: current.disconnect_reason,
        serials: info?.serials ?? [],
      } : undefined,
    });

  }
  return result;
}

function aiconoToUnifiedRow(d: FleetDevice, tenantNameMap: Record<string, string>): UnifiedRow {
  const now = Date.now();
  const hbAge = d.last_heartbeat_at ? now - new Date(d.last_heartbeat_at).getTime() : null;
  let status: UnifiedRow["status"] = "unknown";
  let statusLabel = d.status || "—";
  if (hbAge !== null && hbAge < AICONO_FRESH_HEARTBEAT_MS) {
    status = "active"; statusLabel = "Aktiv";
  } else if (d.status === "online") {
    status = "stale"; statusLabel = "Stale";
  } else if (d.status) {
    status = d.status === "online" ? "online" : "offline";
    statusLabel = d.status;
  }
  return {
    key: `aicono:${d.id}`,
    type: "AICONO EMS",
    tenantName: (d.tenant_id && tenantNameMap[d.tenant_id]) || "—",
    locationName: d.location_name || d.device_name || "—",
    status, statusLabel,
    connectedSince: d.ws_connected_since,
    lastHeartbeat: d.last_heartbeat_at,
    heartbeatAgeMs: hbAge,
    eventsLast24h: null,
    reconnectsLast24h: null,
    uptimeRatio24h: status === "active" ? 1 : null,
    sessionsLast24h: null,
    worker: null,
    lastDisconnect: null,
    serials: [],
    device: d,

  };
}

function UnifiedStatusBadge({ status, label }: { status: UnifiedRow["status"]; label: string }) {
  if (status === "active") {
    return (
      <Badge className="bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400 hover:bg-green-500/15">
        <Radio className="h-3 w-3 mr-1" />{label}
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge variant="secondary" className="text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3 w-3 mr-1" />{label}
      </Badge>
    );
  }
  if (status === "disconnected" || status === "offline") {
    return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "destructive" | "secondary" | "outline"; icon: any; cls?: string }> = {
    queued: { variant: "secondary", icon: Clock },
    dispatched: { variant: "outline", icon: Loader2 },
    running: { variant: "outline", icon: Loader2, cls: "animate-pulse" },
    success: { variant: "default", icon: CheckCircle2, cls: "bg-green-500/15 text-green-600 border-green-500/30" },
    failed: { variant: "destructive", icon: XCircle },
    cancelled: { variant: "secondary", icon: XCircle },
  };
  const m = map[status] || map.queued;
  const Icon = m.icon;
  return (
    <Badge variant={m.variant} className={m.cls}>
      <Icon className="h-3 w-3 mr-1" />
      {status}
    </Badge>
  );
}

function PublishVersionDialog({ onPublished }: { onPublished: () => void }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("stable");
  const [version, setVersion] = useState("");
  const [imageRef, setImageRef] = useState("");
  const [notes, setNotes] = useState("");
  const [setLatest, setSetLatest] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!version.trim() || !imageRef.trim()) {
      toast.error("Version & Image-Ref erforderlich");
      return;
    }
    setBusy(true);
    try {
      await callControl("channel_publish", {
        channel, version: version.trim(), image_ref: imageRef.trim(),
        release_notes: notes.trim() || null, is_latest: setLatest,
      });
      toast.success(`Version ${version} veröffentlicht`);
      setOpen(false);
      setVersion(""); setImageRef(""); setNotes("");
      onPublished();
    } catch (err: any) {
      toast.error(err.message || "Fehler");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><RocketIcon className="h-4 w-4 mr-2" />Neue Version</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Neue Gateway-Version veröffentlichen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Channel</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">stable</SelectItem>
                <SelectItem value="beta">beta</SelectItem>
                <SelectItem value="dev">dev</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Version (z.B. 4.1.0)</label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="4.1.0" />
          </div>
          <div>
            <label className="text-sm font-medium">Image-Ref (GHCR)</label>
            <Input value={imageRef} onChange={(e) => setImageRef(e.target.value)} placeholder="ghcr.io/cw-aicono/ha-addons-aicono-ems:4.1.0" />
          </div>
          <div>
            <label className="text-sm font-medium">Release Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={setLatest} onCheckedChange={setSetLatest} />
            Als „latest" für diesen Channel markieren
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Veröffentlichen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SuperAdminGatewayFleet = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();
  const qc = useQueryClient();

  const { data: fleet = [], refetch: refetchFleet } = useQuery({
    queryKey: ["sa-gateway-fleet"],
    queryFn: async () => {
      const r = await callControl("fleet_list");
      return (r?.devices ?? []) as FleetDevice[];
    },
    enabled: !!isSuperAdmin,
    refetchInterval: 30_000,
  });

  const { data: tenantNameMap = {} } = useQuery({
    queryKey: ["sa-gateway-fleet-tenant-names"],
    enabled: !!isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((t: { id: string; name: string }) => { map[t.id] = t.name; });
      return map;
    },
  });


  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "fleet";
  const setActiveTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "fleet") next.delete("tab"); else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  const { data: loxoneRows = [], refetch: refetchLoxone } = useQuery({
    queryKey: ["sa-unified-fleet-loxone"],
    queryFn: fetchLoxoneRows,
    enabled: !!isSuperAdmin,
    refetchInterval: 15_000,
  });

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const aicono = (fleet ?? []).map((d) => aiconoToUnifiedRow(d, tenantNameMap));
    const all = [...aicono, ...loxoneRows];
    all.sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.locationName.localeCompare(b.locationName);
    });
    return all;
  }, [fleet, loxoneRows, tenantNameMap]);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fleetSearch, setFleetSearch] = useState("");
  const deviceTypes = Array.from(new Set(unifiedRows.map((r) => r.type)));
  const statusOptions = Array.from(new Set(unifiedRows.map((r) => r.status)));
  const filteredRowsPre = unifiedRows.filter((r) =>
    (typeFilter === "all" || r.type === typeFilter) &&
    (statusFilter === "all" || r.status === statusFilter)
  );
  const filteredRowsSearched = fleetSearch.trim()
    ? filteredRowsPre.filter((r) => {
        const q = fleetSearch.toLowerCase();
        return (
          (r.tenantName ?? "").toLowerCase().includes(q) ||
          (r.locationName ?? "").toLowerCase().includes(q) ||
          (r.type ?? "").toLowerCase().includes(q) ||
          (r.statusLabel ?? r.status ?? "").toLowerCase().includes(q) ||
          (r.worker ?? "").toLowerCase().includes(q)
        );
      })
    : filteredRowsPre;
  const { sorted: filteredRows, sort: fleetSort, toggle: toggleFleetSort } = useSortableData<any, "tenant" | "location" | "type" | "status" | "connected" | "heartbeat" | "events" | "reconnects" | "uptime" | "sessions" | "worker">(
    filteredRowsSearched,
    (r, k) => {
      switch (k) {
        case "tenant": return r.tenantName ?? "";
        case "location": return r.locationName ?? "";
        case "type": return r.type ?? "";
        case "status": return r.statusLabel ?? r.status ?? "";
        case "connected": return r.connectedSince ? new Date(r.connectedSince) : null;
        case "heartbeat": return r.heartbeatAgeMs ?? Number.MAX_SAFE_INTEGER;
        case "events": return r.eventsLast24h ?? -1;
        case "reconnects": return r.reconnectsLast24h ?? -1;
        case "uptime": return r.uptimeRatio24h ?? -1;
        case "sessions": return r.sessionsLast24h ?? -1;
        case "worker": return r.worker ?? "";
        default: return null;
      }
    },
    { key: "tenant", direction: "asc" },
  );

  const { data: channels = [], refetch: refetchChannels } = useQuery({
    queryKey: ["sa-gateway-channels"],
    queryFn: async () => {
      const r = await callControl("channels_list");
      return (r?.channels ?? []) as ReleaseChannel[];
    },
    enabled: !!isSuperAdmin,
  });

  const { sorted: sortedChannels, sort: chanSort, toggle: toggleChanSort } = useSortableData<ReleaseChannel, "channel" | "version" | "image" | "released" | "latest">(
    channels,
    (c, k) => {
      switch (k) {
        case "channel": return c.channel;
        case "version": return c.version;
        case "image": return c.image_ref;
        case "released": return c.released_at ? new Date(c.released_at) : null;
        case "latest": return c.is_latest ? 1 : 0;
        default: return null;
      }
    },
    { key: "released", direction: "desc" },
  );


  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["sa-gateway-jobs"],
    queryFn: async () => {
      const r = await callControl("jobs_list", { limit: 100 });
      return (r?.jobs ?? []) as UpdateJob[];
    },
    enabled: !!isSuperAdmin,
    refetchInterval: 15_000,
  });

  const { sorted: sortedJobs, sort: jobsSort, toggle: toggleJobsSort } = useSortableData<any, "gateway" | "version" | "status" | "trigger" | "created" | "finished">(
    jobs,
    (j, k) => {
      const dev = fleet.find((f) => f.id === j.gateway_device_id);
      switch (k) {
        case "gateway": return dev?.device_name ?? j.gateway_device_id;
        case "version": return j.target_version ?? "";
        case "status": return j.status ?? "";
        case "trigger": return j.triggered_by ?? "";
        case "created": return j.created_at ? new Date(j.created_at) : null;
        case "finished": return j.finished_at ? new Date(j.finished_at) : null;
        default: return null;
      }
    },
    { key: "created", direction: "desc" },
  );


  // Realtime: live job updates
  useEffect(() => {
    if (!isSuperAdmin) return;
    const ch = supabase.channel("sa-gateway-update-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "gateway_update_jobs" }, () => {
        refetchJobs();
        refetchFleet();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isSuperAdmin, refetchJobs, refetchFleet]);

  const queueMutation = useMutation({
    mutationFn: async (vars: { deviceId: string; channel: string }) =>
      callControl("queue_update", { gateway_device_id: vars.deviceId, channel: vars.channel }),
    onSuccess: () => {
      toast.success("Update-Job in die Warteschlange gestellt");
      qc.invalidateQueries({ queryKey: ["sa-gateway-jobs"] });
    },
    onError: (e: any) => toast.error(e.message || "Fehler"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => callControl("cancel_update", { job_id: jobId }),
    onSuccess: () => {
      toast.success("Job abgebrochen");
      qc.invalidateQueries({ queryKey: ["sa-gateway-jobs"] });
    },
    onError: (e: any) => toast.error(e.message || "Fehler"),
  });

  const setAutoMutation = useMutation({
    mutationFn: async (vars: { deviceId: string; enabled: boolean; channel?: string }) =>
      callControl("set_auto_update", {
        gateway_device_id: vars.deviceId,
        auto_update_enabled: vars.enabled,
        update_channel: vars.channel,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sa-gateway-fleet"] }),
    onError: (e: any) => toast.error(e.message || "Fehler"),
  });

  const setLatestMutation = useMutation({
    mutationFn: async (vars: { channel: string; version: string }) =>
      callControl("channel_set_latest", vars),
    onSuccess: () => {
      toast.success("Latest-Version aktualisiert");
      qc.invalidateQueries({ queryKey: ["sa-gateway-channels"] });
    },
    onError: (e: any) => toast.error(e.message || "Fehler"),
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const formatTime = (ts: string | null) =>
    ts ? formatDistanceToNow(new Date(ts), { addSuffix: true, locale: de }) : "—";

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Cpu className="h-6 w-6" /> Gateway-Flotte & Updates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Remote- und Auto-Software-Updates für AICONO EMS Gateways
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchFleet(); refetchJobs(); refetchChannels(); refetchLoxone(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Aktualisieren
          </Button>
        </header>

        <div className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="fleet">Flotte ({filteredRows.length})</TabsTrigger>
              <TabsTrigger value="jobs">Update-Jobs</TabsTrigger>
              <TabsTrigger value="channels">Release-Channels</TabsTrigger>
              <TabsTrigger value="workers">Worker-Steuerung</TabsTrigger>
              <TabsTrigger value="worker-key">Worker-Key</TabsTrigger>
            </TabsList>

            <TabsContent value="fleet" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-muted-foreground">Gateway-Typ:</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Typen</SelectItem>
                    {deviceTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="text-sm text-muted-foreground ml-2">Status:</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    {statusOptions.includes("active") && <SelectItem value="active">Aktiv</SelectItem>}
                    {statusOptions.includes("stale") && <SelectItem value="stale">Stale</SelectItem>}
                    {statusOptions.includes("disconnected") && <SelectItem value="disconnected">Getrennt</SelectItem>}
                    {statusOptions.includes("offline") && <SelectItem value="offline">Offline</SelectItem>}
                    {statusOptions.includes("online") && <SelectItem value="online">Online</SelectItem>}
                    {statusOptions.includes("unknown") && <SelectItem value="unknown">Unbekannt</SelectItem>}
                  </SelectContent>
                </Select>
                <div className="relative ml-2">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suchen (Tenant, Liegenschaft, Typ, Worker)…"
                    value={fleetSearch}
                    onChange={(e) => setFleetSearch(e.target.value)}
                    className="pl-8 h-9 w-72"
                  />
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  Aktuelle Sitzung + Statistik der letzten 24 h
                </span>
              </div>
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <SortableHead sortKey="tenant" sort={fleetSort} onToggle={toggleFleetSort}>Tenant</SortableHead>
                        <SortableHead sortKey="location" sort={fleetSort} onToggle={toggleFleetSort}>Liegenschaft</SortableHead>
                        <SortableHead sortKey="type" sort={fleetSort} onToggle={toggleFleetSort}>Typ</SortableHead>
                        <SortableHead sortKey="status" sort={fleetSort} onToggle={toggleFleetSort}>Status</SortableHead>
                        <SortableHead sortKey="connected" sort={fleetSort} onToggle={toggleFleetSort}>Verbunden seit</SortableHead>
                        <SortableHead sortKey="heartbeat" sort={fleetSort} onToggle={toggleFleetSort}>Letzter Heartbeat</SortableHead>
                        <SortableHead sortKey="events" sort={fleetSort} onToggle={toggleFleetSort} align="right">Events 24 h</SortableHead>
                        <SortableHead sortKey="reconnects" sort={fleetSort} onToggle={toggleFleetSort} align="right">Reconnects 24 h</SortableHead>
                        <SortableHead sortKey="uptime" sort={fleetSort} onToggle={toggleFleetSort} align="right">Uptime 24 h</SortableHead>
                        <SortableHead sortKey="sessions" sort={fleetSort} onToggle={toggleFleetSort} align="right">Sitzungen 24 h</SortableHead>
                        <SortableHead sortKey="worker" sort={fleetSort} onToggle={toggleFleetSort}>Worker</SortableHead>
                        <TableHead>Letzter Disconnect</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 && (
                        <TableRow><TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-8">Keine Gateways registriert.</TableCell></TableRow>
                      )}
                      {filteredRows.map((r) => {
                        const d = r.device;
                        const lx = r.loxone;
                        const canExpand = !!d || !!lx;
                        const isOpen = canExpand && !!expanded[r.key];
                        return (
                          <Fragment key={r.key}>
                            <TableRow className="hover:bg-muted/40">
                              <TableCell className="p-2">
                                {canExpand ? (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(r.key)}>
                                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                ) : null}
                              </TableCell>
                              <TableCell className="font-medium">{r.tenantName}</TableCell>
                              <TableCell>{r.locationName}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{r.type}</Badge></TableCell>
                              <TableCell><UnifiedStatusBadge status={r.status} label={r.statusLabel} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {r.connectedSince ? formatDistanceToNow(new Date(r.connectedSince), { addSuffix: false, locale: de }) : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {r.heartbeatAgeMs != null ? `vor ${Math.round(r.heartbeatAgeMs / 1000)} s` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.eventsLast24h != null ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Activity className="h-3 w-3 text-muted-foreground" />
                                    {r.eventsLast24h.toLocaleString("de-DE")}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.reconnectsLast24h != null ? (
                                  <span className="inline-flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3 text-muted-foreground" />
                                    {r.reconnectsLast24h.toLocaleString("de-DE")}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.uptimeRatio24h != null
                                  ? `${(r.uptimeRatio24h * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.sessionsLast24h != null ? r.sessionsLast24h.toLocaleString("de-DE") : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.worker ?? "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.lastDisconnect ?? "—"}</TableCell>
                            </TableRow>
                            {isOpen && d && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell></TableCell>
                                <TableCell colSpan={12} className="py-4">
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                                      <div><div className="text-muted-foreground">Gateway-Name</div><div className="font-medium">{d.device_name}</div></div>
                                      <div><div className="text-muted-foreground">Version</div><div className="font-mono">{d.addon_version ?? "—"}</div></div>
                                      <div><div className="text-muted-foreground">HA-Version</div><div className="font-mono">{d.ha_version ?? "—"}</div></div>
                                      <div><div className="text-muted-foreground">Lokale IP</div><div className="font-mono">{d.local_ip ?? "—"}</div></div>
                                      <div><div className="text-muted-foreground">MAC-Adresse</div><div className="font-mono">{d.mac_address ?? "—"}</div></div>
                                      <div><div className="text-muted-foreground">Lokale Zeit</div><div className="font-mono">{d.local_time ?? "—"}</div></div>
                                      <div><div className="text-muted-foreground">Offline-Buffer</div><div className="font-medium">{(d.offline_buffer_count ?? 0).toLocaleString("de-DE")} Events</div></div>
                                      <div><div className="text-muted-foreground">Letzter Update-Versuch</div><div className="font-medium">{formatTime(d.last_update_attempt_at)}</div></div>
                                      <div><div className="text-muted-foreground">Registriert</div><div className="font-medium">{formatTime(d.created_at)}</div></div>
                                      <div><div className="text-muted-foreground">Device-ID</div><div className="font-mono truncate" title={d.id}>{d.id.slice(0, 8)}…</div></div>
                                      {d.last_update_error && (
                                        <div className="col-span-2 md:col-span-4">
                                          <div className="text-muted-foreground">Letzter Update-Fehler</div>
                                          <div className="text-destructive font-mono whitespace-pre-wrap">{d.last_update_error}</div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground">Channel:</span>
                                        <Select
                                          value={d.update_channel}
                                          onValueChange={(v) => setAutoMutation.mutate({ deviceId: d.id, enabled: d.auto_update_enabled, channel: v })}
                                        >
                                          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="stable">stable</SelectItem>
                                            <SelectItem value="beta">beta</SelectItem>
                                            <SelectItem value="dev">dev</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground">Auto-Update:</span>
                                        <Switch
                                          checked={d.auto_update_enabled}
                                          onCheckedChange={(v) => setAutoMutation.mutate({ deviceId: d.id, enabled: v })}
                                        />
                                      </div>
                                      <Button
                                        size="sm" variant="outline"
                                        onClick={() => queueMutation.mutate({ deviceId: d.id, channel: d.update_channel })}
                                        disabled={queueMutation.isPending || d.status !== "online"}
                                      >
                                        Update jetzt
                                      </Button>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            {isOpen && !d && lx && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell></TableCell>
                                <TableCell colSpan={12} className="py-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                                    <div><div className="text-muted-foreground">Gateway-Typ</div><div className="font-medium">Loxone Miniserver</div></div>
                                    <div><div className="text-muted-foreground">Worker</div><div className="font-mono">{lx ? (r.worker ?? "—") : "—"}</div></div>
                                    <div><div className="text-muted-foreground">Sitzungs-Start</div><div className="font-mono">{new Date(lx.startedAt).toLocaleString("de-DE")}</div></div>
                                    <div><div className="text-muted-foreground">Letztes Update</div><div className="font-mono">{new Date(lx.updatedAt).toLocaleString("de-DE")}</div></div>
                                    <div><div className="text-muted-foreground">Events (Sitzung)</div><div className="font-medium">{(lx.eventsReceived ?? 0).toLocaleString("de-DE")}</div></div>
                                    <div><div className="text-muted-foreground">Reconnects (Sitzung)</div><div className="font-medium">{(lx.reconnectCount ?? 0).toLocaleString("de-DE")}</div></div>
                                    <div><div className="text-muted-foreground">Sitzungs-Ende</div><div className="font-mono">{lx.endedAt ? new Date(lx.endedAt).toLocaleString("de-DE") : "—"}</div></div>
                                    <div><div className="text-muted-foreground">Disconnect-Grund</div><div className="font-medium">{lx.disconnectReason ?? "—"}</div></div>
                                    <div className="col-span-2"><div className="text-muted-foreground">Integration-ID</div><div className="font-mono truncate" title={lx.integrationId}>{lx.integrationId.slice(0, 8)}…</div></div>
                                    <div className="col-span-2"><div className="text-muted-foreground">Session-ID</div><div className="font-mono truncate" title={lx.sessionId}>{lx.sessionId.slice(0, 8)}…</div></div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="jobs" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead sortKey="gateway" sort={jobsSort} onToggle={toggleJobsSort}>Gateway</SortableHead>
                        <SortableHead sortKey="version" sort={jobsSort} onToggle={toggleJobsSort}>Version</SortableHead>
                        <SortableHead sortKey="status" sort={jobsSort} onToggle={toggleJobsSort}>Status</SortableHead>
                        <SortableHead sortKey="trigger" sort={jobsSort} onToggle={toggleJobsSort}>Trigger</SortableHead>
                        <SortableHead sortKey="created" sort={jobsSort} onToggle={toggleJobsSort}>Erstellt</SortableHead>
                        <SortableHead sortKey="finished" sort={jobsSort} onToggle={toggleJobsSort}>Beendet</SortableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedJobs.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Noch keine Update-Jobs.</TableCell></TableRow>
                      )}
                      {sortedJobs.map((j) => {
                        const dev = fleet.find((f) => f.id === j.gateway_device_id);
                        const open = ["queued", "dispatched", "running"].includes(j.status);
                        return (
                          <TableRow key={j.id}>
                            <TableCell>{dev?.device_name ?? j.gateway_device_id.slice(0, 8)}</TableCell>
                            <TableCell className="font-mono text-xs">{j.target_version}</TableCell>
                            <TableCell><StatusBadge status={j.status} /></TableCell>
                            <TableCell className="text-xs">{j.triggered_by}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTime(j.created_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTime(j.finished_at)}</TableCell>
                            <TableCell className="text-right">
                              {open && (
                                <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(j.id)}>Abbrechen</Button>
                              )}
                              {j.error_message && (
                                <span className="text-xs text-destructive ml-2" title={j.error_message}>⚠</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="channels" className="mt-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Release-Channels</CardTitle>
                  <PublishVersionDialog onPublished={refetchChannels} />
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead sortKey="channel" sort={chanSort} onToggle={toggleChanSort}>Channel</SortableHead>
                        <SortableHead sortKey="version" sort={chanSort} onToggle={toggleChanSort}>Version</SortableHead>
                        <SortableHead sortKey="image" sort={chanSort} onToggle={toggleChanSort}>Image</SortableHead>
                        <SortableHead sortKey="released" sort={chanSort} onToggle={toggleChanSort}>Veröffentlicht</SortableHead>
                        <SortableHead sortKey="latest" sort={chanSort} onToggle={toggleChanSort}>Latest</SortableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedChannels.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Noch keine Versionen veröffentlicht.</TableCell></TableRow>
                      )}
                      {sortedChannels.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell><Badge variant="outline">{c.channel}</Badge></TableCell>
                          <TableCell className="font-mono">{c.version}</TableCell>
                          <TableCell className="font-mono text-xs truncate max-w-[300px]">{c.image_ref}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatTime(c.released_at)}</TableCell>
                          <TableCell>
                            {c.is_latest
                              ? <Badge className="bg-green-500/15 text-green-600 border-green-500/30">latest</Badge>
                              : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {!c.is_latest && (
                              <Button size="sm" variant="ghost"
                                onClick={() => setLatestMutation.mutate({ channel: c.channel, version: c.version })}>
                                Als latest setzen
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="workers" className="mt-4">
              <WorkerControlsPanel />
            </TabsContent>

            <TabsContent value="worker-key" className="mt-4">
              <WorkerKeyPanel />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminGatewayFleet;
