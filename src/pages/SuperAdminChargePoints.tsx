import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenants } from "@/hooks/useTenants";
import { useAllChargePoints } from "@/hooks/useAllChargePoints";
import type { ChargePoint } from "@/hooks/useChargePoints";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import ChargingOverviewStats from "@/components/charging/ChargingOverviewStats";
import ConnectorTypeIcons from "@/components/charging/ConnectorTypeIcons";
import ChargePointQrCode from "@/components/charging/ChargePointQrCode";
import OcppLogViewer from "@/components/charging/OcppLogViewer";
import { StatusLiveDataHover } from "@/components/charging/StatusLiveDataHover";
import { RowActions } from "@/components/ui/row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plug, PlugZap, Search, Building2, ScrollText, ExternalLink, Zap, ZapOff, AlertTriangle, WifiOff, Settings } from "lucide-react";
import { format } from "date-fns";
import { fmtKw, fmtKwh, normalizeConnectorStatus } from "@/lib/formatCharging";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap }> = {
  available: { label: "Verfügbar", variant: "default", icon: Zap },
  charging: { label: "Belegt", variant: "secondary", icon: PlugZap },
  faulted: { label: "Fehler", variant: "destructive", icon: AlertTriangle },
  unavailable: { label: "Nicht verfügbar", variant: "outline", icon: ZapOff },
  offline: { label: "Offline", variant: "outline", icon: WifiOff },
  unconfigured: { label: "Nicht konfiguriert", variant: "outline", icon: Settings },
};

export default function SuperAdminChargePoints() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { tenants } = useTenants();
  const { chargePoints, connectors, sessions, isLoading } = useAllChargePoints();

  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChargePoint | null>(null);

  const tenantName = (id: string) => tenants.find((t: any) => t.id === id)?.name || id?.slice(0, 8) || "—";

  const connectorsByCp = useMemo(() => {
    const map = new Map<string, typeof connectors>();
    for (const c of connectors) {
      const list = map.get(c.charge_point_id) ?? [];
      list.push(c);
      map.set(c.charge_point_id, list);
    }
    return map;
  }, [connectors]);

  const activeSessions = useMemo(() => sessions.filter((s) => s.status === "active"), [sessions]);

  const getConnectorStatuses = (cp: ChargePoint) => {
    const wsOnline = cp.ws_connected !== false;
    const list = connectorsByCp.get(cp.id) ?? [];
    const activeIds = new Set(
      activeSessions.filter((s) => s.charge_point_id === cp.id).map((s) => s.connector_id).filter((n) => typeof n === "number" && n > 0),
    );
    if (list.length > 0) {
      return list
        .slice()
        .sort((a, b) => a.connector_id - b.connector_id)
        .map((c) => ({
          connectorId: c.connector_id,
          status: !wsOnline ? "offline" : activeIds.has(c.connector_id) ? "charging" : normalizeConnectorStatus(c.status, wsOnline),
        }));
    }
    const count = Math.max(1, cp.connector_count || 1);
    return Array.from({ length: count }, (_, i) => ({
      connectorId: i + 1,
      status: !wsOnline ? "offline" : activeIds.has(i + 1) ? "charging" : normalizeConnectorStatus(cp.status, wsOnline),
    }));
  };

  const getEffectiveStatus = (cp: ChargePoint) => {
    const statuses = getConnectorStatuses(cp).map((c) => c.status);
    if (statuses.length === 0) return normalizeConnectorStatus(cp.status, cp.ws_connected !== false);
    const hard = ["faulted", "offline", "unconfigured", "unavailable"].find((s) => statuses.includes(s));
    if (hard) return hard;
    if (statuses.some((s) => s === "available")) return "available";
    if (statuses.every((s) => s === "charging")) return "charging";
    return statuses[0];
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chargePoints.filter((cp) => {
      if (tenantFilter !== "all" && cp.tenant_id !== tenantFilter) return false;
      if (statusFilter && getEffectiveStatus(cp) !== statusFilter) return false;
      if (!q) return true;
      return [cp.name, cp.ocpp_id, cp.address, tenantName(cp.tenant_id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [chargePoints, search, tenantFilter, statusFilter, connectorsByCp, activeSessions, tenants]);

  type SortKey = "name" | "tenant_id" | "ocpp_id" | "address" | "max_power_kw" | "last_heartbeat";
  const { sorted, sort, toggle } = useSortableData<ChargePoint, SortKey>(
    filtered,
    (row, key) => {
      if (key === "tenant_id") return tenantName(row.tenant_id);
      if (key === "last_heartbeat") return row.last_heartbeat ? new Date(row.last_heartbeat) : null;
      return (row as any)[key];
    },
    { key: "name", direction: "asc" },
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cp of chargePoints) {
      const s = getEffectiveStatus(cp);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [chargePoints, connectorsByCp, activeSessions]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: `hsl(var(--sa-background))`, color: `hsl(var(--sa-foreground))` }}>
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-4 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 grid place-items-center">
                <Plug className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Ladepunkte</h1>
                <p className="text-sm text-muted-foreground">
                  Gesamtübersicht aller Ladepunkte über alle Mandanten — für den Service-Zugriff
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/super-admin/ocpp/onboarding/new")}>
              <Plug className="h-4 w-4 mr-2" /> Ladepunkt anlegen
            </Button>
          </div>

          <ChargingOverviewStats chargePoints={chargePoints} sessions={sessions} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Suchen (Name, OCPP-ID, Mandant, Adresse)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Alle Mandanten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Mandanten</SelectItem>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant={statusFilter === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setStatusFilter(null)}
            >
              Alle ({chargePoints.length})
            </Badge>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <Badge
                key={key}
                variant={statusFilter === key ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter(statusFilter === key ? null : key)}
              >
                {cfg.label} ({(statusCounts[key] ?? 0).toLocaleString("de-DE")})
              </Badge>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="h-5 w-5" />
                Ladepunkte
                <Badge variant="outline">{sorted.length.toLocaleString("de-DE")}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Lade Ladepunkte…</p>
              ) : sorted.length === 0 ? (
                <p className="text-muted-foreground">Keine Ladepunkte vorhanden.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead sortKey="name" sort={sort} onToggle={toggle}>Name</SortableHead>
                      <SortableHead sortKey="tenant_id" sort={sort} onToggle={toggle}>Mandant</SortableHead>
                      <TableHead>Stecker</TableHead>
                      <TableHead>Status</TableHead>
                      <SortableHead sortKey="ocpp_id" sort={sort} onToggle={toggle}>OCPP-ID</SortableHead>
                      <SortableHead sortKey="address" sort={sort} onToggle={toggle}>Standort</SortableHead>
                      <SortableHead sortKey="max_power_kw" sort={sort} onToggle={toggle}>Leistung</SortableHead>
                      <SortableHead sortKey="last_heartbeat" sort={sort} onToggle={toggle}>Letzter Heartbeat</SortableHead>
                      <TableHead className="w-12">QR</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((cp) => {
                      const perConnector = getConnectorStatuses(cp);
                      const effective = getEffectiveStatus(cp);
                      const cfg = STATUS_CONFIG[effective] || STATUS_CONFIG.offline;
                      const active = activeSessions.find((s) => s.charge_point_id === cp.id);
                      return (
                        <TableRow key={cp.id}>
                          <TableCell
                            className="font-medium cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setDetail(cp)}
                          >
                            {cp.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{tenantName(cp.tenant_id)}</TableCell>
                          <TableCell>
                            <ConnectorTypeIcons
                              connectorType={cp.connector_type}
                              connectorCount={cp.connector_count}
                              connectorStatuses={perConnector}
                            />
                          </TableCell>
                          <TableCell>
                            <StatusLiveDataHover chargePointId={cp.id}>
                              <Badge variant={cfg.variant} className="cursor-help">{cfg.label}</Badge>
                            </StatusLiveDataHover>
                            {active && (
                              <span className="ml-2 text-xs text-muted-foreground">{fmtKwh(active.energy_kwh, 1)}</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{cp.ocpp_id || "—"}</TableCell>
                          <TableCell className="text-sm">{cp.address || "—"}</TableCell>
                          <TableCell>{fmtKw(cp.max_power_kw)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {cp.last_heartbeat ? format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <ChargePointQrCode ocppId={cp.ocpp_id ?? ""} name={cp.name} address={cp.address} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              items={[
                                { label: "Details & OCPP-Log", icon: ScrollText, onClick: () => setDetail(cp) },
                                { label: "Zum Mandanten", icon: ExternalLink, onClick: () => navigate(`/super-admin/tenants/${cp.tenant_id}`) },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Sheet open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.name}</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Mandant</span><div>{tenantName(detail.tenant_id)}</div></div>
                <div><span className="text-muted-foreground">OCPP-ID</span><div className="font-mono text-xs">{detail.ocpp_id || "—"}</div></div>
                <div><span className="text-muted-foreground">Hersteller / Modell</span><div>{[detail.vendor, detail.model].filter(Boolean).join(" / ") || "—"}</div></div>
                <div><span className="text-muted-foreground">Max. Leistung</span><div>{fmtKw(detail.max_power_kw)}</div></div>
                <div><span className="text-muted-foreground">Adresse</span><div>{detail.address || "—"}</div></div>
                <div><span className="text-muted-foreground">Firmware</span><div>{detail.firmware_version || "—"}</div></div>
                <div><span className="text-muted-foreground">WS-Verbindung</span><div>{detail.ws_connected ? "verbunden" : "getrennt"}</div></div>
                <div>
                  <span className="text-muted-foreground">Letzter Heartbeat</span>
                  <div>{detail.last_heartbeat ? format(new Date(detail.last_heartbeat), "dd.MM.yyyy HH:mm") : "—"}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Stecker</div>
                <div className="flex flex-wrap gap-2">
                  {getConnectorStatuses(detail).map((c) => {
                    const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.offline;
                    return (
                      <Badge key={c.connectorId} variant={cfg.variant}>
                        #{c.connectorId} · {cfg.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">OCPP-Log</div>
                <OcppLogViewer chargePointId={detail.id} ocppId={detail.ocpp_id} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
