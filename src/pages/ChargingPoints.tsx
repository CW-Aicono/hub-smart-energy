import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useChargePoints, ChargePoint } from "@/hooks/useChargePoints";
import { useChargerModels } from "@/hooks/useChargerModels";
import { useChargingSessions } from "@/hooks/useChargingSessions";
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
import { Plus, PlugZap, Trash2, Zap, ZapOff, AlertTriangle, WifiOff, Info, Search, MapPin } from "lucide-react";
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
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { chargePoints, isLoading, addChargePoint, deleteChargePoint } = useChargePoints();
  const { sessions } = useChargingSessions();
  const { chargerModels, vendors: knownVendors, getModelsForVendor } = useChargerModels();

  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "" });
  const [addCoords, setAddCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [addGeocoding, setAddGeocoding] = useState(false);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const resetForm = () => { setForm({ name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "" }); setAddCoords({ lat: null, lng: null }); };

  const handleAdd = () => {
    if (!tenant?.id) return;
    addChargePoint.mutate({
      tenant_id: tenant.id,
      name: form.name,
      ocpp_id: form.ocpp_id,
      address: form.address || null,
      latitude: addCoords.lat,
      longitude: addCoords.lng,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: Math.max(0.1, parseFloat(form.max_power_kw) || 22),
      vendor: form.vendor || null,
      model: form.model || null,
    } as any);
    setAddOpen(false);
    resetForm();
  };


  const geocodeAddAddress = async () => {
    if (!form.address.trim()) return;
    setAddGeocoding(true);
    try {
      const query = encodeURIComponent(form.address);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, { headers: { "Accept-Language": "de", "User-Agent": "SmartEnergyHub/1.0" } });
      const data = await res.json();
      if (data.length > 0) {
        setAddCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      }
    } catch { /* ignore */ } finally { setAddGeocoding(false); }
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
        <Label>Adresse / Standort</Label>
        <div className="flex gap-2">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="z.B. Musterstraße 1, 12345 Berlin" className="flex-1" />
          <Button type="button" variant="outline" size="icon" onClick={geocodeAddAddress} disabled={addGeocoding || !form.address.trim()}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {addCoords.lat && addCoords.lng && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {addCoords.lat.toFixed(5)}, {addCoords.lng.toFixed(5)}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Anschlüsse</Label><Input type="number" min="1" value={form.connector_count} onChange={(e) => setForm({ ...form, connector_count: e.target.value })} /></div>
        <div><Label>Max. Leistung (kW)</Label><Input type="number" min="0.1" step="0.1" value={form.max_power_kw} onChange={(e) => { const v = e.target.value; if (v === "" || parseFloat(v) >= 0) setForm({ ...form, max_power_kw: v }); }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Hersteller</Label>
          {knownVendors.length > 0 ? (
            <Select value={form.vendor} onValueChange={(v) => setForm({ ...form, vendor: v, model: "" })}>
              <SelectTrigger><SelectValue placeholder="Hersteller wählen" /></SelectTrigger>
              <SelectContent>
                {knownVendors.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="z.B. ABB, Alfen, Keba" />
          )}
        </div>
        <div>
          <Label>Modell</Label>
          {form.vendor && getModelsForVendor(form.vendor).length > 0 ? (
            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
              <SelectTrigger><SelectValue placeholder="Modell wählen" /></SelectTrigger>
              <SelectContent>
                {getModelsForVendor(form.vendor).map((m) => (
                  <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={form.vendor ? "Kein hinterlegtes Modell" : "Erst Hersteller wählen"} />
          )}
        </div>
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card
              className={`cursor-pointer transition-colors ${statusFilter === null ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"}`}
              onClick={() => setStatusFilter(null)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <PlugZap className={`h-5 w-5 ${statusFilter === null ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-2xl font-bold">{chargePoints.length.toLocaleString("de-DE")}</p>
                  <p className="text-sm text-muted-foreground">Alle</p>
                </div>
              </CardContent>
            </Card>
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
                      {isAdmin && <TableHead className="w-16"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChargePoints.map((cp) => {
                      const cfg = statusConfig[cp.status] || statusConfig.offline;
                      const activeSession = getActiveSession(cp.id);
                      return (
                        <TableRow key={cp.id}>
                          <TableCell className="font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(`/charging/points/${cp.id}`)}>{cp.name}</TableCell>
                          <TableCell className="font-mono text-sm">{cp.ocpp_id}</TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            {activeSession && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {fmtKwh(activeSession.energy_kwh, 1)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{cp.address || "—"}</TableCell>
                          <TableCell>{fmtKw(cp.max_power_kw)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {cp.last_heartbeat ? format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm") : "—"}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => deleteChargePoint.mutate(cp.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

        </div>
      </main>
    </div>
  );
};

export default ChargingPoints;
