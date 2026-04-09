import { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

import {
  Zap, Map, QrCode, History, Receipt, User, LogOut, Loader2, ArrowLeft,
  Filter, Navigation, PlugZap, AlertTriangle, ZapOff, WifiOff, Check,
  ScanLine, X, MapPin, BatteryCharging, Clock, ChevronRight, Mail, Lock, Eye, EyeOff, LocateFixed
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
  isAppCompatible?: boolean;
}

interface AppSession {
  id: string;
  charge_point_id: string | null;
  transaction_id: number | null;
  start_time: string;
  stop_time: string | null;
  energy_kwh: number;
  status: string;
  stop_reason: string | null;
}

interface AppInvoice {
  id: string;
  session_id: string;
  invoice_number: string | null;
  total_energy_kwh: number;
  total_amount: number;
  idle_fee_amount: number;
  currency: string;
  status: string;
  issued_at: string | null;
  created_at: string;
}

interface AppTenantInfo {
  name: string;
  logo_url: string | null;
  branding: Record<string, string>;
}

interface AppTariff {
  price_per_kwh: number;
  base_fee: number;
  idle_fee_per_minute: number;
  idle_fee_grace_minutes: number;
  currency: string;
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

function MapTab({ chargePoints, onStartCharge, initialCpId, onInitialCpHandled }: { chargePoints: AppChargePoint[]; onStartCharge: (cpId: string) => void; initialCpId?: string | null; onInitialCpHandled?: () => void }) {
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [minPower, setMinPower] = useState(0);
  const [connectorFilter, setConnectorFilter] = useState<string>("all");
  const [compatFilter, setCompatFilter] = useState<string>("all"); // "all" | "app" | "public"
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCp, setSelectedCp] = useState<AppChargePoint | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [locationGroup, setLocationGroup] = useState<AppChargePoint[] | null>(null);
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [publicPoints, setPublicPoints] = useState<AppChargePoint[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const publicFetchedRef = useRef(false);

  // Fetch public charge points from OpenChargeMap
  useEffect(() => {
    if (publicFetchedRef.current) return;
    // Determine center: use own charge points or default to Germany center
    let lat = 51.1657;
    let lng = 10.4515;
    const withCoords = chargePoints.filter(cp => cp.latitude && cp.longitude);
    if (withCoords.length > 0) {
      lat = withCoords.reduce((s, cp) => s + (cp.latitude || 0), 0) / withCoords.length;
      lng = withCoords.reduce((s, cp) => s + (cp.longitude || 0), 0) / withCoords.length;
    }
    publicFetchedRef.current = true;
    setPublicLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/openchargemap?latitude=${lat}&longitude=${lng}&distance=30&maxresults=150`, {
      headers: { "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          // Filter out points that overlap with own charge points (within ~50m)
          const ownCoords = chargePoints
            .filter(cp => cp.latitude && cp.longitude)
            .map(cp => ({ lat: cp.latitude!, lng: cp.longitude! }));
          const filtered = data.filter((p: AppChargePoint) => {
            if (!p.latitude || !p.longitude) return false;
            return !ownCoords.some(o =>
              Math.abs(o.lat - p.latitude!) < 0.0005 && Math.abs(o.lng - p.longitude!) < 0.0005
            );
          });
          setPublicPoints(filtered);
        }
      })
      .catch(err => console.error("Failed to load public charge points:", err))
      .finally(() => setPublicLoading(false));
  }, [chargePoints]);

  // Merge own + public charge points
  const allPoints = useMemo(() => {
    const own = chargePoints.map(cp => ({ ...cp, isAppCompatible: true }));
    const pub = publicPoints.map(cp => ({ ...cp, isAppCompatible: false }));
    return [...own, ...pub];
  }, [chargePoints, publicPoints]);

  const filtered = useMemo(() => {
    return allPoints.filter((cp) => {
      // Compatibility filter
      if (compatFilter === "app" && !cp.isAppCompatible) return false;
      if (compatFilter === "public" && cp.isAppCompatible) return false;
      // Type filter
      if (typeFilter === "AC" && cp.max_power_kw > 43) return false;
      if (typeFilter === "DC" && cp.max_power_kw <= 43) return false;
      if (cp.max_power_kw > 0 && cp.max_power_kw < minPower) return false;
      if (connectorFilter !== "all" && !cp.connector_type.split(",").includes(connectorFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !cp.name.toLowerCase().includes(q) &&
          !(cp.address || "").toLowerCase().includes(q) &&
          !cp.connector_type.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [allPoints, typeFilter, minPower, connectorFilter, compatFilter, searchQuery]);

  const connectorTypes = [...new Set(allPoints.flatMap((cp) => cp.connector_type.split(",")).filter(Boolean))];
  const hasActiveFilter = typeFilter !== "all" || minPower > 0 || connectorFilter !== "all" || compatFilter !== "all";

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) { toast.error("Geolocation wird nicht unterstützt"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserPos([pos.coords.latitude, pos.coords.longitude]); setLocating(false); },
      () => { toast.error("Standort konnte nicht ermittelt werden"); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleCpClick = useCallback((cp: AppChargePoint) => {
    // Check if multiple charge points share the same coordinates
    const colocated = allPoints.filter(
      (other) =>
        other.latitude != null &&
        other.longitude != null &&
        cp.latitude != null &&
        cp.longitude != null &&
        Math.abs(other.latitude - cp.latitude) < 0.0001 &&
        Math.abs(other.longitude - cp.longitude) < 0.0001
    );
    if (colocated.length > 1) {
      setLocationGroup(colocated);
      setLocationDrawerOpen(true);
    } else {
      setSelectedCp(cp);
      setDrawerOpen(true);
    }
  }, [allPoints]);

  // Handle deep-link / QR initial charge point
  useEffect(() => {
    if (initialCpId && chargePoints.length > 0) {
      const found = chargePoints.find((cp) => cp.ocpp_id === initialCpId || cp.id === initialCpId);
      if (found) {
        setSelectedCp(found);
        setDrawerOpen(true);
      }
      onInitialCpHandled?.();
    }
  }, [initialCpId, chargePoints, onInitialCpHandled]);


  const statusLabel: Record<string, string> = {
    available: "Verfügbar", charging: "Belegt", faulted: "Gestört", unavailable: "Nicht verfügbar", offline: "Offline",
  };

  const openNavigation = (cp: AppChargePoint) => {
    if (!cp.latitude || !cp.longitude) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${cp.latitude},${cp.longitude}`;
    const appleUrl = `maps://maps.apple.com/?daddr=${cp.latitude},${cp.longitude}&dirflg=d`;
    if (isIOS) {
      // Show both options on iOS
      window.open(appleUrl, "_blank");
    } else {
      window.open(googleUrl, "_blank");
    }
  };

  return (
    <div className="relative flex-1 w-full" style={{ minHeight: 0 }}>
      {/* Fullscreen map */}
      <div className="absolute inset-0">
        {filtered.some((cp) => cp.latitude && cp.longitude) ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <LazyMap chargePoints={filtered as any} onChargePointClick={(cp: any) => handleCpClick(cp as AppChargePoint)} externalUserPos={userPos} className="!h-full !rounded-none !border-0 [&_.leaflet-control-zoom]:!hidden" />
          </Suspense>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm bg-muted/30">
            Keine Ladestationen mit Koordinaten verfügbar
          </div>
        )}
      </div>

      {/* Bottom controls: search bar with action buttons */}
      {!drawerOpen && !filterOpen && !locationDrawerOpen && <div className="absolute bottom-4 left-3 right-3 z-[1000] flex items-center gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ladestation suchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-10 pr-10 rounded-full shadow-lg border bg-background/95 backdrop-blur-sm text-base"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          size="icon"
          variant="secondary"
          className={`h-12 w-12 rounded-full shadow-lg bg-background/95 backdrop-blur-sm border shrink-0 ${hasActiveFilter ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterOpen(true)}
        >
          <Filter className={`h-5 w-5 ${hasActiveFilter ? "text-primary" : ""}`} />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full shadow-lg bg-background/95 backdrop-blur-sm border shrink-0"
          onClick={handleLocate}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LocateFixed className={`h-5 w-5 ${userPos ? "text-primary" : ""}`} />
          )}
        </Button>
      </div>}

      {/* Filter drawer – slides up from bottom like station info */}
      <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
        <DrawerContent>
          <div className="px-4 pb-6 pt-2 space-y-4">
            <DrawerHeader className="p-0">
              <div className="flex items-center justify-between">
                <DrawerTitle>Filter</DrawerTitle>
                {hasActiveFilter && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setTypeFilter("all"); setMinPower(0); setConnectorFilter("all"); setCompatFilter("all"); }}>
                    Zurücksetzen
                  </Button>
                )}
              </div>
            </DrawerHeader>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Typ</Label>
              <div className="flex gap-1.5">
                {["all", "AC", "DC"].map((t) => (
                  <Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm" className="flex-1 h-9" onClick={() => setTypeFilter(t)}>
                    {t === "all" ? "Alle" : t}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ladeleistung</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {[{ label: "Alle", value: 0 }, { label: "50+ kW", value: 50 }, { label: "100+ kW", value: 100 }, { label: "150+ kW", value: 150 }].map((opt) => (
                  <Button key={opt.value} variant={minPower === opt.value ? "default" : "outline"} size="sm" className="h-9" onClick={() => setMinPower(opt.value)}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {connectorTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Steckertyp</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant={connectorFilter === "all" ? "default" : "outline"} size="sm" className="h-9" onClick={() => setConnectorFilter("all")}>Alle</Button>
                  {connectorTypes.map((ct) => (
                    <Button key={ct} variant={connectorFilter === ct ? "default" : "outline"} size="sm" className="h-9" onClick={() => setConnectorFilter(ct)}>
                      {ct === "Type2" ? "Typ 2" : ct === "Other" ? "Sonstige" : ct}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Kompatibilität</Label>
              <div className="flex gap-1.5">
                {[
                  { key: "all", label: "Alle" },
                  { key: "app", label: "App-kompatibel" },
                  { key: "public", label: "Öffentlich" },
                ].map((opt) => (
                  <Button key={opt.key} variant={compatFilter === opt.key ? "default" : "outline"} size="sm" className="flex-1 h-9" onClick={() => setCompatFilter(opt.key)}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-center pt-2">
              {filtered.filter(cp => cp.latitude && cp.longitude).length} Stationen gefunden
              {publicLoading && " (öffentliche werden geladen…)"}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Location group drawer – when multiple charge points share same location */}
      <Drawer open={locationDrawerOpen} onOpenChange={setLocationDrawerOpen}>
        <DrawerContent className="max-h-[70vh]">
          {locationGroup && locationGroup.length > 0 && (
            <div className="px-4 pb-6 pt-2">
              <DrawerHeader className="p-0 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DrawerTitle className="text-left">Ladestandort</DrawerTitle>
                    <DrawerDescription className="text-left">
                      {locationGroup[0].address || "Adresse nicht verfügbar"}
                    </DrawerDescription>
                  </div>
                  <Badge variant="secondary">{locationGroup.length} Ladepunkte</Badge>
                </div>
              </DrawerHeader>

              <div className="space-y-2">
                {locationGroup.map((cp) => {
                  const isAvailable = cp.status === "available";
                  return (
                    <button
                      key={cp.id}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
                      onClick={() => {
                        setLocationDrawerOpen(false);
                        setTimeout(() => {
                          setSelectedCp(cp);
                          setDrawerOpen(true);
                        }, 200);
                      }}
                    >
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                        isAvailable ? "bg-primary/10 text-primary" :
                        cp.status === "charging" ? "bg-blue-500/10 text-blue-500" :
                        cp.status === "faulted" ? "bg-destructive/10 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        <PlugZap className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{cp.name}</p>
                        <p className="text-xs text-muted-foreground">{fmtKw(cp.max_power_kw)} · {cp.connector_type.split(",").map(t => t === "Type2" ? "Typ 2" : t === "Other" ? "Sonstige" : t).join(", ")}</p>
                      </div>
                      <Badge variant={isAvailable ? "default" : "secondary"} className="shrink-0">
                        {statusLabel[cp.status] || cp.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* Station info drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[70vh]">
          {selectedCp && (
            <div className="px-4 pb-6 pt-2">
              <DrawerHeader className="p-0 mb-3">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${
                    selectedCp.status === "available" ? "bg-primary/10 text-primary" :
                    selectedCp.status === "charging" ? "bg-blue-500/10 text-blue-500" :
                    selectedCp.status === "faulted" ? "bg-destructive/10 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    <PlugZap className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DrawerTitle className="text-left">{selectedCp.name}</DrawerTitle>
                    {selectedCp.address && (
                      <DrawerDescription className="text-left">{selectedCp.address}</DrawerDescription>
                    )}
                  </div>
                  <Badge variant={selectedCp.status === "available" ? "default" : "secondary"}>
                    {statusLabel[selectedCp.status] || selectedCp.status}
                  </Badge>
                </div>
              </DrawerHeader>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Leistung</p>
                  <p className="text-lg font-bold">{fmtKw(selectedCp.max_power_kw)}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Stecker</p>
                  <div className="flex flex-wrap gap-1 justify-center mt-1">
                    {selectedCp.connector_type.split(",").filter(Boolean).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t === "Type2" ? "Typ 2" : t === "Other" ? "Sonstige" : t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Anschlüsse</p>
                  <p className="text-lg font-bold">{selectedCp.connector_count}</p>
                </div>
              </div>

              {selectedCp.vendor && (
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedCp.vendor}{selectedCp.model ? ` — ${selectedCp.model}` : ""}
                </p>
              )}

              {!selectedCp.isAppCompatible && (
                <Badge variant="secondary" className="mb-3">Öffentliche Ladestation – kein App-Laden möglich</Badge>
              )}

              <div className="flex gap-3">
                {selectedCp.latitude && selectedCp.longitude && (
                  <Button variant="outline" className="flex-1 h-12" onClick={() => openNavigation(selectedCp)}>
                    <Navigation className="h-4 w-4 mr-2" /> Navigation
                  </Button>
                )}
                {selectedCp.isAppCompatible !== false && (
                  <Button
                    className="flex-1 h-12"
                    disabled={selectedCp.status !== "available"}
                    onClick={() => { onStartCharge(selectedCp.id); setDrawerOpen(false); }}
                  >
                    <PlugZap className="h-4 w-4 mr-2" />
                    {selectedCp.status === "available" ? "Laden starten" : "Nicht verfügbar"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ---- Station Detail ----
function StationDetail({ cp, onBack, onStartCharge }: { cp: AppChargePoint; onBack: () => void; onStartCharge: (cpId: string, connectorId?: number) => void }) {
  const statusLabel: Record<string, string> = {
    available: "Verfügbar", charging: "Belegt", faulted: "Gestört", unavailable: "Nicht verfügbar", offline: "Offline",
  };
  const canCharge = cp.status === "available";
  const [selectedConnector, setSelectedConnector] = useState<number>(1);
  const [connectors, setConnectors] = useState<Array<{ connector_id: number; status: string; connector_type: string; max_power_kw: number }>>([]);

  useEffect(() => {
    if (cp.connector_count <= 1) return;
    supabase
      .from("charge_point_connectors")
      .select("connector_id, status, connector_type, max_power_kw")
      .eq("charge_point_id", cp.id)
      .order("connector_id")
      .then(({ data }) => {
        if (data && data.length > 0) setConnectors(data);
      });
  }, [cp.id, cp.connector_count]);

  // Realtime for connector updates
  useEffect(() => {
    if (cp.connector_count <= 1) return;
    const channel = supabase
      .channel(`app-connectors-${cp.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "charge_point_connectors", filter: `charge_point_id=eq.${cp.id}` }, () => {
        supabase
          .from("charge_point_connectors")
          .select("connector_id, status, connector_type, max_power_kw")
          .eq("charge_point_id", cp.id)
          .order("connector_id")
          .then(({ data }) => { if (data) setConnectors(data); });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cp.id, cp.connector_count]);

  const openNavigation = () => {
    if (cp.latitude && cp.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${cp.latitude},${cp.longitude}`, "_blank");
    }
  };

  const connectorStatusColor: Record<string, string> = {
    available: "bg-emerald-500",
    charging: "bg-blue-500",
    unavailable: "bg-muted-foreground",
    faulted: "bg-destructive",
  };

  const connectorStatusLabel: Record<string, string> = {
    available: "Frei",
    charging: "Lädt",
    unavailable: "Belegt",
    faulted: "Gestört",
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

        {/* Connector selection for multi-connector stations */}
        {connectors.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Anschluss wählen</p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(connectors.length, 3)}, 1fr)` }}>
              {connectors.map((c) => {
                const isSelected = selectedConnector === c.connector_id;
                const isAvailable = c.status === "available";
                return (
                  <button
                    key={c.connector_id}
                    type="button"
                    onClick={() => isAvailable && setSelectedConnector(c.connector_id)}
                    disabled={!isAvailable}
                    className={`
                      border rounded-lg p-3 text-center transition-all
                      ${isAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                      ${isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border"}
                    `}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className={`h-2.5 w-2.5 rounded-full ${connectorStatusColor[c.status] || "bg-muted-foreground"}`} />
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <p className="text-xs font-medium">Anschluss {c.connector_id}</p>
                    <p className="text-[10px] text-muted-foreground">{connectorStatusLabel[c.status] || c.status}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {cp.vendor && (
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Hersteller / Modell</p><p className="text-sm font-medium">{cp.vendor} {cp.model && `— ${cp.model}`}</p></CardContent></Card>
        )}
        <div className="flex gap-3">
          {cp.latitude && cp.longitude && (
            <Button variant="outline" className="flex-1 h-12" onClick={openNavigation}>
              <Navigation className="h-4 w-4 mr-2" />Navigation
            </Button>
          )}
          <Button className="flex-1 h-12" disabled={!canCharge} onClick={() => onStartCharge(cp.id, connectors.length > 1 ? selectedConnector : undefined)}>
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

  const stopScan = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startFrameScan = useCallback((video: HTMLVideoElement) => {
    const scanFrame = async () => {
      if (!video || video.readyState !== 4) {
        animRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
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
  }, [onScanned, stopScan]);

  const startScan = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setError("Kamera-Zugriff nicht möglich. Bitte erlauben Sie den Kamera-Zugriff in den Einstellungen.");
    }
  }, []);

  // Once scanning is true and video element is in the DOM, attach stream and start frame scanning
  useEffect(() => {
    if (!scanning || !streamRef.current) return;

    // Use a small delay to ensure the video element is mounted in the DOM on iOS
    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (!video || !streamRef.current) return;

      video.srcObject = streamRef.current;
      // setAttribute is more reliable on iOS Safari than property assignment
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => startFrameScan(video)).catch(() => {
          setError("Video konnte nicht gestartet werden. Bitte tippen Sie auf 'Scanner öffnen'.");
          setScanning(false);
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [scanning, startFrameScan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopScan();
  }, [stopScan]);

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
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
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

// ---- No Active Session Placeholder (with stop option for "charging" status sessions) ----
function NoActiveSessionPlaceholder({ sessions, onStopCharge }: { sessions: AppSession[]; onStopCharge: (session: AppSession) => void }) {
  const [confirmSession, setConfirmSession] = useState<AppSession | null>(null);
  // Check if user has a "charging" session (charger reports active but HistoryTab shows no "active" status)
  const chargingSession = sessions.find((s) => s.status === "charging" && !s.stop_time);

  if (chargingSession) {
    return (
      <div className="flex flex-col items-center py-6 px-4 gap-3">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <BatteryCharging className="h-8 w-8 text-primary animate-pulse" />
        </div>
        <p className="text-sm font-medium">Ladevorgang aktiv</p>
        {!confirmSession ? (
          <Button variant="destructive" size="sm" onClick={() => setConfirmSession(chargingSession)}>
            <ZapOff className="h-4 w-4 mr-1.5" /> Ladevorgang beenden
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg p-4 w-full max-w-xs">
            <p className="text-sm text-center font-medium">Ladevorgang wirklich beenden?</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmSession(null)}>Abbrechen</Button>
              <Button variant="destructive" size="sm" onClick={() => { onStopCharge(chargingSession); setConfirmSession(null); }}>
                Ja, beenden
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-6 px-4">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="h-10 w-10 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="28" width="32" height="14" rx="3" />
          <path d="M8 28l4-10h16l4 10" />
          <circle cx="12" cy="44" r="3" />
          <circle cx="32" cy="44" r="3" />
          <rect x="48" y="18" width="10" height="24" rx="2" />
          <path d="M53 18v-6" />
          <path d="M50 12h6" />
          <path d="M48 32h-6c-2 0-3 1-3 3v4" strokeDasharray="3 2" />
          <path d="M51 24l4-3h-3l4-3" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground font-medium">Keine aktiven Ladevorgänge</p>
    </div>
  );
}

// ---- History Tab ----
function HistoryTab({ sessions, chargePoints, tariff, onStopCharge }: { sessions: AppSession[]; chargePoints: AppChargePoint[]; tariff: AppTariff | null; onStopCharge: (session: AppSession) => void }) {
  const getCpName = (id: string | null) => chargePoints.find((cp) => cp.id === id)?.name || "Unbekannt";

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <History className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Noch keine Ladevorgänge</p>
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === "active");
  const completedSessions = sessions.filter((s) => s.status !== "active");

  // Group completed sessions by month
  const grouped: { key: string; label: string; items: AppSession[] }[] = [];
  let lastMonthKey = "";
  for (const s of completedSessions) {
    const d = new Date(s.start_time);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (monthKey !== lastMonthKey) {
      const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
      grouped.push({ key: monthKey, label, items: [] });
      lastMonthKey = monthKey;
    }
    grouped[grouped.length - 1].items.push(s);
  }

  const renderDuration = (s: AppSession) => {
    const end = s.stop_time ? new Date(s.stop_time) : new Date();
    const mins = Math.round((end.getTime() - new Date(s.start_time).getTime()) / 60000);
    if (mins < 60) return `${mins} Min.`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} Std. ${m > 0 ? `${m} Min.` : ""}`.trim();
  };

  const calcCost = (s: AppSession): number | null => {
    if (!tariff) return null;
    const energyCost = s.energy_kwh * tariff.price_per_kwh;
    let idleFee = 0;
    if (tariff.idle_fee_per_minute > 0 && s.stop_time) {
      const mins = Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000);
      const idleMins = Math.max(0, mins - tariff.idle_fee_grace_minutes);
      idleFee = idleMins * tariff.idle_fee_per_minute;
    }
    return energyCost + idleFee;
  };

  const renderSessionRow = (s: AppSession, isActive: boolean) => {
    const cost = calcCost(s);

    if (isActive) {
      return (
        <div key={s.id} className="bg-blue-500/5 border border-blue-500/20 rounded-lg mx-3 mb-2 p-4 space-y-3">
          {/* Top: Name + Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500 animate-pulse">
                <BatteryCharging className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-sm">{getCpName(s.charge_point_id)}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</p>
              </div>
            </div>
            <Badge className="text-[10px] bg-blue-500 border-0 shrink-0">Lädt…</Badge>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-background p-2">
              <div className="flex items-center justify-center gap-1">
                <p className="text-lg font-bold">{fmtKwh(s.energy_kwh)}</p>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Energie (live)</p>
            </div>
            <div className="rounded-md bg-background p-2">
              <p className="text-lg font-bold">{renderDuration(s)}</p>
              <p className="text-[10px] text-muted-foreground">Dauer</p>
            </div>
            <div className="rounded-md bg-background p-2">
              <p className="text-lg font-bold text-blue-600">{cost !== null ? `~${fmtCurrency(cost)}` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Kosten</p>
            </div>
          </div>

          {/* Stop button */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full text-sm h-9"
            onClick={(e) => { e.stopPropagation(); onStopCharge(s); }}
          >
            <ZapOff className="h-4 w-4 mr-1.5" />
            Ladevorgang beenden
          </Button>
        </div>
      );
    }

    return (
      <div key={s.id} className="flex items-center gap-3 p-4 border-b">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
          s.status === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          <PlugZap className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{getCpName(s.charge_point_id)}</p>
          <p className="text-xs text-muted-foreground">{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold">{fmtKwh(s.energy_kwh)}</p>
          {s.stop_time && <p className="text-xs text-muted-foreground">{renderDuration(s)}</p>}
          {cost !== null && <p className="text-xs font-semibold text-primary">{fmtCurrency(cost)}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-auto h-full">
      <h2 className="text-lg font-semibold px-4 pt-4 pb-2 text-center">Meine Ladevorgänge</h2>

      {activeSessions.length > 0 ? (
        <div className="mb-1">
          {activeSessions.map((s) => renderSessionRow(s, true))}
        </div>
      ) : (
        <NoActiveSessionPlaceholder sessions={sessions} onStopCharge={onStopCharge} />
      )}

      {completedSessions.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground font-medium">Abgeschlossen</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {grouped.map((group, gi) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">{group.label}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {group.items.map((s) => renderSessionRow(s, false))}
        </div>
      ))}
    </div>
  );
}

// ---- Invoices Tab ----
function InvoicesTab({ invoices, sessions, chargePoints, tariff, tenantInfo, userEmail }: {
  invoices: AppInvoice[];
  sessions: AppSession[];
  chargePoints: AppChargePoint[];
  tariff: AppTariff | null;
  tenantInfo: AppTenantInfo | null;
  userEmail: string;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState<AppInvoice | null>(null);

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Receipt className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Keine Rechnungen vorhanden</p>
      </div>
    );
  }

  const getCpName = (id: string | null) => chargePoints.find((cp) => cp.id === id)?.name || "—";

  const handlePrint = (inv: AppInvoice) => {
    const currencySymbol = inv.currency === "EUR" ? "€" : inv.currency;
    const invoiceDate = inv.issued_at ? format(new Date(inv.issued_at), "dd.MM.yyyy") : format(new Date(inv.created_at), "dd.MM.yyyy");
    const tenantName = tenantInfo?.name || "Ladeinfrastruktur-Betreiber";
    const logoUrl = tenantInfo?.logo_url || null;
    const primaryColor = tenantInfo?.branding?.primary_color || "#1e293b";
    const accentColor = tenantInfo?.branding?.accent_color || "#334155";
    const pricePerKwh = tariff?.price_per_kwh ?? 0;
    const baseFee = tariff?.base_fee ?? 0;
    const idleFeePerMinute = tariff?.idle_fee_per_minute ?? 0;
    const idleFeeGraceMinutes = tariff?.idle_fee_grace_minutes ?? 60;

    // Find related sessions for this invoice (match by session_id or approximate by date range)
    const relatedSessions = sessions.filter(s => s.status === "completed");

    // Build session rows
    const sessionRows = relatedSessions.slice(0, 50).map((s, i) => {
      const startDate = new Date(s.start_time);
      const endDate = s.stop_time ? new Date(s.stop_time) : null;
      const duration = endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60000) : 0;
      const durationStr = duration > 60 ? `${Math.floor(duration / 60)}h ${duration % 60}min` : `${duration}min`;
      const energyCost = s.energy_kwh * pricePerKwh;
      const idleMinutes = idleFeePerMinute > 0 ? Math.max(0, duration - idleFeeGraceMinutes) : 0;
      const sessionIdleFee = idleMinutes * idleFeePerMinute;
      const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `<tr>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${i + 1}</td>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${startDate.toLocaleDateString("de-DE")}</td>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${startDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}${endDate ? " – " + endDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}</td>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${getCpName(s.charge_point_id)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${durationStr}</td>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right">${s.energy_kwh.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh</td>
        <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right">${energyCost.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}</td>
        ${idleFeePerMinute > 0 ? `<td style="padding:8px 12px;font-size:12px;color:${sessionIdleFee > 0 ? '#dc2626' : '#94a3b8'};border-bottom:1px solid #f1f5f9;background:${bg};text-align:right">${sessionIdleFee > 0 ? sessionIdleFee.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currencySymbol : "—"}</td>` : ""}
      </tr>`;
    }).join("");

    const netAmount = inv.total_amount;
    const vatRate = 0.19;
    const vatAmount = netAmount * vatRate;
    const grossAmount = netAmount + vatAmount;

    const printContent = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><title>Rechnung ${inv.invoice_number}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  @media print { body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } @page { margin: 12mm 15mm; size: A4; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #fff; }
  .container { max-width: 750px; margin: 0 auto; padding: 32px; }
</style></head><body>
<div class="container">

  <!-- Back button (mobile) -->
  <div class="no-print" style="text-align:center;margin-bottom:20px">
    <button onclick="window.close();history.back();" style="padding:12px 32px;font-size:16px;font-weight:600;background:#0f172a;color:#fff;border:none;border-radius:12px;cursor:pointer">← Zurück zur App</button>
  </div>

  <!-- Header with logo -->
  <table style="width:100%;margin-bottom:32px;border-spacing:0">
    <tr>
      <td style="vertical-align:top">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:60px;max-width:180px;object-fit:contain;margin-bottom:8px" />` : ""}
        <div style="font-size:16px;font-weight:700;color:${primaryColor}">${tenantName}</div>
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-size:24px;font-weight:800;color:${primaryColor};margin-bottom:4px">RECHNUNG</div>
        <div style="font-size:13px;color:#64748b">${inv.invoice_number || "Entwurf"}</div>
      </td>
    </tr>
  </table>

  <!-- Sender / Recipient -->
  <table style="width:100%;margin-bottom:28px;border-spacing:0">
    <tr>
      <td style="vertical-align:top;width:50%">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:6px;font-weight:600">Rechnungssteller</div>
        <div style="font-size:14px;font-weight:600">${tenantName}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">Ladeinfrastruktur-Betreiber</div>
      </td>
      <td style="vertical-align:top;width:50%">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:6px;font-weight:600">Rechnungsempfänger</div>
        <div style="font-size:14px;font-weight:600">${userEmail}</div>
      </td>
    </tr>
  </table>

  <!-- Invoice details -->
  <table style="width:100%;margin-bottom:28px;border-spacing:0;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
    <tr>
      <td style="padding:14px 20px;border-right:1px solid #e2e8f0">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Rechnungsdatum</div>
        <div style="font-size:13px;font-weight:600">${invoiceDate}</div>
      </td>
      <td style="padding:14px 20px;border-right:1px solid #e2e8f0">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Rechnungsnummer</div>
        <div style="font-size:13px;font-weight:600">${inv.invoice_number || "—"}</div>
      </td>
      <td style="padding:14px 20px;border-right:1px solid #e2e8f0">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Tarif</div>
        <div style="font-size:13px;font-weight:600">${pricePerKwh.toLocaleString("de-DE", { minimumFractionDigits: 4 })} ${currencySymbol}/kWh</div>
      </td>
      <td style="padding:14px 20px">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Status</div>
        <div style="font-size:13px;font-weight:600;color:${inv.status === "paid" ? "#16a34a" : "#f59e0b"}">${inv.status === "paid" ? "Bezahlt" : inv.status === "issued" ? "Offen" : "Entwurf"}</div>
      </td>
    </tr>
  </table>

  <!-- Sessions Table -->
  <div style="margin-bottom:24px">
    <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:10px">Einzelne Ladevorgänge</div>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <thead>
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Nr.</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Datum</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Zeitraum</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Ladepunkt</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Dauer</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Energie</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Betrag</th>
          ${idleFeePerMinute > 0 ? `<th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Blockiergeb.</th>` : ""}
        </tr>
      </thead>
      <tbody>${sessionRows}</tbody>
    </table>
  </div>

  <!-- Totals -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
    <tr>
      <td style="padding:8px 16px;font-size:13px;color:#64748b">Energiekosten (${inv.total_energy_kwh.toLocaleString("de-DE", { minimumFractionDigits: 2 })} kWh × ${pricePerKwh.toLocaleString("de-DE", { minimumFractionDigits: 4 })} ${currencySymbol})</td>
      <td style="padding:8px 16px;font-size:13px;text-align:right">${(inv.total_amount - inv.idle_fee_amount - baseFee).toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${currencySymbol}</td>
    </tr>
    ${baseFee > 0 ? `<tr>
      <td style="padding:8px 16px;font-size:13px;color:#64748b">Grundgebühr</td>
      <td style="padding:8px 16px;font-size:13px;text-align:right">${baseFee.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${currencySymbol}</td>
    </tr>` : ""}
    ${inv.idle_fee_amount > 0 ? `<tr>
      <td style="padding:8px 16px;font-size:13px;color:#dc2626">Blockiergebühr</td>
      <td style="padding:8px 16px;font-size:13px;text-align:right;color:#dc2626">${inv.idle_fee_amount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${currencySymbol}</td>
    </tr>` : ""}
    <tr style="border-top:1px solid #e2e8f0">
      <td style="padding:8px 16px;font-size:13px;color:#64748b">Zwischensumme (netto)</td>
      <td style="padding:8px 16px;font-size:13px;text-align:right;font-weight:600">${netAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${currencySymbol}</td>
    </tr>
    <tr>
      <td style="padding:8px 16px;font-size:13px;color:#64748b">MwSt. (19%)</td>
      <td style="padding:8px 16px;font-size:13px;text-align:right">${vatAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${currencySymbol}</td>
    </tr>
    <tr style="border-top:2px solid ${primaryColor}">
      <td style="padding:12px 16px;font-size:16px;font-weight:800;color:${primaryColor}">Gesamtbetrag (brutto)</td>
      <td style="padding:12px 16px;font-size:16px;font-weight:800;text-align:right;color:${primaryColor}">${grossAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${currencySymbol}</td>
    </tr>
  </table>

  <!-- Payment info -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:28px">
    <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:8px">Zahlungsinformationen</div>
    <div style="font-size:12px;color:#64748b;line-height:1.6">
      Bitte überweisen Sie den Gesamtbetrag unter Angabe der Rechnungsnummer <strong>${inv.invoice_number || "—"}</strong> auf das folgende Konto:<br/>
      <strong>Kontoinhaber:</strong> ${tenantName}<br/>
      <strong>Verwendungszweck:</strong> ${inv.invoice_number || "Laderechnung"}
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:16px;text-align:center">
    <div style="font-size:11px;color:#94a3b8">
      ${tenantName} · Rechnung ${inv.invoice_number || "Entwurf"} · Erstellt am ${format(new Date(inv.created_at), "dd.MM.yyyy")}
    </div>
    <div style="font-size:10px;color:#cbd5e1;margin-top:4px">Vielen Dank für die Nutzung unserer Ladeinfrastruktur.</div>
  </div>

  <!-- Print button -->
  <div class="no-print" style="text-align:center;margin-top:20px">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;font-weight:600;background:${primaryColor};color:#fff;border:none;border-radius:8px;cursor:pointer">Als PDF drucken</button>
  </div>

</div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printContent); w.document.close(); }
  };

  const handleShare = async (inv: AppInvoice) => {
    const text = `Laderechnung ${inv.invoice_number || "Entwurf"}\nBetrag: ${fmtCurrency(inv.total_amount)}\nEnergie: ${fmtKwh(inv.total_energy_kwh)}\nDatum: ${format(new Date(inv.created_at), "dd.MM.yyyy")}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Rechnung ${inv.invoice_number}`, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("In Zwischenablage kopiert");
    }
  };

  return (
    <div className="overflow-auto h-full">
      <h2 className="text-lg font-semibold px-4 pt-4 pb-2 text-center">Meine Rechnungen</h2>
      {invoices.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3 p-4 border-b cursor-pointer active:bg-muted/50 transition-colors" onClick={() => setSelectedInvoice(inv)}>
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{inv.invoice_number || "Entwurf"}</p>
            <p className="text-xs text-muted-foreground">
              {inv.issued_at ? format(new Date(inv.issued_at), "dd.MM.yyyy") : format(new Date(inv.created_at), "dd.MM.yyyy")}
            </p>
            <p className="text-xs text-muted-foreground">{fmtKwh(inv.total_energy_kwh)}</p>
          </div>
          <div className="text-right shrink-0 flex items-center gap-2">
            <div>
              <p className="text-sm font-bold">{fmtCurrency(inv.total_amount)}</p>
              <Badge variant={inv.status === "paid" ? "default" : "secondary"} className="text-xs">
                {inv.status === "paid" ? "Bezahlt" : inv.status === "issued" ? "Offen" : "Entwurf"}
              </Badge>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      ))}

      {/* Invoice detail drawer */}
      <Drawer open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null); }}>
        <DrawerContent>
          {selectedInvoice && (
            <div className="px-4 pb-6 pt-2">
              <DrawerHeader className="p-0 mb-4">
                <DrawerTitle>Rechnung {selectedInvoice.invoice_number || "Entwurf"}</DrawerTitle>
                <DrawerDescription>
                  {selectedInvoice.issued_at ? format(new Date(selectedInvoice.issued_at), "dd.MM.yyyy") : format(new Date(selectedInvoice.created_at), "dd.MM.yyyy")}
                </DrawerDescription>
              </DrawerHeader>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Energie</span>
                  <span className="text-sm font-medium">{fmtKwh(selectedInvoice.total_energy_kwh)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Energiekosten</span>
                  <span className="text-sm font-medium">{fmtCurrency(selectedInvoice.total_amount - selectedInvoice.idle_fee_amount)}</span>
                </div>
                {selectedInvoice.idle_fee_amount > 0 && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Blockiergebühr</span>
                    <span className="text-sm font-medium text-destructive">{fmtCurrency(selectedInvoice.idle_fee_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-primary/30">
                  <span className="text-sm font-semibold">Gesamtbetrag</span>
                  <span className="text-base font-bold text-primary">{fmtCurrency(selectedInvoice.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={selectedInvoice.status === "paid" ? "default" : "secondary"}>
                    {selectedInvoice.status === "paid" ? "Bezahlt" : selectedInvoice.status === "issued" ? "Offen" : "Entwurf"}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => handlePrint(selectedInvoice)}>
                  <Receipt className="h-4 w-4 mr-2" /> Drucken
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => handleShare(selectedInvoice)}>
                  <Mail className="h-4 w-4 mr-2" /> Teilen
                </Button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
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

  // Set PWA manifest & Apple meta for this app
  useEffect(() => {
    let link = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = "/manifest-ev.json";

    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute("content", "SmartCharge");
  }, []);
  const [chargePoints, setChargePoints] = useState<AppChargePoint[]>([]);
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [invoices, setInvoices] = useState<AppInvoice[]>([]);
  const [tariff, setTariff] = useState<AppTariff | null>(null);
  const [tenantInfo, setTenantInfo] = useState<AppTenantInfo | null>(null);
  const [initialCpOcppId, setInitialCpOcppId] = useState<string | null>(null);
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
      const [cpRes, sessRes, invRes, tariffRes] = await Promise.all([
        supabase.from("charge_points").select("id, ocpp_id, name, status, address, latitude, longitude, max_power_kw, connector_type, connector_count, vendor, model").order("name"),
        supabase.from("charging_sessions").select("id, charge_point_id, transaction_id, start_time, stop_time, energy_kwh, status, stop_reason").order("start_time", { ascending: false }).limit(100),
        supabase.from("charging_invoices").select("id, session_id, invoice_number, total_energy_kwh, total_amount, idle_fee_amount, currency, status, issued_at, created_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("charging_tariffs").select("price_per_kwh, base_fee, idle_fee_per_minute, idle_fee_grace_minutes, currency").eq("is_active", true).limit(1),
      ]);
      if (cpRes.data) setChargePoints(cpRes.data as AppChargePoint[]);
      if (sessRes.data) setSessions(sessRes.data as AppSession[]);
      if (invRes.data) setInvoices(invRes.data as AppInvoice[]);
      if (tariffRes.data && tariffRes.data.length > 0) setTariff(tariffRes.data[0] as AppTariff);

      // Load tenant info (name, logo, branding)
      try {
        const { data: chargingUser } = await supabase
          .from("charging_users")
          .select("tenant_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (chargingUser?.tenant_id) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("name, logo_url, branding")
            .eq("id", chargingUser.tenant_id)
            .single();
          if (tenant) {
            setTenantInfo({
              name: tenant.name || "",
              logo_url: tenant.logo_url || null,
              branding: (tenant.branding as Record<string, string>) || {},
            });
          }
        }
      } catch { /* ignore */ }

      setLoading(false);
    };
    loadData();
  }, [user]);

  // Realtime subscription for live energy updates during charging
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("app-sessions-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "charging_sessions" },
        (payload) => {
          const updated = payload.new as AppSession;
          setSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "charging_sessions" },
        (payload) => {
          const inserted = payload.new as AppSession;
          setSessions((prev) => [inserted, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Handle deep link
  useEffect(() => {
    const cpParam = searchParams.get("cp");
    if (cpParam && chargePoints.length > 0) {
      setInitialCpOcppId(cpParam);
      setTab("map");
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
      setInitialCpOcppId(ocppId);
      setTab("map");
      toast.success(`Ladestation "${found.name}" erkannt`);
    } else {
      toast.error("Ladestation nicht gefunden");
    }
  };

  const handleStartCharge = async (cpId: string, connectorId?: number) => {
    const cp = chargePoints.find((c) => c.id === cpId);
    if (!cp) { toast.error("Ladepunkt nicht gefunden"); return; }

    toast.loading("Ladevorgang wird gestartet…", { id: "remote-start" });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      // Fetch the short OCPP-compliant app_tag for this user
      const { data: chargingUser } = await supabase
        .from("charging_users")
        .select("app_tag")
        .eq("auth_user_id", user?.id)
        .single();

      const idTag = chargingUser?.app_tag || `APP${user?.id?.replace(/-/g, "").substring(0, 17)}`;

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
            idTag,
            ...(connectorId ? { connectorId } : {}),
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

  const handleStopCharge = async (session: AppSession) => {
    if (!session.transaction_id) {
      toast.error("Kein Transaktions-ID vorhanden");
      return;
    }

    toast.loading("Ladevorgang wird beendet…", { id: "remote-stop" });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpp-central/command/RemoteStopTransaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ transactionId: session.transaction_id }),
        }
      );

      const result = await res.json();

      if (result.status === "Accepted") {
        toast.success("Stopp-Befehl wurde an die Wallbox gesendet", { id: "remote-stop" });
      } else {
        toast.error(result.message || "Ladevorgang konnte nicht beendet werden", { id: "remote-stop" });
      }
    } catch (err) {
      console.error("Remote stop failed:", err);
      toast.error("Verbindungsfehler – bitte erneut versuchen", { id: "remote-stop" });
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
    return <ChargingAppAuth onAuth={() => {
      // Force re-check session after successful login
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email || "" });
          ensureChargingUser(session.user.id, session.user.email || "", session.user.user_metadata?.display_name);
        }
      });
    }} />;
  }


  const hasActiveSession = sessions.some((s) => s.status === "charging" || (s.status === "active" && !s.stop_time));

  const tabs: { key: Tab; icon: typeof Map; label: string }[] = [
    { key: "map", icon: Map, label: "Karte" },
    { key: "history", icon: History, label: "Historie" },
    { key: "qr", icon: QrCode, label: "Scannen" },
    { key: "invoices", icon: Receipt, label: "Rechnungen" },
    { key: "profile", icon: User, label: "Profil" },
  ];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {tab === "map" && <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}><MapTab chargePoints={chargePoints} onStartCharge={handleStartCharge} initialCpId={initialCpOcppId} onInitialCpHandled={() => setInitialCpOcppId(null)} /></div>}
            {tab === "qr" && <QrScannerTab onScanned={handleQrScanned} />}
            {tab === "history" && <HistoryTab sessions={sessions} chargePoints={chargePoints} tariff={tariff} onStopCharge={handleStopCharge} />}
            {tab === "invoices" && <InvoicesTab invoices={invoices} sessions={sessions} chargePoints={chargePoints} tariff={tariff} tenantInfo={tenantInfo} userEmail={user.email} />}
            {tab === "profile" && <ProfileTab email={user.email} onLogout={handleLogout} />}
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <nav className="border-t bg-background flex shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {tabs.map(({ key, icon: Icon, label }) => {
          const isBlinking = key === "history" && hasActiveSession && tab !== "history";
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
                tab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isBlinking ? "animate-charging-pulse" : ""}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default ChargingApp;
