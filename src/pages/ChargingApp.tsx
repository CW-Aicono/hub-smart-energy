import { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Zap, Map, QrCode, History, Receipt, User, LogOut, Loader2, ArrowLeft,
  Filter, Navigation, PlugZap, AlertTriangle, ZapOff, WifiOff, Check,
  ScanLine, X, MapPin, BatteryCharging, Clock, ChevronRight, Mail, Lock, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fmtKwh, fmtKw, fmtCurrency } from "@/lib/formatCharging";

// ---- Types ----
interface AppChargePoint {
  id: string;
  ocpp_id: string;
  name: string;
  status: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  max_power_kw: number;
  connector_type: string;
  connector_count: number;
  vendor: string | null;
  model: string | null;
}

interface AppSession {
  id: string;
  charge_point_id: string | null;
  start_time: string;
  stop_time: string | null;
  energy_kwh: number;
  status: string;
  stop_reason: string | null;
}

interface AppInvoice {
  id: string;
  invoice_number: string | null;
  total_energy_kwh: number;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

// ---- Auth Screen ----
type AuthView = "login" | "register" | "forgotPassword";

function ChargingAppAuth({ onAuth }: { onAuth: () => void }) {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("Invalid login") ? "Ungültige Zugangsdaten" : error.message);
    } else {
      onAuth();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Passwort muss mindestens 6 Zeichen haben"); return; }
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + "/ev", data: { display_name: name } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("already registered") ? "E-Mail bereits registriert" : error.message);
    } else {
      // Link to charging_users will happen after email confirmation via trigger or on first login
      toast.success("Registrierung erfolgreich! Bitte E-Mail bestätigen.");
      setView("login");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Bitte E-Mail eingeben"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/ev",
    });
    setLoading(false);
    if (error) { toast.error("Fehler beim Senden"); } else {
      toast.success("Rücksetz-Link gesendet!");
      setView("login");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6" style={{ paddingTop: "env(safe-area-inset-top, 20px)" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <BatteryCharging className="h-9 w-9 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">EV Charging</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {view === "login" ? "Anmelden" : view === "register" ? "Konto erstellen" : "Passwort zurücksetzen"}
          </p>
        </div>

        {view === "forgotPassword" ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10 text-base" required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Link senden"}
            </Button>
            <button type="button" onClick={() => setView("login")} className="w-full text-sm text-muted-foreground flex items-center justify-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Zurück zum Login
            </button>
          </form>
        ) : (
          <form onSubmit={view === "login" ? handleLogin : handleRegister} className="space-y-4">
            {view === "register" && (
              <div className="space-y-2">
                <Label>Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 pl-10 text-base" placeholder="Max Mustermann" required />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10 text-base" required />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Passwort</Label>
                {view === "login" && (
                  <button type="button" onClick={() => setView("forgotPassword")} className="text-xs text-primary hover:underline">
                    Passwort vergessen?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10 pr-10 text-base" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-3.5 text-muted-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : view === "login" ? "Anmelden" : "Registrieren"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {view === "login" ? "Noch kein Konto?" : "Bereits registriert?"}{" "}
              <button type="button" onClick={() => setView(view === "login" ? "register" : "login")} className="text-primary hover:underline font-medium">
                {view === "login" ? "Registrieren" : "Anmelden"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---- Map Tab ----
const LazyMap = lazy(() => import("@/components/charging/ChargePointsMap"));

function MapTab({ chargePoints, onSelect }: { chargePoints: AppChargePoint[]; onSelect: (cp: AppChargePoint) => void }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [minPower, setMinPower] = useState(0);
  const [connectorFilter, setConnectorFilter] = useState<string>("all");
  const [showPowerSlider, setShowPowerSlider] = useState(false);
  const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);

  const filtered = useMemo(() => {
    return chargePoints.filter((cp) => {
      if (typeFilter === "AC" && cp.max_power_kw > 43) return false;
      if (typeFilter === "DC" && cp.max_power_kw <= 43) return false;
      if (cp.max_power_kw < minPower) return false;
      if (connectorFilter !== "all" && cp.connector_type !== connectorFilter) return false;
      return true;
    });
  }, [chargePoints, typeFilter, minPower, connectorFilter]);

  // Points visible on the map (intersection of filtered + map bounds)
  const visibleFiltered = useMemo(() => {
    if (!visibleIds) return filtered;
    return filtered.filter((cp) => visibleIds.has(cp.id));
  }, [filtered, visibleIds]);

  const handleVisiblePointsChange = useCallback((ids: Set<string>) => {
    setVisibleIds(ids);
  }, []);

  const connectorTypes = [...new Set(chargePoints.map((cp) => cp.connector_type).filter(Boolean))];
  const hasActiveFilter = typeFilter !== "all" || minPower > 0 || connectorFilter !== "all";

  return (
    <div className="flex flex-col h-full">
      {/* Map with overlay filters */}
      <div className="flex-1 relative" style={{ minHeight: "300px" }}>
        {filtered.some((cp) => cp.latitude && cp.longitude) ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <LazyMap chargePoints={filtered as any} showLocateButton onVisiblePointsChange={handleVisiblePointsChange} />
          </Suspense>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Keine Ladestationen mit Koordinaten verfügbar
          </div>
        )}

        {/* Filter overlay on map */}
        <div className="absolute top-3 left-3 right-14 z-[1000] flex flex-col gap-2">
          {/* Row 1: Type + Connector chips */}
          <div className="flex gap-1.5 flex-wrap">
            {["all", "AC", "DC"].map((t) => (
              <Button
                key={t}
                variant={typeFilter === t ? "default" : "secondary"}
                size="sm"
                className="h-8 text-xs shadow-md rounded-full px-3"
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? "Alle" : t}
              </Button>
            ))}
            <Separator orientation="vertical" className="h-8 mx-0.5" />
            {connectorTypes.map((ct) => (
              <Button
                key={ct}
                variant={connectorFilter === ct ? "default" : "secondary"}
                size="sm"
                className="h-8 text-xs shadow-md rounded-full px-3"
                onClick={() => setConnectorFilter(connectorFilter === ct ? "all" : ct)}
              >
                {ct}
              </Button>
            ))}
          </div>

          {/* Row 2: Power filter */}
          <div className="flex items-center gap-2">
            <Button
              variant={minPower > 0 ? "default" : "secondary"}
              size="sm"
              className="h-8 text-xs shadow-md rounded-full px-3 gap-1"
              onClick={() => setShowPowerSlider(!showPowerSlider)}
            >
              <Zap className="h-3 w-3" />
              {minPower > 0 ? `≥ ${minPower} kW` : "Leistung"}
            </Button>
            {hasActiveFilter && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 text-xs shadow-md rounded-full px-3"
                onClick={() => { setTypeFilter("all"); setMinPower(0); setConnectorFilter("all"); setShowPowerSlider(false); }}
              >
                <X className="h-3 w-3 mr-1" /> Reset
              </Button>
            )}
            <Badge variant="secondary" className="shadow-md text-xs h-6">{visibleFiltered.length}</Badge>
          </div>

          {/* Power slider dropdown */}
          {showPowerSlider && (
            <div className="bg-background/95 backdrop-blur-sm rounded-xl shadow-lg border p-3 max-w-[250px]">
              <Label className="text-xs font-medium">Mindestleistung: {minPower} kW</Label>
              <Slider value={[minPower]} onValueChange={([v]) => setMinPower(v)} min={0} max={350} step={5} className="mt-2" />
            </div>
          )}
        </div>
      </div>

      {/* Station list */}
      <div className="max-h-[35vh] overflow-auto border-t">
        {visibleFiltered.map((cp) => (
          <button
            key={cp.id}
            onClick={() => onSelect(cp)}
            className="w-full flex items-center gap-3 p-3 border-b hover:bg-muted/50 text-left transition-colors"
          >
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              cp.status === "available" ? "bg-primary/10 text-primary" :
              cp.status === "charging" ? "bg-blue-500/10 text-blue-500" :
              "bg-muted text-muted-foreground"
            }`}>
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{cp.name}</p>
              <p className="text-xs text-muted-foreground truncate">{cp.address || "Kein Standort"}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium">{fmtKw(cp.max_power_kw)}</p>
              <p className="text-xs text-muted-foreground">{cp.connector_type}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Station Detail ----
function StationDetail({ cp, onBack, onStartCharge }: { cp: AppChargePoint; onBack: () => void; onStartCharge: (cpId: string) => void }) {
  const statusLabel: Record<string, string> = {
    available: "Verfügbar", charging: "Belegt", faulted: "Gestört", unavailable: "Nicht verfügbar", offline: "Offline",
  };
  const canCharge = cp.status === "available";

  const openNavigation = () => {
    if (cp.latitude && cp.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${cp.latitude},${cp.longitude}`, "_blank");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h2 className="font-bold text-lg">{cp.name}</h2>
          {cp.address && <p className="text-xs text-muted-foreground">{cp.address}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Status</p><Badge variant={canCharge ? "default" : "secondary"} className="mt-1">{statusLabel[cp.status] || cp.status}</Badge></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Leistung</p><p className="text-lg font-bold mt-1">{fmtKw(cp.max_power_kw)}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Stecker</p><p className="text-sm font-medium mt-1">{cp.connector_type}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Anschlüsse</p><p className="text-lg font-bold mt-1">{cp.connector_count}</p></CardContent></Card>
        </div>
        {cp.vendor && (
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Hersteller / Modell</p><p className="text-sm font-medium">{cp.vendor} {cp.model && `— ${cp.model}`}</p></CardContent></Card>
        )}
        <div className="flex gap-3">
          {cp.latitude && cp.longitude && (
            <Button variant="outline" className="flex-1 h-12" onClick={openNavigation}>
              <Navigation className="h-4 w-4 mr-2" />Navigation
            </Button>
          )}
          <Button className="flex-1 h-12" disabled={!canCharge} onClick={() => onStartCharge(cp.id)}>
            <PlugZap className="h-4 w-4 mr-2" />{canCharge ? "Ladevorgang starten" : "Nicht verfügbar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- QR Scanner Tab ----
function QrScannerTab({ onScanned }: { onScanned: (data: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animRef = useRef<number>(0);

  const startScan = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const scanFrame = async () => {
        if (!videoRef.current || videoRef.current.readyState !== 4) {
          animRef.current = requestAnimationFrame(scanFrame);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const { default: jsQR } = await import("jsqr");
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            stopScan();
            onScanned(code.data);
            return;
          }
        }
        animRef.current = requestAnimationFrame(scanFrame);
      };
      animRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setError("Kamera-Zugriff nicht möglich");
    }
  }, [onScanned]);

  const stopScan = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stopScan(), [stopScan]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <ScanLine className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">QR-Code scannen</h2>
        <p className="text-sm text-muted-foreground mt-1">Scannen Sie den QR-Code an der Ladestation</p>
      </div>

      {scanning ? (
        <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden border-2 border-primary">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <div className="absolute inset-0 border-[3px] border-primary/30 rounded-2xl" />
          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-primary/50 animate-pulse" />
          <Button variant="secondary" size="sm" className="absolute bottom-3 left-1/2 -translate-x-1/2" onClick={stopScan}>
            <X className="h-4 w-4 mr-1" /> Abbrechen
          </Button>
        </div>
      ) : (
        <Button className="h-14 px-8 text-base" onClick={startScan}>
          <QrCode className="h-5 w-5 mr-2" /> Scanner öffnen
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ---- History Tab ----
function HistoryTab({ sessions, chargePoints }: { sessions: AppSession[]; chargePoints: AppChargePoint[] }) {
  const getCpName = (id: string | null) => chargePoints.find((cp) => cp.id === id)?.name || "Unbekannt";

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <History className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Noch keine Ladevorgänge</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      {sessions.map((s) => {
        const duration = s.stop_time
          ? Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000)
          : null;
        return (
          <div key={s.id} className="flex items-center gap-3 p-4 border-b">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              s.status === "completed" ? "bg-primary/10 text-primary" :
              s.status === "active" ? "bg-blue-500/10 text-blue-500" :
              "bg-muted text-muted-foreground"
            }`}>
              <PlugZap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{getCpName(s.charge_point_id)}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold">{fmtKwh(s.energy_kwh)}</p>
              {duration !== null && <p className="text-xs text-muted-foreground">{duration} Min.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Invoices Tab ----
function InvoicesTab({ invoices }: { invoices: AppInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Receipt className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Keine Rechnungen vorhanden</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      {invoices.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3 p-4 border-b">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{inv.invoice_number || "Entwurf"}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(inv.created_at), "dd.MM.yyyy")}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold">{fmtCurrency(inv.total_amount)}</p>
            <Badge variant={inv.status === "paid" ? "default" : "secondary"} className="text-xs">
              {inv.status === "paid" ? "Bezahlt" : inv.status === "issued" ? "Offen" : "Entwurf"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Profile Tab ----
function ProfileTab({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw] = useState("");

  const handleChangePw = async () => {
    if (newPw.length < 6) { toast.error("Mindestens 6 Zeichen"); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setChangingPw(false);
    if (error) { toast.error(error.message); } else { toast.success("Passwort geändert"); setNewPw(""); }
  };

  return (
    <div className="overflow-auto h-full p-4 space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">{email}</p>
            <p className="text-xs text-muted-foreground">EV Charging Nutzer</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Passwort ändern</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input type="password" placeholder="Neues Passwort" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="h-12" />
          <Button className="w-full h-12" onClick={handleChangePw} disabled={changingPw || !newPw}>
            {changingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : "Passwort ändern"}
          </Button>
        </CardContent>
      </Card>

      <Button variant="destructive" className="w-full h-12" onClick={onLogout}>
        <LogOut className="h-4 w-4 mr-2" /> Abmelden
      </Button>
    </div>
  );
}

// ---- Main App ----
type Tab = "map" | "qr" | "history" | "invoices" | "profile";

const ChargingApp = () => {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("map");
  const [chargePoints, setChargePoints] = useState<AppChargePoint[]>([]);
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [invoices, setInvoices] = useState<AppInvoice[]>([]);
  const [selectedCp, setSelectedCp] = useState<AppChargePoint | null>(null);
  const [loading, setLoading] = useState(false);

  // Ensure charging_users entry exists for app user (no group assignment – done manually later)
  const ensureChargingUser = useCallback(async (authId: string, email: string, displayName?: string) => {
    try {
      const { data: existing } = await supabase
        .from("charging_users")
        .select("id")
        .eq("auth_user_id", authId)
        .maybeSingle();
      if (existing) return;

      // Determine tenant: pick from any app-user group or fall back to first group
      const { data: anyGroup } = await supabase
        .from("charging_user_groups")
        .select("tenant_id")
        .limit(1)
        .maybeSingle();

      if (!anyGroup) return; // No groups configured at all

      await supabase.from("charging_users").insert({
        tenant_id: anyGroup.tenant_id,
        auth_user_id: authId,
        name: displayName || email.split("@")[0],
        email,
        group_id: null, // No group – admin assigns manually
        status: "active",
      });
    } catch (err) {
      console.error("Failed to create charging user entry:", err);
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || "" });
        ensureChargingUser(session.user.id, session.user.email || "", session.user.user_metadata?.display_name);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || "" });
        ensureChargingUser(session.user.id, session.user.email || "", session.user.user_metadata?.display_name);
      }
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [ensureChargingUser]);

  // Load data when authenticated
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      setLoading(true);
      const [cpRes, sessRes, invRes] = await Promise.all([
        supabase.from("charge_points").select("id, ocpp_id, name, status, address, latitude, longitude, max_power_kw, connector_type, connector_count, vendor, model").order("name"),
        supabase.from("charging_sessions").select("id, charge_point_id, start_time, stop_time, energy_kwh, status, stop_reason").order("start_time", { ascending: false }).limit(100),
        supabase.from("charging_invoices").select("id, invoice_number, total_energy_kwh, total_amount, currency, status, created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      if (cpRes.data) setChargePoints(cpRes.data as AppChargePoint[]);
      if (sessRes.data) setSessions(sessRes.data as AppSession[]);
      if (invRes.data) setInvoices(invRes.data as AppInvoice[]);
      setLoading(false);
    };
    loadData();
  }, [user]);

  // Handle QR scanned or deep link
  useEffect(() => {
    const cpParam = searchParams.get("cp");
    if (cpParam && chargePoints.length > 0) {
      const found = chargePoints.find((cp) => cp.ocpp_id === cpParam || cp.id === cpParam);
      if (found) { setSelectedCp(found); setTab("map"); }
    }
  }, [searchParams, chargePoints]);

  const handleQrScanned = (data: string) => {
    // Try to parse QR code - could be URL with cp param or just an OCPP ID
    let ocppId = data;
    try {
      const url = new URL(data);
      ocppId = url.searchParams.get("cp") || data;
    } catch { /* not a URL, use as-is */ }

    const found = chargePoints.find((cp) => cp.ocpp_id === ocppId || cp.id === ocppId);
    if (found) {
      setSelectedCp(found);
      setTab("map");
      toast.success(`Ladestation "${found.name}" erkannt`);
    } else {
      toast.error("Ladestation nicht gefunden");
    }
  };

  const handleStartCharge = async (cpId: string) => {
    const cp = chargePoints.find((c) => c.id === cpId);
    if (!cp) { toast.error("Ladepunkt nicht gefunden"); return; }

    toast.loading("Ladevorgang wird gestartet…", { id: "remote-start" });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-central/command/RemoteStartTransaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            chargePointId: cp.ocpp_id,
            idTag: `APP:${user?.id}`,
            connectorId: 1,
          }),
        }
      );

      const result = await res.json();

      if (result.status === "Accepted") {
        toast.success("Ladebefehl wurde an die Wallbox gesendet", { id: "remote-start" });
      } else {
        toast.error(result.message || "Ladevorgang konnte nicht gestartet werden", { id: "remote-start" });
      }
    } catch (err) {
      console.error("Remote start failed:", err);
      toast.error("Verbindungsfehler – bitte erneut versuchen", { id: "remote-start" });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <ChargingAppAuth onAuth={() => {}} />;
  }

  // Station detail view
  if (selectedCp) {
    return (
      <div className="min-h-screen bg-background flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <StationDetail cp={selectedCp} onBack={() => setSelectedCp(null)} onStartCharge={handleStartCharge} />
      </div>
    );
  }

  const tabs: { key: Tab; icon: typeof Map; label: string }[] = [
    { key: "map", icon: Map, label: "Karte" },
    { key: "qr", icon: QrCode, label: "Scannen" },
    { key: "history", icon: History, label: "Historie" },
    { key: "invoices", icon: Receipt, label: "Rechnungen" },
    { key: "profile", icon: User, label: "Profil" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {tab === "map" && <MapTab chargePoints={chargePoints} onSelect={setSelectedCp} />}
            {tab === "qr" && <QrScannerTab onScanned={handleQrScanned} />}
            {tab === "history" && <HistoryTab sessions={sessions} chargePoints={chargePoints} />}
            {tab === "invoices" && <InvoicesTab invoices={invoices} />}
            {tab === "profile" && <ProfileTab email={user.email} onLogout={handleLogout} />}
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <nav className="border-t bg-background flex" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
              tab === key ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default ChargingApp;
