import { useState, lazy, Suspense } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useDemoPath } from "@/contexts/DemoMode";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, PlugZap, Trash2, Zap, ZapOff, AlertTriangle, WifiOff, Info, Search, MapPin, ChevronDown, QrCode, Settings } from "lucide-react";
import { ChargePointGroupsManager } from "@/components/charging/ChargePointGroupsManager";
import { Checkbox } from "@/components/ui/checkbox";
import ChargePointQrCode from "@/components/charging/ChargePointQrCode";
import { format } from "date-fns";
import { fmtKwh, fmtKw } from "@/lib/formatCharging";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ChargingOverviewStats from "@/components/charging/ChargingOverviewStats";

const LazyChargePointsMap = lazy(() => import("@/components/charging/ChargePointsMap"));

const OCPP_ENDPOINT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-central`;
const OCPP_WS_ENDPOINT_URL = "wss://ocpp.aicono.org";

const ChargingPoints = () => {
  const navigate = useNavigate();
  const demoPath = useDemoPath();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { chargePoints, isLoading, addChargePoint, updateChargePoint, deleteChargePoint } = useChargePoints();
  const { sessions } = useChargingSessions();
  const { chargerModels, vendors: knownVendors, getModelsForVendor } = useChargerModels();

  const statusConfig: Record<string, { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap; color: string }> = {
    available: { labelKey: "charging.statusAvailable", variant: "default", icon: Zap, color: "text-green-500" },
    charging: { labelKey: "charging.statusCharging", variant: "secondary", icon: PlugZap, color: "text-blue-500" },
    faulted: { labelKey: "charging.statusFaulted", variant: "destructive", icon: AlertTriangle, color: "text-red-500" },
    unavailable: { labelKey: "charging.statusUnavailable", variant: "outline", icon: ZapOff, color: "text-yellow-500" },
    offline: { labelKey: "charging.statusOffline", variant: "outline", icon: WifiOff, color: "text-orange-500" },
    unconfigured: { labelKey: "charging.statusUnconfigured", variant: "outline", icon: Settings, color: "text-purple-500" },
  };

  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "", connector_type: "Type2" });
  const CONNECTOR_OPTIONS = [
    { value: "Type2", label: "Typ 2" },
    { value: "CCS", label: "CCS" },
    { value: "CHAdeMO", label: "CHAdeMO" },
    { value: "Other", label: t("charging.other" as any) },
  ];
  const toggleConnectorType = (val: string) => {
    const current = form.connector_type ? form.connector_type.split(",").filter(Boolean) : [];
    const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
    setForm({ ...form, connector_type: next.join(",") });
  };
  const [addCoords, setAddCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [addGeocoding, setAddGeocoding] = useState(false);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const resetForm = () => { setForm({ name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "", connector_type: "Type2" }); setAddCoords({ lat: null, lng: null }); };

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
      connector_type: form.connector_type || "Type2",
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
        <p className="font-medium">{t("charging.ocppHintTitle" as any)}</p>

        <p className="text-sm font-medium mt-2">Option 1: WebSocket</p>
        <p className="text-sm text-muted-foreground">
          <code>wss://</code>
        </p>
        <code className="block text-xs bg-muted p-2 rounded break-all select-all">
          {OCPP_WS_ENDPOINT_URL}/{form.ocpp_id || "{OCPP_ID}"}
        </code>
        <p className="text-sm text-muted-foreground">
          Subprotokoll: <strong>ocpp1.6</strong>
        </p>

        <p className="text-sm font-medium mt-2">Option 2: HTTP POST</p>
        <code className="block text-xs bg-muted p-2 rounded break-all select-all">
          {OCPP_ENDPOINT_URL}/{form.ocpp_id || "{OCPP_ID}"}
        </code>

        <p className="text-sm text-muted-foreground mt-2">
          OCPP 1.6 JSON — ChargeBox Identity
        </p>
      </AlertDescription>
    </Alert>
  );

  const formFields = (
    <div className="space-y-4">
      <div><Label>{t("charging.name" as any)}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>OCPP-ID (ChargeBox Identity)</Label><Input value={form.ocpp_id} onChange={(e) => setForm({ ...form, ocpp_id: e.target.value })} placeholder="z.B. CP001" /></div>
      <div>
        <Label>{t("charging.address" as any)}</Label>
        <div className="flex gap-2">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("charging.addressPlaceholder" as any)} className="flex-1" />
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
        <div><Label>{t("charging.connectors" as any)}</Label><Input type="number" min="1" value={form.connector_count} onChange={(e) => setForm({ ...form, connector_count: e.target.value })} /></div>
        <div><Label>{t("charging.maxPower" as any)}</Label><Input type="number" min="0.1" step="0.1" value={form.max_power_kw} onChange={(e) => { const v = e.target.value; if (v === "" || parseFloat(v) >= 0) setForm({ ...form, max_power_kw: v }); }} /></div>
      </div>
      <div>
        <Label>{t("charging.connectorTypes" as any)}</Label>
        <div className="flex flex-wrap gap-3 mt-2">
          {CONNECTOR_OPTIONS.map((opt) => {
            const selected = form.connector_type.split(",").includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={selected} onCheckedChange={() => toggleConnectorType(opt.value)} />
                <span className="text-sm">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{t("charging.manufacturer" as any)}</Label>
          {knownVendors.length > 0 ? (
            <Select value={form.vendor} onValueChange={(v) => setForm({ ...form, vendor: v, model: "" })}>
              <SelectTrigger><SelectValue placeholder={t("charging.selectManufacturer" as any)} /></SelectTrigger>
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
          <Label>{t("charging.model" as any)}</Label>
          {form.vendor && getModelsForVendor(form.vendor).length > 0 ? (
            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
              <SelectTrigger><SelectValue placeholder={t("charging.selectModel" as any)} /></SelectTrigger>
              <SelectContent>
                {getModelsForVendor(form.vendor).map((m) => (
                  <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={form.vendor ? t("charging.noModel" as any) : t("charging.selectManufacturerFirst" as any)} />
          )}
        </div>
      </div>
      {ocppHint}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
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
                  <Button onClick={resetForm}><Plus className="h-4 w-4 mr-2" />{t("charging.addChargePoint" as any)}</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{t("charging.newChargePoint" as any)}</DialogTitle></DialogHeader>
                  {formFields}
                  <Button onClick={handleAdd} disabled={!form.name || !form.ocpp_id}>{t("common.create" as any)}</Button>
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
                  <p className="text-sm text-muted-foreground">{t("charging.all" as any)}</p>
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
                    <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
                    <div>
                      <p className="text-2xl font-bold">{count.toLocaleString("de-DE")}</p>
                      <p className="text-sm text-muted-foreground">{t(cfg.labelKey as any)}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Statistics */}
          <ChargingOverviewStats chargePoints={chargePoints} sessions={sessions} />

          {/* Groups Manager */}
          <ChargePointGroupsManager isAdmin={isAdmin} />

          {/* Table - collapsible */}
          <Collapsible defaultOpen={false}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {statusFilter ? `${t("charging.chargePointsFiltered" as any)} ${t(statusConfig[statusFilter]?.labelKey as any)}` : t("charging.allChargePoints" as any)}
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {isLoading ? (
                    <p className="text-muted-foreground">{t("charging.loading" as any)}</p>
                  ) : filteredChargePoints.length === 0 ? (
                    <p className="text-muted-foreground">{statusFilter ? t("charging.noChargePointsFiltered" as any) : t("charging.noChargePoints" as any)}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("charging.name" as any)}</TableHead>
                          <TableHead>OCPP-ID</TableHead>
                          <TableHead>{t("common.status" as any)}</TableHead>
                          <TableHead>{t("charging.location" as any)}</TableHead>
                          <TableHead>{t("charging.power" as any)}</TableHead>
                          <TableHead>{t("charging.lastHeartbeat" as any)}</TableHead>
                          <TableHead className="w-12">QR</TableHead>
                          {isAdmin && <TableHead className="w-16"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredChargePoints.map((cp) => {
                          const cfg = statusConfig[cp.status] || statusConfig.offline;
                          const activeSession = getActiveSession(cp.id);
                          return (
                            <TableRow key={cp.id}>
                              <TableCell className="font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(demoPath(`/charging/points/${cp.id}`))}>{cp.name}</TableCell>
                              <TableCell className="font-mono text-sm">{cp.ocpp_id}</TableCell>
                              <TableCell>
                                <Badge variant={cfg.variant}>{t(cfg.labelKey as any)}</Badge>
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
                              <TableCell>
                                <ChargePointQrCode ocppId={cp.ocpp_id} name={cp.name} address={cp.address} />
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>{t("charging.deleteConfirm" as any)}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          <strong>{cp.name}</strong> ({cp.ocpp_id}) {t("charging.deleteChargePointDesc" as any)}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>{t("common.cancel" as any)}</AlertDialogCancel>
                                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteChargePoint.mutate(cp.id)}>
                                          {t("charging.deletePermanently" as any)}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Map */}
          <Card>
            <CardHeader>
              <CardTitle>{t("charging.chargePointLocations" as any)}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-[400px] rounded-lg border bg-muted/50 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">{t("charging.mapLoading" as any)}</div></div>}>
                <LazyChargePointsMap
                  chargePoints={filteredChargePoints}
                  onChargePointClick={(cp) => navigate(demoPath(`/charging/points/${cp.id}`))}
                  showEditPositionButton={true}
                  onPositionChange={(cpId, lat, lng) => {
                    updateChargePoint.mutate({ id: cpId, latitude: lat, longitude: lng });
                  }}
                />
              </Suspense>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
};

export default ChargingPoints;
