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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, ScrollText, Building2 } from "lucide-react";
import { format } from "date-fns";

const SuperAdminOcppControl = () => {
  const { user, loading } = useAuth();
  const { t } = useSATranslation();
  const { tenants } = useTenants();
  const { chargePoints } = useChargePoints();
  const { sessions, isLoading: sessionsLoading } = useChargingSessions();
  const [tenantFilter, setTenantFilter] = useState<string>("all");

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  // Filter charge points by tenant
  const filteredCPs = tenantFilter === "all"
    ? chargePoints
    : chargePoints.filter(cp => cp.tenant_id === tenantFilter);

  const filteredCPIds = new Set(filteredCPs.map(cp => cp.id));

  // Filter sessions by tenant via charge points
  const filteredSessions = tenantFilter === "all"
    ? sessions
    : sessions.filter(s => s.charge_point_id && filteredCPIds.has(s.charge_point_id));

  // For OCPP log: filter by charge point ocpp_ids
  const filteredOcppIds = new Set(filteredCPs.map(cp => cp.ocpp_id));

  const getTenantName = (tenantId: string) => {
    return tenants.find(t => t.id === tenantId)?.name || tenantId.slice(0, 8);
  };

  const getCPName = (cpId: string | null) => {
    if (!cpId) return "—";
    const cp = chargePoints.find(c => c.id === cpId);
    return cp ? cp.name : cpId.slice(0, 8);
  };

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
            <div className="flex items-center gap-2">
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
                  ) : filteredSessions.length === 0 ? (
                    <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>Keine Ladevorgänge vorhanden.</p>
                  ) : (
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mandant</TableHead>
                            <TableHead>Ladepunkt</TableHead>
                            <TableHead>Start</TableHead>
                            <TableHead>Ende</TableHead>
                            <TableHead>Energie</TableHead>
                            <TableHead>ID-Tag</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Stoppgrund</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSessions.slice(0, 200).map(s => (
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

            <TabsContent value="ocpp-log" className="mt-6">
              <OcppLogViewer showCpColumn />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminOcppControl;
