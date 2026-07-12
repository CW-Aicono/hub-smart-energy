import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSATranslation } from "@/hooks/useSATranslation";
import { useTenants } from "@/hooks/useTenants";
import { useChargingSessions } from "@/hooks/useChargingSessions";
import { useChargePoints } from "@/hooks/useChargePoints";
import { useOcppLogs } from "@/hooks/useOcppLogs";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import OcppLogViewer from "@/components/charging/OcppLogViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, ScrollText, Building2, Search } from "lucide-react";
import { format } from "date-fns";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

type SortKey = "tenant" | "charge_point" | "start" | "end" | "energy" | "idTag" | "status" | "stopReason";

const SuperAdminOcppControl = () => {
  const { user, loading } = useAuth();
  const { t } = useSATranslation();
  const { tenants } = useTenants();
  const { chargePoints } = useChargePoints();
  const { sessions, isLoading: sessionsLoading } = useChargingSessions();
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [logTenantId, setLogTenantId] = useState<string>("");
  const [logChargePointId, setLogChargePointId] = useState<string>("");
  const [search, setSearch] = useState("");

  const getTenantName = (tenantId: string) => {
    return tenants.find(t => t.id === tenantId)?.name || tenantId.slice(0, 8);
  };

  const getCPName = (cpId: string | null) => {
    if (!cpId) return "—";
    const cp = chargePoints.find(c => c.id === cpId);
    return cp ? cp.name : cpId.slice(0, 8);
  };

  // Filter charge points by tenant
  const filteredCPs = tenantFilter === "all"
    ? chargePoints
    : chargePoints.filter(cp => cp.tenant_id === tenantFilter);

  const filteredCPIds = new Set(filteredCPs.map(cp => cp.id));

  // Filter sessions by tenant via charge points
  const filteredSessionsByTenant = tenantFilter === "all"
    ? sessions
    : sessions.filter(s => s.charge_point_id && filteredCPIds.has(s.charge_point_id));

  const filteredSessions = search.trim()
    ? filteredSessionsByTenant.filter((s: any) => {
        const q = search.toLowerCase();
        return (
          getTenantName(s.tenant_id).toLowerCase().includes(q) ||
          getCPName(s.charge_point_id).toLowerCase().includes(q) ||
          (s.id_tag ?? "").toLowerCase().includes(q) ||
          (s.status ?? "").toLowerCase().includes(q) ||
          (s.stop_reason ?? "").toLowerCase().includes(q)
        );
      })
    : filteredSessionsByTenant;

  const { sorted, sort, toggle } = useSortableData<any, SortKey>(filteredSessions, (r, k) => {
    switch (k) {
      case "tenant": return getTenantName(r.tenant_id);
      case "charge_point": return getCPName(r.charge_point_id);
      case "start": return r.start_time ? new Date(r.start_time) : null;
      case "end": return r.stop_time ? new Date(r.stop_time) : null;
      case "energy": return r.energy_kwh;
      case "idTag": return r.id_tag ?? "";
      case "status": return r.status;
      case "stopReason": return r.stop_reason ?? "";
      default: return null;
    }
  }, { key: "start", direction: "desc" });

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
      completed: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
      stopped: "bg-muted text-muted-foreground border-muted",
    };
    return <Badge className={`${colors[status] || "bg-muted text-muted-foreground"} text-xs`}>{status}</Badge>;
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: `hsl(var(--sa-background))`, color: `hsl(var(--sa-foreground))` }}>
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold">OCPP Control</h1>
              <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>
                Service-Übersicht: Ladevorgänge und OCPP-Kommunikation aller Ladestationen
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen (Mandant, Ladepunkt, ID-Tag, Status)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-72 h-9 text-sm"
                />
              </div>
              <Building2 className="h-4 w-4 opacity-60" />
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="w-56 h-9 text-sm">
                  <SelectValue placeholder="Mandant filtern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Mandanten</SelectItem>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs defaultValue="sessions">
            <TabsList>
              <TabsTrigger value="sessions" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Ladevorgänge
              </TabsTrigger>
              <TabsTrigger value="ocpp-log" className="gap-1.5">
                <ScrollText className="h-3.5 w-3.5" />
                OCPP-Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sessions" className="mt-6">
              <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Ladevorgänge
                    <Badge variant="outline" className="ml-2">{filteredSessions.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sessionsLoading ? (
                    <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>Laden...</p>
                  ) : sorted.length === 0 ? (
                    <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>Keine Ladevorgänge vorhanden.</p>
                  ) : (
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHead label="Mandant" sortKey="tenant" sort={sort} onToggle={toggle} />
                            <SortableHead label="Ladepunkt" sortKey="charge_point" sort={sort} onToggle={toggle} />
                            <SortableHead label="Start" sortKey="start" sort={sort} onToggle={toggle} />
                            <SortableHead label="Ende" sortKey="end" sort={sort} onToggle={toggle} />
                            <SortableHead label="Energie" sortKey="energy" sort={sort} onToggle={toggle} />
                            <SortableHead label="ID-Tag" sortKey="idTag" sort={sort} onToggle={toggle} />
                            <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                            <SortableHead label="Stoppgrund" sortKey="stopReason" sort={sort} onToggle={toggle} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sorted.slice(0, 200).map((s: any) => (
                            <TableRow key={s.id}>
                              <TableCell className="text-xs">{getTenantName(s.tenant_id)}</TableCell>
                              <TableCell className="text-xs font-medium">{getCPName(s.charge_point_id)}</TableCell>
                              <TableCell className="text-xs font-mono">
                                {format(new Date(s.start_time), "dd.MM.yy HH:mm")}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {s.stop_time ? format(new Date(s.stop_time), "dd.MM.yy HH:mm") : "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{s.energy_kwh.toFixed(2)} kWh</TableCell>
                              <TableCell className="text-xs font-mono">{s.id_tag || "—"}</TableCell>
                              <TableCell>{statusBadge(s.status)}</TableCell>
                              <TableCell className="text-xs">{s.stop_reason || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ocpp-log" className="mt-6 space-y-4">
              <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
                <CardHeader>
                  <CardTitle className="text-base">Auswahl</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Select value={logTenantId} onValueChange={(v) => { setLogTenantId(v); setLogChargePointId(""); }}>
                    <SelectTrigger className="w-64 h-9 text-sm">
                      <SelectValue placeholder="Mandant wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={logChargePointId}
                    onValueChange={setLogChargePointId}
                    disabled={!logTenantId}
                  >
                    <SelectTrigger className="w-72 h-9 text-sm">
                      <SelectValue placeholder={logTenantId ? "Ladepunkt wählen" : "Zuerst Mandant wählen"} />
                    </SelectTrigger>
                    <SelectContent>
                      {chargePoints
                        .filter(cp => cp.tenant_id === logTenantId)
                        .map(cp => (
                          <SelectItem key={cp.id} value={cp.id}>
                            {cp.name} {cp.ocpp_id ? `(${cp.ocpp_id})` : ""}
                          </SelectItem>
                        ))}
                      {logTenantId && chargePoints.filter(cp => cp.tenant_id === logTenantId).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Ladepunkte vorhanden</div>
                      )}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {logChargePointId ? (
                <OcppLogViewer chargePointId={logChargePointId} />
              ) : (
                <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
                  <CardContent className="py-12 text-center text-sm" style={{ color: `hsl(var(--sa-muted-foreground))` }}>
                    Bitte zuerst Mandant und Ladepunkt auswählen, um die letzten 200 OCPP-Nachrichten anzuzeigen.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminOcppControl;
