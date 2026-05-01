import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useChargePoints, ChargePoint } from "@/hooks/useChargePoints";
import { useChargerModels } from "@/hooks/useChargerModels";
import { useChargingSessions, useIdTagResolver } from "@/hooks/useChargingSessions";
import { useTenant } from "@/hooks/useTenant";
import { useTasks } from "@/hooks/useTasks";
import { useChargePointGroups } from "@/hooks/useChargePointGroups";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Zap, PlugZap, AlertTriangle, ZapOff, WifiOff, Camera,
  Trash2, Save, X, MapPin, Search, MoreHorizontal, RefreshCw, Play,
  Square, Unlock, Power, Wrench, CheckCircle, Clock, BarChart3, Info, Settings,
  Shield, Bell, BatteryCharging, Users, Calendar, Timer, Gauge, ExternalLink,
  Eye, EyeOff, Copy
} from "lucide-react";
import { format, subDays, isAfter } from "date-fns";
import { de } from "date-fns/locale";
import { fmtKwh, fmtKw, fmtNum, normalizeConnectorStatus } from "@/lib/formatCharging";
import { mapOcppRejectMessage } from "@/lib/ocppErrorMessages";
import { supabase } from "@/integrations/supabase/client";
import { useOcppMeterValue } from "@/hooks/useOcppMeterValue";
import { useChargePointConnectors } from "@/hooks/useChargePointConnectors";
import { ConnectorStatusGrid } from "@/components/charging/ConnectorStatusGrid";
import { useChargePointStability } from "@/hooks/useChargePointStability";
import OcppLogViewer from "@/components/charging/OcppLogViewer";
import ChargePointQrCode from "@/components/charging/ChargePointQrCode";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { PowerLimitScheduler, PowerLimitSchedule, defaultPowerLimitSchedule } from "@/components/charging/PowerLimitScheduler";
import SingleChargePointMap from "@/components/charging/SingleChargePointMap";
import { AccessControlSettings, AccessSettings } from "@/components/charging/AccessControlSettings";
import ChargePointSolarChargingConfig from "@/components/charging/ChargePointSolarChargingConfig";

const STATUS_KEYS: Record<string, { labelKey: string; color: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap }> = {
  available: { labelKey: "cpd.available", color: "hsl(var(--primary))", variant: "default", icon: Zap },
  charging: { labelKey: "cpd.charging", color: "hsl(var(--secondary))", variant: "secondary", icon: PlugZap },
  faulted: { labelKey: "cpd.faulted", color: "hsl(var(--destructive))", variant: "destructive", icon: AlertTriangle },
  unavailable: { labelKey: "cpd.unavailable", color: "hsl(var(--muted-foreground))", variant: "outline", icon: ZapOff },
  offline: { labelKey: "cpd.offline", color: "hsl(var(--muted-foreground))", variant: "outline", icon: WifiOff },
};

const ChargePointDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { tenant } = useTenant();
  const { chargePoints, updateChargePoint, deleteChargePoint } = useChargePoints();
  const { groups, assignChargePointToGroup } = useChargePointGroups();
  const { createTask } = useTasks();
  const { sessions } = useChargingSessions(id);
  const resolveTag = useIdTagResolver();
  const { vendors: knownVendors, getModelsForVendor } = useChargerModels();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", ocpp_id: "", ocpp_password: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "", connector_type: "Type2", rfid_read_mode: "raw" });
  const [showPassword, setShowPassword] = useState(false);
  const generatePassword = () => {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const pw = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 24);
    setForm((f) => ({ ...f, ocpp_password: pw }));
    setShowPassword(true);
  };
  const CONNECTOR_OPTIONS = [
    { value: "Type2", label: "Typ 2" },
    { value: "CCS", label: "CCS" },
    { value: "CHAdeMO", label: "CHAdeMO" },
    { value: "Other", label: "Sonstige" },
  ];
  const toggleConnectorType = (val: string) => {
    const current = form.connector_type ? form.connector_type.split(",").filter(Boolean) : [];
    const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
    setForm({ ...form, connector_type: next.join(",") });
  };
  const formatConnectorTypes = (ct: string) => {
    const map: Record<string, string> = { Type2: "Typ 2", CCS: "CCS", CHAdeMO: "CHAdeMO", Other: "Sonstige" };
    return ct.split(",").filter(Boolean).map((v) => map[v] || v).join(", ");
  };
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("7");
  const [remoteLoading, setRemoteLoading] = useState<string | null>(null);
  const [powerLimit, setPowerLimit] = useState<PowerLimitSchedule | null>(null);
  const [savingPowerLimit, setSavingPowerLimit] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<number>(1);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const cp = chargePoints.find((c) => c.id === id);
  const cpGroup = cp?.group_id ? groups.find((g) => g.id === cp.group_id) ?? null : null;
  const ocppMeter = useOcppMeterValue(cp?.ocpp_id);
  const { connectors, reorderConnectors } = useChargePointConnectors(cp?.id);

  // Sync powerLimit state from cp when cp loads or changes
  const cpPowerLimit = (cp as any)?.power_limit_schedule as PowerLimitSchedule | null | undefined;
  if (powerLimit === null && cpPowerLimit !== undefined) {
    setPowerLimit(cpPowerLimit ?? defaultPowerLimitSchedule);
  }

  const handleSavePowerLimit = async () => {
    if (!cp || !powerLimit) return;
    setSavingPowerLimit(true);
    try {
      const { error } = await supabase
        .from("charge_points")
        .update({ power_limit_schedule: powerLimit as any })
        .eq("id", cp.id);
      if (error) throw error;
      toast({ title: "Leistungsbegrenzung gespeichert" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSavingPowerLimit(false);
    }
  };

  // Auto-create fault task when status changes to faulted/offline
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!cp || !tenant?.id) return;

    const prevStatus = prevStatusRef.current;
    const currStatus = cp.status;

    // Only trigger when status *changes into* faulted/offline (not on initial mount)
    const isFaultState = currStatus === "faulted" || currStatus === "offline";
    const wasOk = prevStatus !== undefined && prevStatus !== "faulted" && prevStatus !== "offline";

    prevStatusRef.current = currStatus;

    if (!isFaultState || !wasOk) return;

    // Duplicate guard: don't create if an open task already exists for this charge point
    supabase
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("source_id", cp.id)
      .eq("source_type", "charging")
      .in("status", ["open", "in_progress"])
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) return;
        const statusLabel = currStatus === "faulted" ? "Störung (Faulted)" : "Verbindung getrennt (Offline)";
        const detail = cp.last_heartbeat
          ? `Letzter Heartbeat: ${format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm", { locale: de })}`
          : "Kein Heartbeat empfangen";
        createTask.mutate({
          title: `Störung an Ladesäule: ${cp.name}`,
          description: `Status: ${statusLabel}\n${detail}\nOCPP-ID: ${cp.ocpp_id}${cp.address ? `\nStandort: ${cp.address}` : ""}`,
          priority: currStatus === "faulted" ? "high" : "medium",
          source_type: "charging",
          source_id: cp.id,
          source_label: cp.name,
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp?.status, cp?.id, tenant?.id]);

  // Stats calculations
  const periodDays = parseInt(statsPeriod);
  const cutoff = subDays(new Date(), periodDays);
  const periodSessions = sessions.filter((s) => isAfter(new Date(s.start_time), cutoff));
  const totalKwh = periodSessions.reduce((sum, s) => sum + s.energy_kwh, 0);
  const sessionCount = periodSessions.length;
  const successRate = sessionCount > 0
    ? (periodSessions.filter((s) => s.status === "completed" || s.energy_kwh > 0).length / sessionCount * 100)
    : 0;

  // Stabilitätsbewertung: rollierende 30-Tage-Statistik aus charge_point_uptime_snapshots.
  // null = noch nie verbunden (keine Snapshots).
  const { data: uptimePercent = null } = useChargePointStability(cp?.id, 30);

  // Daily chart data – real data only
  const chartData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const days: { day: string; date: string; available: number; charging: number; error: number }[] = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayLabel = format(d, "EEE", { locale: de });
      const dateLabel = format(d, "d. MMM", { locale: de });
      const dateStr = format(d, "yyyy-MM-dd");
      const isToday = dateStr === today;

      const daySessions = periodSessions.filter(
        (s) => format(new Date(s.start_time), "yyyy-MM-dd") === dateStr
      );

      const hoursInDay = isToday ? new Date().getHours() + (new Date().getMinutes() / 60) : 24;

      const chargingHours = Math.min(hoursInDay, daySessions.reduce((sum, s) => {
        const start = new Date(s.start_time);
        const end = s.stop_time ? new Date(s.stop_time) : new Date();
        const dayStart = new Date(dateStr + "T00:00:00");
        const dayEnd = isToday ? new Date() : new Date(dateStr + "T23:59:59.999");
        const effectiveStart = start < dayStart ? dayStart : start;
        const effectiveEnd = end > dayEnd ? dayEnd : end;
        if (effectiveEnd <= effectiveStart) return sum;
        return sum + (effectiveEnd.getTime() - effectiveStart.getTime()) / 3600000;
      }, 0));

      // Approximate: project current status onto all days (no historic status log)
      const errorHours = cp && (cp.status === "faulted" || cp.status === "offline") ? hoursInDay : 0;

      const availableHours = Math.max(0, hoursInDay - chargingHours - errorHours);
      days.push({
        day: dayLabel,
        date: dateLabel,
        available: hoursInDay > 0 ? (availableHours / hoursInDay) * 100 : 0,
        charging: hoursInDay > 0 ? (chargingHours / hoursInDay) * 100 : 0,
        error: hoursInDay > 0 ? (errorHours / hoursInDay) * 100 : 0,
      });
    }
    return days;
  }, [periodSessions, periodDays, cp?.status]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!cp && chargePoints.length > 0) return <Navigate to="/charging/points" replace />;
  if (!cp) return null;

  // Status-Lookup case-insensitiv (DB liefert "Available" mit Großbuchstabe direkt von OCPP)
  const normalizedStatus = normalizeConnectorStatus(cp.status, cp.ws_connected !== false);
  const cfg = STATUS_KEYS[normalizedStatus] || STATUS_KEYS.offline;
  const StatusIcon = cfg.icon;

  // Warnings
  const warnings: { message: string; detail: string; time: string }[] = [];
  if (cp.status === "offline") {
    warnings.push({
      message: "Verbindung zur Ladestation getrennt",
      detail: cp.last_heartbeat ? `Letzter Heartbeat: ${format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm")}` : "Kein Heartbeat empfangen",
      time: cp.last_heartbeat ? format(new Date(cp.last_heartbeat), "dd.MM.yyyy") : "—",
    });
  }
  if (cp.status === "faulted") {
    warnings.push({
      message: "Störung an der Ladestation",
      detail: "Bitte Ladestation vor Ort prüfen",
      time: "Aktuell",
    });
  }

  const startEdit = () => {
    setForm({
      name: cp.name,
      ocpp_id: cp.ocpp_id,
      ocpp_password: cp.ocpp_password || "",
      address: cp.address || "",
      connector_count: String(cp.connector_count),
      max_power_kw: String(cp.max_power_kw),
      vendor: cp.vendor || "",
      model: cp.model || "",
      connector_type: cp.connector_type || "Type2",
      rfid_read_mode: (cp as any).rfid_read_mode || "raw",
    });
    setCoords({ lat: cp.latitude, lng: cp.longitude });
    setPhotoUrl(cp.photo_url || null);
    setEditing(true);
  };

  const saveEdit = () => {
    updateChargePoint.mutate({
      id: cp.id,
      name: form.name,
      ocpp_id: form.ocpp_id,
      ocpp_password: form.ocpp_password ? form.ocpp_password : null,
      address: form.address || null,
      latitude: coords.lat,
      longitude: coords.lng,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: Math.max(0.1, parseFloat(form.max_power_kw) || 22),
      vendor: form.vendor || null,
      model: form.model || null,
      connector_type: form.connector_type || "Type2",
      rfid_read_mode: form.rfid_read_mode || "raw",
      photo_url: photoUrl,
    } as any);
    setEditing(false);
  };

  const geocodeAddress = async () => {
    if (!form.address.trim()) return;
    setGeocoding(true);
    try {
      const query = encodeURIComponent(form.address);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, { headers: { "Accept-Language": "de", "User-Agent": "SmartEnergyHub/1.0" } });
      const data = await res.json();
      if (data.length > 0) {
        setCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        toast({ title: "Koordinaten ermittelt", description: `${parseFloat(data[0].lat).toFixed(5)}, ${parseFloat(data[0].lon).toFixed(5)}` });
      } else {
        toast({ title: "Adresse nicht gefunden", variant: "destructive" });
      }
    } catch { toast({ title: "Geocoding-Fehler", variant: "destructive" }); }
    finally { setGeocoding(false); }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `charge-points/${cp.id}.${ext}`;
    const { error } = await supabase.storage.from("meter-photos").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload fehlgeschlagen", description: error.message, variant: "destructive" });
    } else {
      const { data: signedData } = await supabase.storage.from("meter-photos").createSignedUrl(path, 3600);
      setPhotoUrl(signedData?.signedUrl || null);
    }
    setUploading(false);
  };

  // Energy settings (Lastmanagement, PV-Überschuss-Switch, Günstig-Laden) on charge point
  const cpEnergy = (cp as any)?.energy_settings as
    | {
        dynamic_load_management?: boolean;
        pv_surplus_charging?: boolean;
        cheap_charging_mode?: boolean;
        cheap_charging?: {
          enabled: boolean;
          max_price_eur_mwh: number;
          limit_kw: number;
          use_fallback_window: boolean;
          fallback_time_from: string;
          fallback_time_to: string;
        };
      }
    | undefined;

  const saveEnergySettings = async (patch: Record<string, unknown>) => {
    if (!cp) return;
    const next = { ...(cpEnergy ?? {}), ...patch };
    const { error } = await supabase
      .from("charge_points")
      .update({ energy_settings: next as any })
      .eq("id", cp.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Energieeinstellungen gespeichert" });
    }
  };

  const saveAccessSettings = async (next: AccessSettings) => {
    if (!cp) return;
    const { error } = await supabase
      .from("charge_points")
      .update({ access_settings: next as any })
      .eq("id", cp.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Zugangseinstellungen gespeichert" });
    }
  };


  const callOcppCommand = async (endpoint: string, body: Record<string, unknown>) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-central/command/${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      }
    );
    return res.json();
  };

  const remoteAction = async (action: string) => {
    if (!cp) return;
    setRemoteLoading(action);
    try {
      let result: any;
      switch (action) {
        case "Ladestation neu starten":
          result = await callOcppCommand("Reset", { chargePointId: cp.ocpp_id, type: "Soft" });
          break;
        case "Ladevorgang starten":
          result = await callOcppCommand("RemoteStartTransaction", { chargePointId: cp.ocpp_id, idTag: "ADMIN", connectorId: selectedConnectorId });
          break;
        case "Ladevorgang stoppen": {
          const activeSession = sessions.find((s) => s.status === "active" && s.transaction_id);
          if (!activeSession?.transaction_id) {
            toast({ title: "Fehler", description: "Kein aktiver Ladevorgang gefunden", variant: "destructive" });
            return;
          }
          result = await callOcppCommand("RemoteStopTransaction", { transactionId: activeSession.transaction_id });
          break;
        }
        case "Kabel entriegeln":
          result = await callOcppCommand("UnlockConnector", { chargePointId: cp.ocpp_id, connectorId: selectedConnectorId });
          break;
        case "Auf inaktiv setzen":
          result = await callOcppCommand("ChangeAvailability", { chargePointId: cp.ocpp_id, connectorId: 0, type: "Inoperative" });
          break;
        default:
          toast({ title: "Nicht unterstützt", description: action, variant: "destructive" });
          return;
      }
      if (result?.status === "Accepted") {
        toast({ title: "Fernbefehl gesendet", description: `${action} wird ausgeführt…` });
      } else {
        const friendly = mapOcppRejectMessage(action, result?.message, result?.errorCode);
        toast({ title: "Befehl abgelehnt", description: friendly, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setRemoteLoading(null);
    }
  };

  const handleDelete = () => {
    deleteChargePoint.mutate(cp.id);
    navigate("/charging/points");
  };

// ---- FaultStatus sub-component (display only) ----
interface FaultStatusProps {
  cp: ChargePoint;
}

const FaultStatus = ({ cp }: FaultStatusProps) => {
  const isFaulted = cp.status === "faulted" || cp.status === "offline";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-4 border rounded-lg">
        <div className={`mt-0.5 rounded-full p-1.5 ${isFaulted ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {isFaulted ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">Automatische Störungsmeldung</p>
          <p className="text-sm text-muted-foreground">
            Bei Fehlerstatus oder Verbindungsabbruch wird automatisch eine Aufgabe in der Aufgabenverwaltung erstellt – direkt verknüpft mit diesem Ladepunkt.
          </p>
          {isFaulted && cp.last_heartbeat && (
            <p className="text-sm text-muted-foreground mt-1">
              Letzter Kontakt: {format(new Date(cp.last_heartbeat), "dd.MM.yyyy HH:mm", { locale: de })}
            </p>
          )}
        </div>
        <div className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${isFaulted ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {isFaulted ? "Aktiv" : "OK"}
        </div>
      </div>
      {isFaulted && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Störungsaufgabe wurde automatisch angelegt. Status:{" "}
            <strong>{cp.status === "faulted" ? "Gestört (Faulted)" : "Offline"}</strong>.
          </span>
        </div>
      )}
    </div>
  );
};

// ---- Main Page ----

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6 max-w-7xl">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/charging/points")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              {cp.address && (
                <p className="text-sm text-muted-foreground">{cp.address}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{cp.name}</h1>
                <Badge variant={cfg.variant} className="gap-1">
                  <StatusIcon className="h-3 w-3" />
                  {t(cfg.labelKey as any)}
                </Badge>
                {cpGroup && (
                  <Badge variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate("/charging/points")}>
                    <Users className="h-3 w-3" />
                    {cpGroup.name}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <ChargePointQrCode ocppId={cp.ocpp_id} name={cp.name} address={cp.address} variant="button" />
                {connectors.length > 1 && connectors.map((c) => (
                  <ChargePointQrCode
                    key={c.connector_id}
                    ocppId={cp.ocpp_id}
                    name={cp.name}
                    address={cp.address}
                    connectorId={c.connector_id}
                    connectorName={c.name || undefined}
                    variant="button"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
             <TabsTrigger value="overview">{t("cpd.tabOverview" as any)}</TabsTrigger>
              <TabsTrigger value="sessions">{t("cpd.tabSessions" as any)}</TabsTrigger>
              <TabsTrigger value="ocpp-log">{t("cpd.tabOcppLog" as any)}</TabsTrigger>
              <TabsTrigger value="details">{t("cpd.tabDetails" as any)}</TabsTrigger>
              <TabsTrigger value="energy">{t("cpd.tabEnergy" as any)}</TabsTrigger>
              <TabsTrigger value="access">{t("cpd.tabAccess" as any)}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column: stats + chart + warnings */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Stability score */}
                  <Card>
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${uptimePercent == null ? "bg-muted text-muted-foreground" : uptimePercent > 80 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("cpd.stabilityScore" as any)}</p>
                        <p className="text-2xl font-bold">{uptimePercent == null ? "—" : `${fmtNum(uptimePercent, 2)} %`}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {uptimePercent == null
                            ? "Noch keine Verbindungsdaten – Statistik startet, sobald die Wallbox erstmals verbunden war."
                            : "Online-Anteil der letzten 30 Tage (5-Minuten-Snapshots)"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistics */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        {t("cpd.statistics" as any)}
                      </CardTitle>
                      <Select value={statsPeriod} onValueChange={setStatsPeriod}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">{t("cpd.lastWeek" as any)}</SelectItem>
                          <SelectItem value="30">{t("cpd.lastMonth" as any)}</SelectItem>
                          <SelectItem value="90">{t("cpd.lastQuarter" as any)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* KPI row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">{t("cpd.totalKwhMeter" as any)}</p>
                          <p className="text-xl font-bold">
                            {ocppMeter.value != null ? fmtNum(ocppMeter.value) : fmtNum(totalKwh)}
                          </p>
                          {ocppMeter.timestamp && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Stand: {format(new Date(ocppMeter.timestamp), "dd.MM. HH:mm")}
                            </p>
                          )}
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">{t("cpd.sessions" as any)}</p>
                          <p className="text-xl font-bold">{sessionCount}</p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">{t("cpd.successfulSessions" as any)}</p>
                          <p className="text-xl font-bold">{fmtNum(successRate, 0)} %</p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">{t("cpd.uptime" as any)}</p>
                          <p className="text-xl font-bold">{uptimePercent == null ? "—" : `${fmtNum(uptimePercent, 2)} %`}</p>
                        </div>
                      </div>

                      {/* Stacked bar chart */}
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} barCategoryGap="20%">
                            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                            <YAxis hide />
                            <Tooltip
                              formatter={(value: number, name: string) => [
                                `${value.toFixed(1)} %`,
                                name === "available" ? t("cpd.available" as any) : name === "charging" ? t("cpd.occupied" as any) : t("cpd.error" as any),
                              ]}
                            />
                            <Legend
                              formatter={(value: string) =>
                                value === "available" ? t("cpd.available" as any) : value === "charging" ? t("cpd.occupied" as any) : t("cpd.error" as any)
                              }
                            />
                            <Bar dataKey="available" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="charging" stackId="a" fill="hsl(var(--chart-4))" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="error" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{warnings.length} {warnings.length > 1 ? t("cpd.warningsPlural" as any) : t("cpd.warnings" as any)}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-destructive/5 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{w.message}</p>
                              <p className="text-xs text-muted-foreground">{w.detail}</p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{w.time}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right sidebar */}
                <div className="space-y-6">
                  {/* Connector Status */}
                  {connectors.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <PlugZap className="h-4 w-4" />
                          Anschlüsse
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ConnectorStatusGrid
                          connectors={connectors}
                          selectedConnectorId={selectedConnectorId}
                          onSelectConnector={setSelectedConnectorId}
                          selectable={isAdmin}
                          wsConnected={cp?.ws_connected ?? false}
                          lastHeartbeat={cp?.last_heartbeat ?? null}
                          editable={isAdmin}
                          onReorder={isAdmin ? reorderConnectors : undefined}
                        />
                        {isAdmin && connectors.length > 1 && (
                          <p className="text-[10px] text-muted-foreground mt-2">
                            {(() => { const sc = connectors.find(c => c.connector_id === selectedConnectorId); return sc?.name || `Anschluss ${selectedConnectorId}`; })()} ausgewählt für Fernbefehle
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Remote actions */}
                  {isAdmin && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            {t("cpd.remoteFunctions" as any)}
                          </CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => remoteAction("Wartung einstellen")}>
                                <Wrench className="h-4 w-4 mr-2" /> {t("cpd.maintenance" as any)}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Ladestation neu starten")}>
                          <RefreshCw className="h-4 w-4" /> {t("cpd.restart" as any)}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Ladevorgang starten")}>
                          <Play className="h-4 w-4" /> {t("cpd.startCharging" as any)}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Ladevorgang stoppen")}>
                          <Square className="h-4 w-4" /> {t("cpd.stopCharging" as any)}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Kabel entriegeln")}>
                          <Unlock className="h-4 w-4" /> {t("cpd.unlockCable" as any)}
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Auf inaktiv setzen")}>
                          <Power className="h-4 w-4" /> {t("cpd.setInactive" as any)}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Photo */}
                  <Card>
                    <CardContent className="p-0">
                      <div className="relative w-full aspect-video bg-muted rounded-t-lg overflow-hidden flex items-center justify-center">
                        {cp.photo_url ? (
                          <img src={cp.photo_url} alt={cp.name} className="object-cover w-full h-full" />
                        ) : (
                          <div className="text-muted-foreground flex flex-col items-center gap-2">
                            <Camera className="h-8 w-8" />
                            <span className="text-xs">Kein Foto</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Info card */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Marke und Modell:</span>
                          <span className="font-medium text-right">{[cp.vendor, cp.model].filter(Boolean).join(" · ") || "—"}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Anschlüsse:</span>
                          <span className="font-medium">{cp.connector_count}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max. kW:</span>
                          <span className="font-medium">{fmtKw(cp.max_power_kw)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">OCPP-ID:</span>
                          <span className="font-mono font-medium">{cp.ocpp_id}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Firmware:</span>
                          <span className="font-medium">{cp.firmware_version || "—"}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Standort:</span>
                          <span className="font-medium text-right">{cp.address || "—"}</span>
                        </div>
                        {cp.latitude && cp.longitude && (
                          <>
                            <Separator />
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Koordinaten:</span>
                              <span className="text-xs font-mono flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}
                              </span>
                            </div>
                          </>
                        )}
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Letzter Heartbeat:</span>
                          <span className="font-medium">{cp.last_heartbeat ? format(new Date(cp.last_heartbeat), "dd.MM.yy HH:mm") : "—"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Standortkarte – Drag&Drop des Markers aktualisiert die Koordinaten überall (Übersichtskarte, Lade-App, Detail) */}
              <Card className="mt-6">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Standort auf Karte
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Marker per Drag &amp; Drop auf die exakte Position ziehen. Die
                      Änderung wird automatisch in der Übersichtskarte und der Lade-App übernommen.
                    </p>
                  </div>
                  {cp.latitude && cp.longitude && (
                    <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
                      {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  <SingleChargePointMap
                    latitude={cp.latitude}
                    longitude={cp.longitude}
                    onPositionChange={(lat, lng) => {
                      updateChargePoint.mutate({ id: cp.id, latitude: lat, longitude: lng } as any);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sessions tab */}
            <TabsContent value="sessions" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ladevorgänge</CardTitle>
                </CardHeader>
                <CardContent>
                  {sessions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Keine Ladevorgänge vorhanden.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Start</TableHead>
                          <TableHead>Ende</TableHead>
                          <TableHead>Dauer</TableHead>
                          <TableHead>Energie</TableHead>
                          <TableHead>RFID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Grund</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => {
                          const start = new Date(s.start_time);
                          const end = s.stop_time ? new Date(s.stop_time) : null;
                          const durationMs = end ? end.getTime() - start.getTime() : Date.now() - start.getTime();
                          const durationMin = Math.round(durationMs / 60000);
                          const hours = Math.floor(durationMin / 60);
                          const mins = durationMin % 60;
                          const durationStr = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;

                          const statusLabel = s.status === "active" ? "Lädt" : "Beendet";
                          const statusVariant = s.status === "active" ? "secondary" as const : "outline" as const;

                          const reasonMap: Record<string, string> = {
                            Local: "Lokal",
                            Remote: "Fernsteuerung",
                            EVDisconnected: "Kabel getrennt",
                            PowerLoss: "Stromausfall",
                            Reboot: "Neustart",
                            HardReset: "Hard-Reset",
                            SoftReset: "Soft-Reset",
                            Other: "Sonstiges",
                          };

                          return (
                            <TableRow key={s.id}>
                              <TableCell className="text-sm">{format(start, "dd.MM.yyyy HH:mm")}</TableCell>
                              <TableCell className="text-sm">{end ? format(end, "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                              <TableCell className="text-sm">{durationStr}</TableCell>
                              <TableCell>{fmtKwh(s.energy_kwh)}</TableCell>
                              <TableCell className="text-sm">{resolveTag(s.id_tag) ? <span>{resolveTag(s.id_tag)} <span className="text-muted-foreground font-mono text-xs">({s.id_tag})</span></span> : s.id_tag || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={statusVariant}>{statusLabel}</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {s.stop_reason ? (reasonMap[s.stop_reason] || s.stop_reason) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* OCPP Log tab */}
            <TabsContent value="ocpp-log" className="mt-6">
              <OcppLogViewer chargePointId={cp.id} />
            </TabsContent>

            {/* Details tab */}
            <TabsContent value="details" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Ladepunkt-Details</CardTitle>
                  {isAdmin && !editing && (
                    <Button variant="outline" onClick={startEdit}>Bearbeiten</Button>
                  )}
                </CardHeader>
                <CardContent>
                  {editing ? (
                    <div className="space-y-4 max-w-xl">
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                        <div><Label>OCPP-ID</Label><Input value={form.ocpp_id} onChange={(e) => setForm({ ...form, ocpp_id: e.target.value })} /></div>
                      </div>
                      <div>
                        <Label className="flex items-center gap-1">
                          <Shield className="h-3.5 w-3.5" /> OCPP-Passwort (Basic Auth)
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type={showPassword ? "text" : "password"}
                            value={form.ocpp_password}
                            onChange={(e) => setForm({ ...form, ocpp_password: e.target.value })}
                            placeholder="z.B. 24-stelliges Zufallspasswort"
                            className="flex-1 font-mono"
                            autoComplete="new-password"
                          />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowPassword((v) => !v)} title={showPassword ? "Verbergen" : "Anzeigen"}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button type="button" variant="outline" size="icon" onClick={generatePassword} title="Sicheres Passwort generieren">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          {form.ocpp_password && (
                            <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(form.ocpp_password); toast({ title: "Passwort kopiert" }); }} title="Kopieren">
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Wird vom Ladepunkt im <code>Authorization: Basic</code>-Header beim WebSocket-Handshake gesendet. Leer lassen nur bei Test-Servern ohne Auth.
                        </p>
                      </div>
                      <div>
                        <Label>Adresse / Standort</Label>
                        <div className="flex gap-2">
                          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="z.B. Musterstraße 1, 12345 Berlin" className="flex-1" />
                          <Button variant="outline" size="icon" onClick={geocodeAddress} disabled={geocoding || !form.address.trim()}>
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                        {coords.lat && coords.lng && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                          </p>
                        )}
                        <div className="mt-3">
                          <SingleChargePointMap
                            latitude={coords.lat}
                            longitude={coords.lng}
                            alwaysEditable
                            onPositionChange={(lat, lng) => setCoords({ lat, lng })}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Marker per Drag &amp; Drop verschieben. Änderungen werden mit „Speichern" übernommen.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Anschlüsse</Label><Input type="number" min="1" value={form.connector_count} onChange={(e) => setForm({ ...form, connector_count: e.target.value })} /></div>
                        <div><Label>Max. Leistung (kW)</Label><Input type="number" min="0.1" step="0.1" value={form.max_power_kw} onChange={(e) => { const v = e.target.value; if (v === "" || parseFloat(v) >= 0) setForm({ ...form, max_power_kw: v }); }} /></div>
                      </div>
                      <div>
                        <Label>Steckertypen</Label>
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
                          <Label>Hersteller</Label>
                          {knownVendors.length > 0 ? (
                            <Select value={form.vendor} onValueChange={(v) => setForm({ ...form, vendor: v, model: "" })}>
                              <SelectTrigger><SelectValue placeholder="Hersteller wählen" /></SelectTrigger>
                              <SelectContent>
                                {/* Include current vendor if not in known list */}
                                {form.vendor && !knownVendors.includes(form.vendor) && (
                                  <SelectItem value={form.vendor}>{form.vendor}</SelectItem>
                                )}
                                {knownVendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                          )}
                        </div>
                        <div>
                          <Label>Modell</Label>
                          {form.vendor && getModelsForVendor(form.vendor).length > 0 ? (
                            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                              <SelectTrigger><SelectValue placeholder="Modell wählen" /></SelectTrigger>
                              <SelectContent>{getModelsForVendor(form.vendor).map((m) => <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={form.vendor ? "Kein hinterlegtes Modell" : "Erst Hersteller wählen"} />
                          )}
                      </div>
                      <div>
                        <Label>RFID-Lesemodus</Label>
                        <Select value={form.rfid_read_mode} onValueChange={(v) => setForm({ ...form, rfid_read_mode: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="raw">Original (z.B. 432503FC → 432503FC)</SelectItem>
                            <SelectItem value="nibble_swap">Hex-Stellen je Byte tauschen (z.B. 432503FC → 345230CF)</SelectItem>
                            <SelectItem value="byte_reversed">Byte-Reihenfolge umdrehen (z.B. 432503FC → FC032543)</SelectItem>
                            <SelectItem value="byte_reversed_nibble_swap">Beides kombiniert (z.B. 432503FC → CF305234)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Wie diese Wallbox RFID-Tags ausliest. Beispiel zeigt, wie der Roh-Tag <code>432503FC</code> in den hinterlegten Tag umgerechnet wird. Falsche Auswahl führt zu „Tag unbekannt" – im Zweifel verschiedene Modi testen.
                          <br />
                          <span className="opacity-70">Hinweis: Manche Hersteller (z.B. Wallbe) bezeichnen das Tauschen der Hex-Stellen je Byte selbst als „BYTE_REVERSED". Maßgeblich ist hier das Beispiel.</span>
                        </p>
                      </div>
                      </div>
                      {/* Photo upload */}
                      <div>
                        <Label>Foto</Label>
                        <div className="flex items-center gap-3 mt-1">
                          {photoUrl && <img src={photoUrl} alt="Vorschau" className="h-16 w-16 rounded object-cover" />}
                          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                            {uploading ? "Lädt…" : "Foto hochladen"}
                          </Button>
                          {photoUrl && <Button variant="ghost" size="sm" onClick={() => setPhotoUrl(null)}><Trash2 className="h-4 w-4" /></Button>}
                          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Abbrechen</Button>
                        <Button onClick={saveEdit} disabled={!form.name || !form.ocpp_id}><Save className="h-4 w-4 mr-1" />Speichern</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm max-w-xl">
                      <div><span className="text-muted-foreground">Name:</span></div><div className="font-medium">{cp.name}</div>
                      <div><span className="text-muted-foreground">OCPP-ID:</span></div><div className="font-mono font-medium">{cp.ocpp_id}</div>
                      <div><span className="text-muted-foreground">Standort:</span></div><div className="font-medium">{cp.address || "—"}</div>
                      <div><span className="text-muted-foreground">Hersteller:</span></div><div className="font-medium">{cp.vendor || "—"}</div>
                      <div><span className="text-muted-foreground">Modell:</span></div><div className="font-medium">{cp.model || "—"}</div>
                      <div><span className="text-muted-foreground">Steckertypen:</span></div><div className="font-medium">{formatConnectorTypes(cp.connector_type)}</div>
                      <div><span className="text-muted-foreground">Anschlüsse:</span></div><div className="font-medium">{cp.connector_count}</div>
                      <div><span className="text-muted-foreground">Max. Leistung:</span></div><div className="font-medium">{fmtKw(cp.max_power_kw)}</div>
                      <div><span className="text-muted-foreground">Firmware:</span></div><div className="font-medium">{cp.firmware_version || "—"}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Energy Management tab */}
            <TabsContent value="energy" className="mt-6 space-y-6">
              {cpGroup ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-base">Energiemanagement wird durch Gruppe gesteuert</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Dieser Ladepunkt gehört zur Gruppe <strong>„{cpGroup.name}"</strong>. Die Energiemanagement-Einstellungen werden zentral für alle Ladepunkte der Gruppe verwaltet.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full max-w-md mt-2">
                        <div className="border rounded-lg p-3 text-left">
                          <p className="text-xs text-muted-foreground">Dynamisches Lastmanagement</p>
                          <p className="font-medium text-sm">{cpGroup.energy_settings.dynamic_load_management ? "Aktiv" : "Inaktiv"}</p>
                        </div>
                        <div className="border rounded-lg p-3 text-left">
                          <p className="text-xs text-muted-foreground">PV-Überschussladen</p>
                          <p className="font-medium text-sm">{cpGroup.energy_settings.pv_surplus_charging ? "Aktiv" : "Inaktiv"}</p>
                        </div>
                        {(() => {
                          const pls = (cpGroup.energy_settings as any).power_limit_schedule;
                          const isActive = pls?.enabled;
                          let label = "Keine";
                          let detail: string | null = null;
                          if (isActive) {
                            const limitStr = pls.limit_type === "minimal"
                              ? "Minimale Leistung"
                              : pls.limit_kw ? `${pls.limit_kw} kW` : "—";
                            const timeStr = pls.mode === "allday"
                              ? "Ganztägig"
                              : `${pls.time_from}–${pls.time_to} Uhr`;
                            label = limitStr;
                            detail = timeStr;
                          }
                          return (
                            <div className={`border rounded-lg p-3 text-left ${isActive ? "border-primary/30 bg-primary/5" : ""}`}>
                              <p className="text-xs text-muted-foreground">Leistungsbegrenzung (Gruppe)</p>
                              <p className={`font-medium text-sm ${isActive ? "text-primary" : ""}`}>{label}</p>
                              {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
                            </div>
                          );
                        })()}
                        <div className="border rounded-lg p-3 text-left">
                          <p className="text-xs text-muted-foreground">Günstig-Laden-Modus</p>
                          <p className="font-medium text-sm">{cpGroup.energy_settings.cheap_charging_mode ? "Aktiv" : "Inaktiv"}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/charging/points")}>
                        <ExternalLink className="h-3.5 w-3.5" /> Zur Gruppenkonfiguration
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Gauge className="h-5 w-5" />
                        Leistungsbegrenzung
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {powerLimit && (
                        <PowerLimitScheduler
                          value={powerLimit}
                          onChange={setPowerLimit}
                          onSave={handleSavePowerLimit}
                          isSaving={savingPowerLimit}
                          disabled={!isAdmin}
                          maxPowerKw={cp.max_power_kw}
                        />
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Weitere Energiefunktionen
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Dynamisches Lastmanagement */}
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Dynamisches Lastmanagement</p>
                          <p className="text-sm text-muted-foreground">
                            Leistung automatisch an verfügbare Kapazität anpassen (z. B. Hausanschluss-Limit)
                          </p>
                        </div>
                        <Switch
                          checked={cpEnergy?.dynamic_load_management ?? false}
                          onCheckedChange={(v) => saveEnergySettings({ dynamic_load_management: v })}
                          disabled={!isAdmin}
                        />
                      </div>

                      {/* PV-Überschussladen */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">PV-Überschussladen</p>
                            <p className="text-sm text-muted-foreground">
                              Laden priorisiert mit eigenem Solarstrom
                            </p>
                          </div>
                          <Switch
                            checked={cpEnergy?.pv_surplus_charging ?? false}
                            onCheckedChange={(v) => saveEnergySettings({ pv_surplus_charging: v })}
                            disabled={!isAdmin}
                          />
                        </div>
                        {cpEnergy?.pv_surplus_charging && (
                          <ChargePointSolarChargingConfig
                            chargePointId={cp.id}
                            locationId={cp.location_id}
                            isAdmin={isAdmin}
                            pvSurplusEnabled={true}
                          />
                        )}
                      </div>

                      {/* Günstig-Laden */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Günstig-Laden-Modus</p>
                            <p className="text-sm text-muted-foreground">
                              Laden automatisch in Niedrigtarifzeiten verschieben
                            </p>
                          </div>
                          <Switch
                            checked={cpEnergy?.cheap_charging?.enabled ?? cpEnergy?.cheap_charging_mode ?? false}
                            onCheckedChange={(v) => {
                              const prev = cpEnergy?.cheap_charging ?? {
                                max_price_eur_mwh: 60,
                                limit_kw: 11,
                                use_fallback_window: true,
                                fallback_time_from: "22:00",
                                fallback_time_to: "06:00",
                                enabled: false,
                              };
                              saveEnergySettings({
                                cheap_charging_mode: v,
                                cheap_charging: { ...prev, enabled: v },
                              });
                            }}
                            disabled={!isAdmin}
                          />
                        </div>

                        {(cpEnergy?.cheap_charging?.enabled ?? cpEnergy?.cheap_charging_mode) && (
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                            <div className="space-y-1">
                              <Label className="text-xs">Max. Preis (€/MWh)</Label>
                              <Input
                                type="number"
                                value={cpEnergy?.cheap_charging?.max_price_eur_mwh ?? 60}
                                onChange={(e) => {
                                  const prev = cpEnergy?.cheap_charging ?? {
                                    enabled: true,
                                    limit_kw: 11,
                                    use_fallback_window: true,
                                    fallback_time_from: "22:00",
                                    fallback_time_to: "06:00",
                                    max_price_eur_mwh: 60,
                                  };
                                  saveEnergySettings({
                                    cheap_charging: { ...prev, max_price_eur_mwh: Number(e.target.value) },
                                  });
                                }}
                                className="h-8 text-sm"
                                disabled={!isAdmin}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Lade-Limit (kW)</Label>
                              <Input
                                type="number"
                                value={cpEnergy?.cheap_charging?.limit_kw ?? 11}
                                onChange={(e) => {
                                  const prev = cpEnergy?.cheap_charging ?? {
                                    enabled: true,
                                    max_price_eur_mwh: 60,
                                    use_fallback_window: true,
                                    fallback_time_from: "22:00",
                                    fallback_time_to: "06:00",
                                    limit_kw: 11,
                                  };
                                  saveEnergySettings({
                                    cheap_charging: { ...prev, limit_kw: Number(e.target.value) },
                                  });
                                }}
                                className="h-8 text-sm"
                                disabled={!isAdmin}
                              />
                            </div>
                            <div className="col-span-2 flex items-center gap-2 pt-1">
                              <Switch
                                checked={cpEnergy?.cheap_charging?.use_fallback_window ?? true}
                                onCheckedChange={(v) => {
                                  const prev = cpEnergy?.cheap_charging ?? {
                                    enabled: true,
                                    max_price_eur_mwh: 60,
                                    limit_kw: 11,
                                    fallback_time_from: "22:00",
                                    fallback_time_to: "06:00",
                                    use_fallback_window: true,
                                  };
                                  saveEnergySettings({
                                    cheap_charging: { ...prev, use_fallback_window: v },
                                  });
                                }}
                                disabled={!isAdmin}
                              />
                              <Label className="text-xs">Fallback-Zeitfenster nutzen, wenn keine Spotpreise verfügbar</Label>
                            </div>
                            {(cpEnergy?.cheap_charging?.use_fallback_window ?? true) && (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-xs">Von</Label>
                                  <Input
                                    type="time"
                                    value={cpEnergy?.cheap_charging?.fallback_time_from ?? "22:00"}
                                    onChange={(e) => {
                                      const prev = cpEnergy?.cheap_charging ?? {
                                        enabled: true,
                                        max_price_eur_mwh: 60,
                                        limit_kw: 11,
                                        use_fallback_window: true,
                                        fallback_time_to: "06:00",
                                        fallback_time_from: "22:00",
                                      };
                                      saveEnergySettings({
                                        cheap_charging: { ...prev, fallback_time_from: e.target.value },
                                      });
                                    }}
                                    className="h-8 text-sm"
                                    disabled={!isAdmin}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Bis</Label>
                                  <Input
                                    type="time"
                                    value={cpEnergy?.cheap_charging?.fallback_time_to ?? "06:00"}
                                    onChange={(e) => {
                                      const prev = cpEnergy?.cheap_charging ?? {
                                        enabled: true,
                                        max_price_eur_mwh: 60,
                                        limit_kw: 11,
                                        use_fallback_window: true,
                                        fallback_time_from: "22:00",
                                        fallback_time_to: "06:00",
                                      };
                                      saveEnergySettings({
                                        cheap_charging: { ...prev, fallback_time_to: e.target.value },
                                      });
                                    }}
                                    className="h-8 text-sm"
                                    disabled={!isAdmin}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Diese Einstellungen gelten nur für diesen Ladepunkt.
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Access Control tab */}
            <TabsContent value="access" className="mt-6 space-y-6">
              {cpGroup ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-base">Zugangssteuerung wird durch Gruppe gesteuert</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Dieser Ladepunkt gehört zur Gruppe <strong>„{cpGroup.name}"</strong>. Die Zugangseinstellungen werden zentral für alle Ladepunkte der Gruppe verwaltet.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full max-w-md mt-2">
                        <div className="border rounded-lg p-3 text-left">
                          <p className="text-xs text-muted-foreground">Freies Laden</p>
                          <p className="font-medium text-sm">{cpGroup.access_settings.free_charging ? "Erlaubt" : "Nicht erlaubt"}</p>
                        </div>
                        <div className="border rounded-lg p-3 text-left">
                          <p className="text-xs text-muted-foreground">Nutzergruppen-Beschränkung</p>
                          <p className="font-medium text-sm">{cpGroup.access_settings.user_group_restriction ? "Aktiv" : "Inaktiv"}</p>
                        </div>
                        <div className="border rounded-lg p-3 text-left col-span-2">
                          <p className="text-xs text-muted-foreground">Maximale Ladedauer</p>
                          <p className="font-medium text-sm">{cpGroup.access_settings.max_charging_duration_min} min</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/charging/points")}>
                        <ExternalLink className="h-3.5 w-3.5" /> Zur Gruppenkonfiguration
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Autorisierung
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Freies Laden erlauben</p>
                          <p className="text-sm text-muted-foreground">Laden ohne RFID-Karte oder App-Autorisierung ermöglichen</p>
                        </div>
                        <Switch disabled />
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Nutzergruppen-Beschränkung</p>
                          <p className="text-sm text-muted-foreground">Nur bestimmte Nutzergruppen für diesen Ladepunkt zulassen</p>
                        </div>
                        <Switch disabled />
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Maximale Ladedauer</p>
                          <p className="text-sm text-muted-foreground">Ladevorgang nach Zeitlimit automatisch beenden</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input type="number" className="w-20" defaultValue="480" disabled />
                          <span className="text-sm text-muted-foreground">min</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" /> Diese Funktionen werden in einem zukünftigen Update verfügbar. Alternativ können Sie eine Gruppe erstellen und die Einstellungen dort verwalten.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Benachrichtigungen
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FaultStatus cp={cp} />
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default ChargePointDetail;
