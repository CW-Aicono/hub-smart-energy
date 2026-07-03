import { Navigate, useSearchParams } from "react-router-dom";
import WorkerControlsPanel from "@/components/super-admin/WorkerControlsPanel";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
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
import { Cpu, RefreshCw, RocketIcon, CheckCircle2, XCircle, Clock, Loader2, ChevronRight, ChevronDown, Radio, Activity, AlertCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

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
  device?: FleetDevice;
  loxone?: LoxoneDetails;
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const LOXONE_FRESH_HEARTBEAT_MS = 360_000;
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

  const locById = new Map((locations ?? []).map((l: any) => [l.id, l]));
  const tenantById = new Map((tenants ?? []).map((t: any) => [t.id, t]));
  const infoMap = new Map<string, { tenant: string; location: string }>();
  (integrations ?? []).forEach((it: any) => {
    const loc = locById.get(it.location_id);
    const tenant = loc ? tenantById.get(loc.tenant_id) : null;
    infoMap.set(it.id, { tenant: tenant?.name ?? "—", location: loc?.name ?? "—" });
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
      loxone: current ? {
        integrationId: intId,
        sessionId: current.id,
        startedAt: current.started_at,
        endedAt: current.ended_at,
        updatedAt: current.updated_at,
        eventsReceived: current.events_received,
        reconnectCount: current.reconnect_count,
        disconnectReason: current.disconnect_reason,
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
    return [...aicono, ...loxoneRows];
  }, [fleet, loxoneRows, tenantNameMap]);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredRows = useMemo(() => {
    return unifiedRows.filter((r) =>
      (typeFilter === "all" || r.type === typeFilter) &&
      (statusFilter === "all" || r.status === statusFilter)
    );
  }, [unifiedRows, typeFilter, statusFilter]);

  const { sorted, sort, toggle } = useSortableData<UnifiedRow, "type" | "tenant" | "location" | "status" | "heartbeat">(filteredRows, (r, k) => {
    switch (k) {
      case "type": return r.type;
      case "tenant": return r.tenantName;
      case "location": return r.locationName;
      case "status": return r.statusLabel;
      case "heartbeat": return r.lastHeartbeat ? new Date(r.lastHeartbeat) : null;
      default: return null;
    }
  }, { key: "location", direction: "asc" });

  const { data: channels = [], refetch: refetchChannels } = useQuery({
    queryKey: ["sa-gateway-channels"],
    queryFn: async () => {
      const r = await callControl("channels_list");
      return (r?.channels ?? []) as ReleaseChannel[];
    },
    enabled: !!isSuperAdmin,
  });

  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["sa-gateway-jobs"],
    queryFn: async () => {
      const r = await callControl("jobs_list");
      return (r?.jobs ?? []) as UpdateJob[];
    },
    enabled: !!isSuperAdmin,
    refetchInterval: 10_000,
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gateway-Fleet</h1>
            <p className="text-sm text-muted-foreground mt-1">Status & Updates der lokalen Steuereinheiten.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetchFleet(); refetchLoxone(); refetchJobs(); refetchChannels(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />Aktualisieren
            </Button>
            <PublishVersionDialog onPublished={refetchChannels} />
          </div>
        </header>

        <div className="p-6 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="fleet" className="gap-2"><Activity className="h-4 w-4" />Status-Monitor</TabsTrigger>
              <TabsTrigger value="updates" className="gap-2"><RocketIcon className="h-4 w-4" />Updates & Kanäle</TabsTrigger>
              <TabsTrigger value="workers" className="gap-2"><Cpu className="h-4 w-4" />Worker-Pool</TabsTrigger>
            </TabsList>

            <TabsContent value="fleet" className="space-y-4 pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-48">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Typ</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Typen</SelectItem>
                      <SelectItem value="AICONO EMS">AICONO EMS</SelectItem>
                      <SelectItem value="Loxone Miniserver">Loxone Miniserver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-48">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Status</SelectItem>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="stale">Stale / Warnung</SelectItem>
                      <SelectItem value="offline">Offline / Disconnected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell className="w-10"></TableCell>
                        <SortableHead label="Typ" sortKey="type" sort={sort} onToggle={toggle} />
                        <SortableHead label="Mandant" sortKey="tenant" sort={sort} onToggle={toggle} />
                        <SortableHead label="Standort" sortKey="location" sort={sort} onToggle={toggle} />
                        <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                        <SortableHead label="Letzter Kontakt" sortKey="heartbeat" sort={sort} onToggle={toggle} />
                        <TableCell className="text-right">Aktion</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Keine Gateways gefunden</TableCell></TableRow>
                      ) : (
                        sorted.map((r) => (
                          <Fragment key={r.key}>
                            <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(r.key)}>
                              <TableCell>
                                {expanded[r.key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="font-medium text-xs">{r.type}</TableCell>
                              <TableCell className="text-xs">{r.tenantName}</TableCell>
                              <TableCell className="font-medium">{r.locationName}</TableCell>
                              <TableCell><UnifiedStatusBadge status={r.status} label={r.statusLabel} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {r.lastHeartbeat ? formatDistanceToNow(new Date(r.lastHeartbeat), { addSuffix: true, locale: de }) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {r.device && (
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); callControl("device_update_trigger", { device_id: r.device!.id }).then(() => toast.success("Update getriggert")).catch(err => toast.error(err.message)); }}>
                                    <RocketIcon className="h-3.5 w-3.5 mr-1" />Update
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            {expanded[r.key] && (
                              <TableRow className="bg-muted/30">
                                <TableCell colSpan={7} className="p-4 border-t border-muted">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                                    <div className="space-y-1.5">
                                      <h4 className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider mb-2">System Info</h4>
                                      {r.device ? (
                                        <>
                                          <p><span className="text-muted-foreground">Addon:</span> {r.device.addon_version || "—"}</p>
                                          <p><span className="text-muted-foreground">OS/HA:</span> {r.device.ha_version || "—"}</p>
                                          <p><span className="text-muted-foreground">Channel:</span> {r.device.update_channel}</p>
                                          <p><span className="text-muted-foreground">IP/MAC:</span> {r.device.local_ip || "—"} / {r.device.mac_address || "—"}</p>
                                        </>
                                      ) : r.loxone ? (
                                        <>
                                          <p><span className="text-muted-foreground">Worker Host:</span> {r.worker || "—"}</p>
                                          <p><span className="text-muted-foreground">Integration:</span> {r.loxone.integrationId.slice(0, 8)}...</p>
                                          <p><span className="text-muted-foreground">Verbunden seit:</span> {r.connectedSince ? format(new Date(r.connectedSince), "dd.MM.yyyy HH:mm:ss") : "—"}</p>
                                        </>
                                      ) : null}
                                    </div>
                                    <div className="space-y-1.5">
                                      <h4 className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Metrics (24h)</h4>
                                      <p><span className="text-muted-foreground">Uptime:</span> {r.uptimeRatio24h !== null ? `${(r.uptimeRatio24h * 100).toFixed(1)}%` : "—"}</p>
                                      <p><span className="text-muted-foreground">Events:</span> {r.eventsLast24h?.toLocaleString() ?? "—"}</p>
                                      <p><span className="text-muted-foreground">Reconnects:</span> {r.reconnectsLast24h ?? "—"}</p>
                                      <p><span className="text-muted-foreground">Sessions:</span> {r.sessionsLast24h ?? "—"}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                      <h4 className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Status / Logs</h4>
                                      <p><span className="text-muted-foreground">Internal Key:</span> <code className="text-[10px]">{r.key}</code></p>
                                      {r.lastDisconnect && (
                                        <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs border border-destructive/20">
                                          <span className="font-bold uppercase text-[9px] block mb-0.5">Letzter Fehler/Grund:</span>
                                          {r.lastDisconnect}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="updates" className="space-y-6 pt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><RocketIcon className="h-4 w-4" />Aktive Update-Kanäle</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Version</TableHead><TableHead>Veröffentlicht</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {channels.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-bold">{c.channel}</TableCell>
                            <TableCell>{c.version}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{format(new Date(c.released_at), "dd.MM.yy HH:mm")}</TableCell>
                            <TableCell className="text-right">{c.is_latest ? <Badge>latest</Badge> : <Badge variant="outline">archived</Badge>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Letzte Update-Jobs</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>Zeit</TableHead><TableHead>Gateway</TableHead><TableHead>Ziel</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {jobs.slice(0, 10).map((j) => (
                          <TableRow key={j.id}>
                            <TableCell className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(j.created_at), { addSuffix: true, locale: de })}</TableCell>
                            <TableCell className="text-xs truncate max-w-[100px]">{j.gateway_device_id.slice(0, 8)}</TableCell>
                            <TableCell className="text-xs">{j.target_version}</TableCell>
                            <TableCell className="text-right"><StatusBadge status={j.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="workers" className="pt-4">
              <WorkerControlsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminGatewayFleet;
