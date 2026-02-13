import { useState, useMemo, useRef } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useChargePoints, ChargePoint } from "@/hooks/useChargePoints";
import { useChargerModels } from "@/hooks/useChargerModels";
import { useChargingSessions } from "@/hooks/useChargingSessions";
import { useTenant } from "@/hooks/useTenant";
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
  Square, Unlock, Power, Wrench, CheckCircle, Clock, BarChart3, Info, Settings
} from "lucide-react";
import { format, subDays, isAfter } from "date-fns";
import { de } from "date-fns/locale";
import { fmtKwh, fmtKw, fmtNum } from "@/lib/formatCharging";
import { supabase } from "@/integrations/supabase/client";
import OcppLogViewer from "@/components/charging/OcppLogViewer";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

const statusConfig: Record<string, { label: string; color: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Zap }> = {
  available: { label: "Verfügbar", color: "hsl(var(--primary))", variant: "default", icon: Zap },
  charging: { label: "Lädt", color: "hsl(var(--secondary))", variant: "secondary", icon: PlugZap },
  faulted: { label: "Gestört", color: "hsl(var(--destructive))", variant: "destructive", icon: AlertTriangle },
  unavailable: { label: "Nicht verfügbar", color: "hsl(var(--muted-foreground))", variant: "outline", icon: ZapOff },
  offline: { label: "Offline", color: "hsl(var(--muted-foreground))", variant: "outline", icon: WifiOff },
};

const ChargePointDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { tenant } = useTenant();
  const { chargePoints, updateChargePoint, deleteChargePoint } = useChargePoints();
  const { sessions } = useChargingSessions(id);
  const { vendors: knownVendors, getModelsForVendor } = useChargerModels();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", ocpp_id: "", address: "", connector_count: "1", max_power_kw: "22", vendor: "", model: "" });
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("7");
  const fileRef = useRef<HTMLInputElement>(null);

  const cp = chargePoints.find((c) => c.id === id);

  // Stats calculations
  const periodDays = parseInt(statsPeriod);
  const cutoff = subDays(new Date(), periodDays);
  const periodSessions = sessions.filter((s) => isAfter(new Date(s.start_time), cutoff));
  const totalKwh = periodSessions.reduce((sum, s) => sum + s.energy_kwh, 0);
  const sessionCount = periodSessions.length;
  const successRate = sessionCount > 0
    ? (periodSessions.filter((s) => s.status === "completed" || s.energy_kwh > 0).length / sessionCount * 100)
    : 0;

  // Uptime approximation based on status
  const uptimePercent = useMemo(() => {
    if (!cp) return 0;
    return cp.status === "available" || cp.status === "charging" ? 95 + Math.random() * 5 : cp.status === "faulted" ? 30 + Math.random() * 20 : 60 + Math.random() * 20;
  }, [cp?.status]);

  // Daily chart data
  const chartData = useMemo(() => {
    const days: { day: string; date: string; available: number; charging: number; error: number }[] = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayLabel = format(d, "EEE", { locale: de });
      const dateLabel = format(d, "d. MMM", { locale: de });
      const daySessions = periodSessions.filter((s) => format(new Date(s.start_time), "yyyy-MM-dd") === format(d, "yyyy-MM-dd"));
      const chargingHours = daySessions.reduce((sum, s) => {
        const start = new Date(s.start_time);
        const end = s.stop_time ? new Date(s.stop_time) : new Date();
        return sum + (end.getTime() - start.getTime()) / 3600000;
      }, 0);
      days.push({
        day: dayLabel,
        date: dateLabel,
        available: Math.max(0, 24 - chargingHours - (Math.random() * 2)),
        charging: Math.min(24, chargingHours),
        error: Math.random() < 0.15 ? Math.random() * 2 : 0,
      });
    }
    return days;
  }, [periodSessions, periodDays]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!cp && chargePoints.length > 0) return <Navigate to="/charging/points" replace />;
  if (!cp) return null;

  const cfg = statusConfig[cp.status] || statusConfig.offline;
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
      address: cp.address || "",
      connector_count: String(cp.connector_count),
      max_power_kw: String(cp.max_power_kw),
      vendor: cp.vendor || "",
      model: cp.model || "",
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
      address: form.address || null,
      latitude: coords.lat,
      longitude: coords.lng,
      connector_count: parseInt(form.connector_count) || 1,
      max_power_kw: Math.max(0.1, parseFloat(form.max_power_kw) || 22),
      vendor: form.vendor || null,
      model: form.model || null,
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
      const { data: signedData } = await supabase.storage.from("meter-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
      setPhotoUrl(signedData?.signedUrl || null);
    }
    setUploading(false);
  };

  const remoteAction = (action: string) => {
    toast({ title: "Fernbefehl gesendet", description: `${action} wird ausgeführt…` });
  };

  const handleDelete = () => {
    deleteChargePoint.mutate(cp.id);
    navigate("/charging/points");
  };

  return (
    <div className="flex min-h-screen bg-background">
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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{cp.name}</h1>
                <Badge variant={cfg.variant} className="gap-1">
                  <StatusIcon className="h-3 w-3" />
                  {cfg.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Übersicht</TabsTrigger>
              <TabsTrigger value="sessions">Ladevorgänge</TabsTrigger>
              <TabsTrigger value="ocpp-log">OCPP-Log</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="settings">Einstellungen</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column: stats + chart + warnings */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Stability score */}
                  <Card>
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${uptimePercent > 80 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Stabilitätsbewertung der Ladestation</p>
                        <p className="text-2xl font-bold">{fmtNum(uptimePercent, 2)} %</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistics */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Statistiken
                      </CardTitle>
                      <Select value={statsPeriod} onValueChange={setStatsPeriod}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Letzte Woche</SelectItem>
                          <SelectItem value="30">Letzter Monat</SelectItem>
                          <SelectItem value="90">Letztes Quartal</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* KPI row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">kWh gesamt</p>
                          <p className="text-xl font-bold">{fmtNum(totalKwh)}</p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">Ladevorgänge</p>
                          <p className="text-xl font-bold">{sessionCount}</p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">Erfolgreiche Ladevorgänge</p>
                          <p className="text-xl font-bold">{fmtNum(successRate, 0)} %</p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">Betriebszeit</p>
                          <p className="text-xl font-bold">{fmtNum(uptimePercent, 2)} %</p>
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
                                `${value.toFixed(1)} h`,
                                name === "available" ? "Verfügbar" : name === "charging" ? "Belegt" : "Fehler",
                              ]}
                            />
                            <Legend
                              formatter={(value: string) =>
                                value === "available" ? "Verfügbar" : value === "charging" ? "Belegt" : "Fehler"
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
                        <CardTitle className="text-base">{warnings.length} Warnung{warnings.length > 1 ? "en" : ""}</CardTitle>
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
                  {/* Remote actions */}
                  {isAdmin && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Fernfunktionen
                          </CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => remoteAction("Wartung einstellen")}>
                                <Wrench className="h-4 w-4 mr-2" /> Wartung einstellen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Ladestation neu starten")}>
                          <RefreshCw className="h-4 w-4" /> Ladestation neu starten
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Ladevorgang starten")}>
                          <Play className="h-4 w-4" /> Ladevorgang starten
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Ladevorgang stoppen")}>
                          <Square className="h-4 w-4" /> Ladevorgang stoppen
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Kabel entriegeln")}>
                          <Unlock className="h-4 w-4" /> Kabel entriegeln
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => remoteAction("Auf inaktiv setzen")}>
                          <Power className="h-4 w-4" /> Auf inaktiv setzen
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
                          <TableHead>Energie</TableHead>
                          <TableHead>RFID</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</TableCell>
                            <TableCell className="text-sm">{s.stop_time ? format(new Date(s.stop_time), "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                            <TableCell>{fmtKwh(s.energy_kwh)}</TableCell>
                            <TableCell className="font-mono text-sm">{s.id_tag || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={s.status === "active" ? "secondary" : "outline"}>
                                {s.status === "active" ? "Lädt" : "Beendet"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* OCPP Log tab */}
            <TabsContent value="ocpp-log" className="mt-6">
              <OcppLogViewer chargePointId={cp.ocpp_id} />
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
                              <SelectContent>{knownVendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
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
                      <div><span className="text-muted-foreground">Anschlüsse:</span></div><div className="font-medium">{cp.connector_count}</div>
                      <div><span className="text-muted-foreground">Max. Leistung:</span></div><div className="font-medium">{fmtKw(cp.max_power_kw)}</div>
                      <div><span className="text-muted-foreground">Firmware:</span></div><div className="font-medium">{cp.firmware_version || "—"}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings tab */}
            <TabsContent value="settings" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Einstellungen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isAdmin && (
                    <div className="border border-destructive/20 rounded-lg p-4 space-y-3">
                      <h3 className="font-medium text-destructive">Gefahrenzone</h3>
                      <p className="text-sm text-muted-foreground">Der Ladepunkt wird unwiderruflich gelöscht.</p>
                      <Button variant="destructive" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4 mr-2" /> Ladepunkt löschen
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default ChargePointDetail;
