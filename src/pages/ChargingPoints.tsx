import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { useDemoPath } from "@/contexts/DemoMode";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useChargePoints, ChargePoint } from "@/hooks/useChargePoints";
import type { ChargePointConnector } from "@/hooks/useChargePointConnectors";
import { useChargerModels } from "@/hooks/useChargerModels";
import { useChargingSessions } from "@/hooks/useChargingSessions";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, PlugZap, Trash2, Zap, ZapOff, AlertTriangle, WifiOff, Info, Search, MapPin, ChevronDown, QrCode, Settings, Shield, Eye, EyeOff, RefreshCw, Copy, Lock, Unlock, Globe } from "lucide-react";
import PublicStatusLinkDialog from "@/components/charging/PublicStatusLinkDialog";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { ChargePointGroupsManager } from "@/components/charging/ChargePointGroupsManager";
import { Checkbox } from "@/components/ui/checkbox";
import ChargePointQrCode from "@/components/charging/ChargePointQrCode";
import ConnectorTypeIcons from "@/components/charging/ConnectorTypeIcons";
import { format } from "date-fns";
import { fmtKwh, fmtKw, normalizeConnectorStatus } from "@/lib/formatCharging";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ChargingOverviewStats from "@/components/charging/ChargingOverviewStats";
import ModbusWallboxWizard from "@/components/charging/ModbusWallboxWizard";
import { StatusLiveDataHover } from "@/components/charging/StatusLiveDataHover";
import { useLocations } from "@/hooks/useLocations";

const LazyChargePointsMap = lazy(() => import("@/components/charging/ChargePointsMap"));

import { getOcppHost, getOcppWssUrl } from "@/lib/ocppEnvironment";
const OCPP_ENDPOINT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-central`;
const OCPP_WS_ENDPOINT_URL = getOcppWssUrl();

const ChargingPoints = () => {
  const navigate = useNavigate();
  const demoPath = useDemoPath();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const { chargePoints, isLoading, addChargePoint, updateChargePoint, deleteChargePoint } = useChargePoints();
  const { locations } = useLocations();
  const { sessions } = useChargingSessions();
  const { chargerModels, vendors: knownVendors, getModelsForVendor } = useChargerModels();
  const chargePointIds = useMemo(() => chargePoints.map((cp) => cp.id).sort().join(","), [chargePoints]);
  const { data: allConnectors = [] } = useQuery({
    queryKey: ["charge-point-connectors", tenant?.id, "all", chargePointIds],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const ids = chargePoints.map((cp) => cp.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("charge_point_connectors")
        .select("*")
        .in("charge_point_id", ids)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as ChargePointConnector[];
    },
  });

  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel(`charge-point-connectors-overview-${tenant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "charge_point_connectors" }, () => {
        queryClient.invalidateQueries({ queryKey: ["charge-point-connectors", tenant.id, "all"] });
        queryClient.invalidateQueries({ queryKey: ["charge-points", tenant.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, tenant?.id]);

  const statusConfig: Record<string, { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap; color: string }> = {
    available: { labelKey: "charging.statusAvailable", variant: "default", icon: Zap, color: "text-green-500" },
    charging: { labelKey: "chargingStats.occupied", variant: "secondary", icon: PlugZap, color: "text-blue-500" },
    faulted: { labelKey: "charging.statusFaulted", variant: "destructive", icon: AlertTriangle, color: "text-red-500" },
    unavailable: { labelKey: "charging.statusUnavailable", variant: "outline", icon: ZapOff, color: "text-yellow-500" },
    offline: { labelKey: "charging.statusOffline", variant: "outline", icon: WifiOff, color: "text-orange-500" },
    unconfigured: { labelKey: "charging.statusUnconfigured", variant: "outline", icon: Settings, color: "text-purple-500" },
  };


  const [addOpen, setAddOpen] = useState(false);
  const [publicLinkOpen, setPublicLinkOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<ChargePoint | null>(null);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const generatePw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const arr = new Uint32Array(32);
    crypto.getRandomValues(arr);
    let pw = "";
    for (let i = 0; i < 32; i++) pw += chars[arr[i] % chars.length];
    return pw;
  };
  const [form, setForm] = useState({
    name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22",
    vendor: "", model: "", connector_type: "Type2",
    connection_protocol: "wss" as "ws" | "wss",
    auth_required: true,
    ocpp_password: generatePw(),
    location_id: "__none__",
  });
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

  const connectorsByChargePoint = useMemo(() => {
    const map = new Map<string, ChargePointConnector[]>();
    for (const connector of allConnectors) {
      const list = map.get(connector.charge_point_id) ?? [];
      list.push(connector);
      map.set(connector.charge_point_id, list);
    }
    return map;
  }, [allConnectors]);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === "active" || !s.stop_time),
    [sessions],
  );

  const getActiveSession = (cpId: string) => activeSessions.find((s) => s.charge_point_id === cpId);

  // Liefert pro Stecker den aufbereiteten Status (inkl. aktiver Sessions pro connector_id)
  const getConnectorStatuses = (cp: ChargePoint): { connectorId: number; status: string }[] => {
    const wsOnline = cp.ws_connected !== false;
    const connectors = connectorsByChargePoint.get(cp.id) ?? [];
    const activeConnectorIds = new Set(
      activeSessions
        .filter((s) => s.charge_point_id === cp.id)
        .map((s) => s.connector_id)
        .filter((id) => typeof id === "number" && id > 0),
    );
    // Fallback: aktive Session ohne (oder mit 0) connector_id -> belegt den ersten Stecker
    const hasUnassignedActive = activeSessions.some(
      (s) => s.charge_point_id === cp.id && (!s.connector_id || s.connector_id <= 0),
    );

    if (connectors.length > 0) {
      return connectors
        .slice()
        .sort((a, b) => a.connector_id - b.connector_id)
        .map((c, idx) => {
          // Bei offline-Wallbox immer "offline" — eine alte aktive Session darf nicht
          // als "charging" erscheinen, weil der reale Zustand unbekannt ist.
          if (!wsOnline) {
            return { connectorId: c.connector_id, status: "offline" };
          }
          const isActive = activeConnectorIds.has(c.connector_id) || (hasUnassignedActive && idx === 0 && activeConnectorIds.size === 0);
          return {
            connectorId: c.connector_id,
            status: isActive ? "charging" : normalizeConnectorStatus(c.status, wsOnline),
          };
        });
    }

    const count = Math.max(1, cp.connector_count || 1);
    return Array.from({ length: count }, (_, i) => {
      const connectorId = i + 1;
      if (!wsOnline) {
        return { connectorId, status: "offline" };
      }
      const isActive = activeConnectorIds.has(connectorId) || (hasUnassignedActive && i === 0 && activeConnectorIds.size === 0);
      return {
        connectorId,
        status: isActive ? "charging" : normalizeConnectorStatus(cp.status, wsOnline),
      };
    });
  };

  const getEffectiveStatus = (cp: ChargePoint) => {
    const statuses = getConnectorStatuses(cp).map((c) => c.status);
    if (statuses.length === 0) {
      return normalizeConnectorStatus(cp.status, cp.ws_connected !== false);
    }
    // Harte Zustände gewinnen immer
    const hardPriority = ["faulted", "offline", "unconfigured", "unavailable"];
    const hard = hardPriority.find((s) => statuses.includes(s));
    if (hard) return hard;

    if (statuses.some((s) => s === "available")) return "available";
    if (statuses.every((s) => s === "charging")) return "charging";
    return statuses[0];
  };

  const getConnectorStatusCount = (status: string) =>
    chargePoints.reduce((sum, cp) => {
      const statuses = getConnectorStatuses(cp).map((c) => c.status);
      return sum + statuses.filter((s) => s === status).length;
    }, 0);


  const filteredChargePoints = statusFilter
    ? chargePoints.filter((cp) => getEffectiveStatus(cp) === statusFilter)
    : chargePoints;
  const effectiveChargePoints = chargePoints.map((cp) => ({ ...cp, status: getEffectiveStatus(cp) }));
  const effectiveFilteredChargePoints = filteredChargePoints.map((cp) => ({ ...cp, status: getEffectiveStatus(cp) }));

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const resetForm = () => {
    setForm({
      name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22",
      vendor: "", model: "", connector_type: "Type2",
      connection_protocol: "wss", auth_required: true, ocpp_password: generatePw(),
      location_id: "__none__",
    });
    setAddCoords({ lat: null, lng: null });
    setShowAddPassword(false);
  };

  const handleAdd = () => {
    if (!tenant?.id) return;
    addChargePoint.mutate({
      tenant_id: tenant.id,
      name: form.name,
      ocpp_id: form.ocpp_id.trim() || null,
      address: form.address || null,
      latitude: addCoords.lat,
      longitude: addCoords.lng,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: Math.max(0.1, parseFloat(form.max_power_kw) || 22),
      vendor: form.vendor || null,
      model: form.model || null,
      connector_type: form.connector_type || "Type2",
      connection_protocol: form.connection_protocol,
      auth_required: form.auth_required,
      ocpp_password: form.auth_required ? form.ocpp_password : null,
      location_id: form.location_id && form.location_id !== "__none__" ? form.location_id : null,
      ...(duplicateSource?.group_id ? { group_id: duplicateSource.group_id } : {}),
    } as any);
    setAddOpen(false);
    setDuplicateSource(null);
    resetForm();
  };

  const handleDuplicate = (cp: ChargePoint) => {
    setDuplicateSource(cp);
    setForm({
      name: "",
      ocpp_id: "",
      address: cp.address ?? "",
      connector_count: String(cp.connector_count ?? 1),
      max_power_kw: String(cp.max_power_kw ?? 22),
      vendor: cp.vendor ?? "",
      model: cp.model ?? "",
      connector_type: cp.connector_type ?? "Type2",
      connection_protocol: ((cp as any).connection_protocol === "ws" ? "ws" : "wss"),
      auth_required: (cp as any).auth_required ?? true,
      ocpp_password: generatePw(),
      location_id: cp.location_id ?? "__none__",
    });
    setAddCoords({
      lat: cp.latitude ?? null,
      lng: cp.longitude ?? null,
    });
    setShowAddPassword(false);
    setAddOpen(true);
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

  const wsScheme = form.connection_protocol === "ws" ? "ws" : "wss";
  const wsHostUrl = `${wsScheme}://${getOcppHost()}`;

  const ocppHint = (
    <Alert className="mt-4">
      <Info className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p className="font-medium">{t("charging.ocppHintTitle" as any)}</p>

        <p className="text-sm font-medium mt-2">Option 1: WebSocket ({wsScheme}://)</p>
        <code className="block text-xs bg-muted p-2 rounded break-all select-all">
          {wsHostUrl}/{form.ocpp_id || "{OCPP_ID}"}
        </code>
        <p className="text-sm text-muted-foreground">
          Subprotokoll: <strong>ocpp1.6</strong> · Port: <strong>{wsScheme === "wss" ? "443" : "80"}</strong>
        </p>
        {form.auth_required && form.ocpp_password && (
          <>
            <p className="text-sm font-medium mt-2">Basic-Auth Passwort</p>
            <code className="block text-xs bg-muted p-2 rounded break-all select-all">{form.ocpp_password}</code>
          </>
        )}

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

  const connectionBlock = (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <p className="text-sm font-medium flex items-center gap-2"><Shield className="h-4 w-4" /> Verbindungs-Konfiguration</p>

      <div>
        <Label className="text-xs">Protokoll</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={() => setForm({ ...form, connection_protocol: "wss" })}
            className={`flex items-center gap-2 p-2 border rounded-md text-sm ${form.connection_protocol === "wss" ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <Lock className="h-4 w-4" /> wss:// (empfohlen)
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, connection_protocol: "ws" })}
            className={`flex items-center gap-2 p-2 border rounded-md text-sm ${form.connection_protocol === "ws" ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <Unlock className="h-4 w-4" /> ws:// (unverschlüsselt)
          </button>
        </div>
        {form.connection_protocol === "ws" && (
          <p className="text-xs text-destructive mt-1">
            ⚠ Daten werden im Klartext übertragen. Nur für Wallboxen ohne TLS-Support.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Passwort-geschützt (Basic Auth)</Label>
          <p className="text-xs text-muted-foreground">Aus, wenn die Wallbox keine Passwort-Eingabe unterstützt.</p>
        </div>
        <Switch
          checked={form.auth_required}
          onCheckedChange={(v) => setForm({ ...form, auth_required: v, ocpp_password: v ? (form.ocpp_password || generatePw()) : "" })}
        />
      </div>

      {form.auth_required && (
        <div>
          <Label className="text-xs">OCPP-Passwort</Label>
          <div className="flex gap-2">
            <Input
              type={showAddPassword ? "text" : "password"}
              value={form.ocpp_password}
              onChange={(e) => setForm({ ...form, ocpp_password: e.target.value })}
              className="flex-1 font-mono text-xs"
              autoComplete="new-password"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowAddPassword((v) => !v)}>
              {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, ocpp_password: generatePw() })} title="Neu generieren">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(form.ocpp_password); toast({ title: "Passwort kopiert" }); }} title="Kopieren">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Alert className="py-2">
        <Info className="h-3.5 w-3.5" />
        <AlertDescription className="text-xs">
          Falls die Wallbox ein Server-Zertifikat verlangt: <strong>„Amazon Root CA 1"</strong> oder <strong>„Let's Encrypt R3"</strong> wählen. Eigene Client-Zertifikate folgen in einer kommenden Version.
        </AlertDescription>
      </Alert>
    </div>
  );

  const formFields = (
    <div className="space-y-4">
      <div><Label>{t("charging.name" as any)}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div>
        <Label>OCPP-ID (ChargeBox Identity) <span className="text-xs text-muted-foreground font-normal">— optional, kann bei Inbetriebnahme nachgetragen werden</span></Label>
        <Input value={form.ocpp_id} onChange={(e) => setForm({ ...form, ocpp_id: e.target.value })} placeholder="z.B. CP001 (leer lassen, falls noch unbekannt)" />
      </div>
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
      <div>
        <Label>Liegenschaft <span className="text-xs text-muted-foreground font-normal">— optional, direkte Zuordnung</span></Label>
        <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
          <SelectTrigger><SelectValue placeholder="Keine / via Gruppe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Keine / via Gruppe</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
      {connectionBlock}
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
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setPublicLinkOpen(true)}>
                  <Globe className="h-4 w-4 mr-2" />Öffentlicher Link
                </Button>
                <ModbusWallboxWizard onCreated={() => queryClient.invalidateQueries({ queryKey: ["charge-points"] })} />
                <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setDuplicateSource(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setDuplicateSource(null); resetForm(); }}><Plus className="h-4 w-4 mr-2" />{t("charging.addChargePoint" as any)}</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {duplicateSource ? `Ladepunkt duplizieren` : t("charging.newChargePoint" as any)}
                      </DialogTitle>
                      {duplicateSource && (
                        <p className="text-xs text-muted-foreground">
                          Dupliziert von: <span className="font-medium">{duplicateSource.name}</span> — Name und OCPP-ID neu vergeben.
                        </p>
                      )}
                    </DialogHeader>
                    {formFields}
                    <Button onClick={handleAdd} disabled={!form.name}>{t("common.create" as any)}</Button>
                  </DialogContent>
                </Dialog>
                <PublicStatusLinkDialog open={publicLinkOpen} onOpenChange={setPublicLinkOpen} />
              </div>
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
                  <p className="text-2xl font-bold">{chargePoints.reduce((sum, cp) => sum + (cp.connector_count || 1), 0).toLocaleString("de-DE")}</p>
                  <p className="text-sm text-muted-foreground">{t("charging.all" as any)}</p>
                </div>
              </CardContent>
            </Card>
            {Object.entries(statusConfig).map(([key, cfg]) => {
              const count = getConnectorStatusCount(key);
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
          <ChargingOverviewStats chargePoints={effectiveChargePoints} sessions={sessions} />

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
                          <TableHead>{t("charging.connectorTypes" as any)}</TableHead>
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
                          const effectiveStatus = getEffectiveStatus(cp);
                          const cfg = statusConfig[effectiveStatus] || statusConfig.offline;
                          const activeSession = getActiveSession(cp.id);
                          const perConnectorStatuses = getConnectorStatuses(cp);
                          const occupiedCount = perConnectorStatuses.filter((c) => c.status === "charging").length;
                          const totalConnectors = perConnectorStatuses.length;
                          return (
                            <TableRow key={cp.id}>
                              <TableCell className="font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(demoPath(`/charging/points/${cp.id}`))}>{cp.name}</TableCell>
                              <TableCell>
                                <ConnectorTypeIcons
                                  connectorType={cp.connector_type}
                                  connectorCount={cp.connector_count}
                                  connectorStatuses={perConnectorStatuses}
                                />
                              </TableCell>
                              <TableCell>
                                <StatusLiveDataHover chargePointId={cp.id}>
                                  <Badge variant={cfg.variant} className="cursor-help">
                                    {t(cfg.labelKey as any)}
                                  </Badge>
                                </StatusLiveDataHover>
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
                                <ChargePointQrCode ocppId={cp.ocpp_id ?? ""} name={cp.name} address={cp.address} />
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Duplizieren"
                                      onClick={(e) => { e.stopPropagation(); handleDuplicate(cp); }}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>{t("charging.deleteConfirm" as any)}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            <strong>{cp.name}</strong>{cp.ocpp_id ? ` (${cp.ocpp_id})` : ""} {t("charging.deleteChargePointDesc" as any)}
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
                  chargePoints={effectiveFilteredChargePoints}
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
