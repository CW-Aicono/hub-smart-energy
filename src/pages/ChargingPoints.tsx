import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useChargePoints, ChargePoint } from "@/hooks/useChargePoints";
import { useChargingSessions } from "@/hooks/useChargingSessions";
import { useLocations } from "@/hooks/useLocations";
import { useTenant } from "@/hooks/useTenant";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, PlugZap, Trash2, Edit, Zap, ZapOff, AlertTriangle, WifiOff, Info } from "lucide-react";
import { format } from "date-fns";
import { fmtKwh, fmtKw } from "@/lib/formatCharging";

const OCPP_ENDPOINT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-central`;
const OCPP_WS_ENDPOINT_URL = `${import.meta.env.VITE_SUPABASE_URL?.replace("https://", "wss://")}/functions/v1/ocpp-ws-proxy`;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap }> = {
  available: { label: "Verfügbar", variant: "default", icon: Zap },
  charging: { label: "Lädt", variant: "secondary", icon: PlugZap },
  faulted: { label: "Gestört", variant: "destructive", icon: AlertTriangle },
  unavailable: { label: "Nicht verfügbar", variant: "outline", icon: ZapOff },
  offline: { label: "Offline", variant: "outline", icon: WifiOff },
};

const ChargingPoints = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { chargePoints, isLoading, addChargePoint, updateChargePoint, deleteChargePoint } = useChargePoints();
  const { sessions } = useChargingSessions();
  const { locations } = useLocations();

  const [addOpen, setAddOpen] = useState(false);
  const [editCp, setEditCp] = useState<ChargePoint | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ocpp_id: "", location_id: "", connector_count: "1", max_power_kw: "22" });

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const resetForm = () => setForm({ name: "", ocpp_id: "", location_id: "", connector_count: "1", max_power_kw: "22" });

  const handleAdd = () => {
    if (!tenant?.id) return;
    addChargePoint.mutate({
      tenant_id: tenant.id,
      name: form.name,
      ocpp_id: form.ocpp_id,
      location_id: form.location_id || null,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: parseFloat(form.max_power_kw) || 22,
    });
    setAddOpen(false);
    resetForm();
  };

  const handleEdit = () => {
    if (!editCp) return;
    updateChargePoint.mutate({
      id: editCp.id,
      name: form.name,
      ocpp_id: form.ocpp_id,
      location_id: form.location_id || null,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: parseFloat(form.max_power_kw) || 22,
    });
    setEditCp(null);
    resetForm();
  };

  const openEdit = (cp: ChargePoint) => {
    setForm({
      name: cp.name,
      ocpp_id: cp.ocpp_id,
      location_id: cp.location_id || "",
      connector_count: String(cp.connector_count),
      max_power_kw: String(cp.max_power_kw),
    });
    setEditCp(cp);
  };

  const getLocationName = (id: string | null) => {
    if (!id) return "—";
    return locations.find((l) => l.id === id)?.name || "—";
  };

  const getActiveSession = (cpId: string) => sessions.find((s) => s.charge_point_id === cpId && s.status === "active");

  const filteredChargePoints = statusFilter
    ? chargePoints.filter((cp) => cp.status === statusFilter)
    : chargePoints;

  const ocppHint = (
    <Alert className="mt-4">
      <Info className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p className="font-medium">OCPP-Integrationshinweise</p>

        <p className="text-sm font-medium mt-2">Option 1: WebSocket (empfohlen)</p>
        <p className="text-sm text-muted-foreground">
          Für Ladestationen, die <code>ws://</code> oder <code>wss://</code> verwenden (Standard bei den meisten Herstellern):
        </p>
        <code className="block text-xs bg-muted p-2 rounded break-all select-all">
          {OCPP_WS_ENDPOINT_URL}/{form.ocpp_id || "{OCPP_ID}"}
        </code>
        <p className="text-sm text-muted-foreground">
          Subprotokoll: <strong>ocpp1.6</strong> — Kein externer Proxy nötig.
        </p>

        <p className="text-sm font-medium mt-2">Option 2: HTTP POST</p>
        <p className="text-sm text-muted-foreground">
          Alternativ können OCPP-Nachrichten direkt per HTTP POST gesendet werden:
        </p>
        <code className="block text-xs bg-muted p-2 rounded break-all select-all">
          {OCPP_ENDPOINT_URL}/{form.ocpp_id || "{OCPP_ID}"}
        </code>

        <p className="text-sm text-muted-foreground mt-2">
          Protokoll: <strong>OCPP 1.6 JSON</strong>. Die <strong>OCPP-ID</strong> muss in der Ladestation 
          als <em>ChargeBox Identity</em> konfiguriert werden und mit dem hier eingetragenen Wert übereinstimmen.
        </p>
      </AlertDescription>
    </Alert>
  );

  const formFields = (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>OCPP-ID (ChargeBox Identity)</Label><Input value={form.ocpp_id} onChange={(e) => setForm({ ...form, ocpp_id: e.target.value })} placeholder="z.B. CP001" /></div>
      <div>
        <Label>Standort</Label>
        <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
          <SelectTrigger><SelectValue placeholder="Standort wählen" /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Anschlüsse</Label><Input type="number" value={form.connector_count} onChange={(e) => setForm({ ...form, connector_count: e.target.value })} /></div>
        <div><Label>Max. Leistung (kW)</Label><Input type="number" value={form.max_power_kw} onChange={(e) => setForm({ ...form, max_power_kw: e.target.value })} /></div>
      </div>
      {ocppHint}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("charging.chargePoints" as any)}</h1>
              <p className="text-muted-foreground">{t("charging.chargePointsDesc" as any)}</p>
            </div>
            {isAdmin && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}><Plus className="h-4 w-4 mr-2" />Ladepunkt hinzufügen</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Neuer Ladepunkt</DialogTitle></DialogHeader>
                  {formFields}
                  <Button onClick={handleAdd} disabled={!form.name || !form.ocpp_id}>Erstellen</Button>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(statusConfig).map(([key, cfg]) => {
              const count = chargePoints.filter((cp) => cp.status === key).length;
              const isActive = statusFilter === key;
              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-colors ${isActive ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  onClick={() => setStatusFilter(isActive ? null : key)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <cfg.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-2xl font-bold">{count.toLocaleString("de-DE")}</p>
                      <p className="text-sm text-muted-foreground">{cfg.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                {statusFilter ? `Ladepunkte: ${statusConfig[statusFilter]?.label}` : "Alle Ladepunkte"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Laden...</p>
              ) : filteredChargePoints.length === 0 ? (
                <p className="text-muted-foreground">{statusFilter ? "Keine Ladepunkte mit diesem Status." : "Keine Ladepunkte vorhanden."}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>OCPP-ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Standort</TableHead>
                      <TableHead>Leistung</TableHead>
                      <TableHead>Letzter Heartbeat</TableHead>
                      {isAdmin && <TableHead className="w-24">Aktionen</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChargePoints.map((cp) => {
                      const cfg = statusConfig[cp.status] || statusConfig.offline;
                      const activeSession = getActiveSession(cp.id);
                      return (
                        <TableRow key={cp.id}>
                          <TableCell className="font-medium">{cp.name}</TableCell>
                          <TableCell className="font-mono text-sm">{cp.ocpp_id}</TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            {activeSession && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {fmtKwh(activeSession.energy_kwh, 1)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{getLocationName(cp.location_id)}</TableCell>
                          <TableCell>{fmtKw(cp.max_power_kw)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {cp.last_heartbeat ? format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm") : "—"}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(cp)}><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => deleteChargePoint.mutate(cp.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          <Dialog open={!!editCp} onOpenChange={(open) => { if (!open) setEditCp(null); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Ladepunkt bearbeiten</DialogTitle></DialogHeader>
              {formFields}
              <Button onClick={handleEdit} disabled={!form.name || !form.ocpp_id}>Speichern</Button>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
};

export default ChargingPoints;
