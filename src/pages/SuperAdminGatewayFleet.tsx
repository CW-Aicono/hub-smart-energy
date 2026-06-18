import { Navigate } from "react-router-dom";
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
import { Cpu, RefreshCw, RocketIcon, CheckCircle2, XCircle, Clock, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
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

async function callControl(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("gateway-update-control", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
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
      const r = await callControl("jobs_list", { limit: 100 });
      return (r?.jobs ?? []) as UpdateJob[];
    },
    enabled: !!isSuperAdmin,
    refetchInterval: 15_000,
  });

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
          <Button variant="outline" size="sm" onClick={() => { refetchFleet(); refetchJobs(); refetchChannels(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Aktualisieren
          </Button>
        </header>

        <div className="p-6">
          <Tabs defaultValue="fleet">
            <TabsList>
              <TabsTrigger value="fleet">Flotte ({fleet.length})</TabsTrigger>
              <TabsTrigger value="jobs">Update-Jobs</TabsTrigger>
              <TabsTrigger value="channels">Release-Channels</TabsTrigger>
            </TabsList>

            <TabsContent value="fleet" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Gateway</TableHead>
                        <TableHead>Liegenschaft</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Letzter Heartbeat</TableHead>
                        <TableHead>Auto-Update</TableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fleet.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Keine Gateways registriert.</TableCell></TableRow>
                      )}
                      {fleet.map((d) => {
                        const isOpen = !!expanded[d.id];
                        const locationName = d.location_name || "—";
                        return (
                          <Fragment key={d.id}>
                          <TableRow key={d.id}>
                            <TableCell className="p-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(d.id)}>
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{d.device_name}</div>
                              <div className="text-xs text-muted-foreground">{(d.tenant_id && tenantNameMap[d.tenant_id]) || "—"}</div>
                            </TableCell>
                            <TableCell className="text-sm">{locationName}</TableCell>
                            <TableCell>
                              <Badge variant={d.status === "online" ? "default" : "secondary"}>{d.status}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{d.addon_version ?? "—"}</TableCell>
                            <TableCell>
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
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={d.auto_update_enabled}
                                onCheckedChange={(v) => setAutoMutation.mutate({ deviceId: d.id, enabled: v })}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTime(d.last_heartbeat_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm" variant="outline"
                                onClick={() => queueMutation.mutate({ deviceId: d.id, channel: d.update_channel })}
                                disabled={queueMutation.isPending || d.status !== "online"}
                              >
                                Update jetzt
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow key={d.id + "-details"} className="bg-muted/30 hover:bg-muted/30">
                              <TableCell></TableCell>
                              <TableCell colSpan={8} className="py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                                  <div>
                                    <div className="text-muted-foreground">Verbunden seit</div>
                                    <div className="font-medium">{formatTime(d.ws_connected_since ?? d.last_heartbeat_at)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Letzter Heartbeat</div>
                                    <div className="font-medium">{formatTime(d.last_heartbeat_at)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Letzter WS-Ping</div>
                                    <div className="font-medium">{formatTime(d.last_ws_ping_at)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Offline-Buffer</div>
                                    <div className="font-medium">{(d.offline_buffer_count ?? 0).toLocaleString("de-DE")} Events</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Lokale IP</div>
                                    <div className="font-mono">{d.local_ip ?? "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">MAC-Adresse</div>
                                    <div className="font-mono">{d.mac_address ?? "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">HA-Version</div>
                                    <div className="font-mono">{d.ha_version ?? "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Lokale Zeit</div>
                                    <div className="font-mono">{d.local_time ?? "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Letzter Update-Versuch</div>
                                    <div className="font-medium">{formatTime(d.last_update_attempt_at)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Letztes Update</div>
                                    <div className="font-medium">{formatTime(d.updated_at)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Registriert</div>
                                    <div className="font-medium">{formatTime(d.created_at)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Device-ID</div>
                                    <div className="font-mono truncate" title={d.id}>{d.id.slice(0, 8)}…</div>
                                  </div>
                                  {d.last_update_error && (
                                    <div className="col-span-2 md:col-span-4">
                                      <div className="text-muted-foreground">Letzter Update-Fehler</div>
                                      <div className="text-destructive font-mono whitespace-pre-wrap">{d.last_update_error}</div>
                                    </div>
                                  )}
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
                        <TableHead>Gateway</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Erstellt</TableHead>
                        <TableHead>Beendet</TableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Noch keine Update-Jobs.</TableCell></TableRow>
                      )}
                      {jobs.map((j) => {
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
                        <TableHead>Channel</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>Veröffentlicht</TableHead>
                        <TableHead>Latest</TableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channels.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Noch keine Versionen veröffentlicht.</TableCell></TableRow>
                      )}
                      {channels.map((c) => (
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
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminGatewayFleet;
