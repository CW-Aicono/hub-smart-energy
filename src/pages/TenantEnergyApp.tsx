import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Zap, LogOut, Loader2, ArrowLeft, Mail, Lock, Eye, EyeOff,
  User, BarChart3, Receipt, Home, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Types ──
interface AssignedMeter {
  meter_id: string;
  meters: { id: string; name: string; energy_type: string; unit: string; meter_number: string | null } | null;
}

interface TenantRecord {
  id: string;
  name: string;
  unit_label: string | null;
  meter_id: string | null;
  tenant_id: string;
  status: string;
  move_in_date: string | null;
  move_out_date: string | null;
  assigned_meters: AssignedMeter[];
}

interface Invoice {
  id: string;
  period_start: string;
  period_end: string;
  local_kwh: number;
  grid_kwh: number;
  total_kwh: number;
  local_amount: number;
  grid_amount: number;
  base_fee: number;
  total_amount: number;
  status: string;
  invoice_number: string | null;
  created_at: string;
}

interface MonthlyReading {
  month: string;
  value: number;
}

// ── Auth Screen ──
type AuthView = "login" | "register" | "forgotPassword";

function TenantAppAuth({ onAuth }: { onAuth: () => void }) {
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
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + "/te", data: { display_name: name } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("already registered") ? "E-Mail bereits registriert" : error.message);
    } else {
      toast.success("Registrierung erfolgreich! Bitte E-Mail bestätigen.");
      setView("login");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Bitte E-Mail eingeben"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/te",
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
          <div className="h-16 w-16 rounded-2xl bg-green-600 flex items-center justify-center mx-auto mb-4">
            <Zap className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Mein Strom</h1>
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
                  <button type="button" onClick={() => setView("forgotPassword")} className="text-xs text-green-600 hover:underline">
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
            <Button type="submit" className="w-full h-12 text-base bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : view === "login" ? "Anmelden" : "Registrieren"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {view === "login" ? "Noch kein Konto?" : "Bereits registriert?"}{" "}
              <button type="button" onClick={() => setView(view === "login" ? "register" : "login")} className="text-green-600 hover:underline font-medium">
                {view === "login" ? "Registrieren" : "Anmelden"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Dashboard Tab ──
function DashboardTab({ tenantRecord, invoices }: { tenantRecord: TenantRecord; invoices: Invoice[] }) {
  const latestInvoice = invoices[0] || null;

  // Build monthly chart from invoices
  const chartData = useMemo(() => {
    const last6 = invoices.slice(0, 6).reverse();
    return last6.map((inv) => ({
      month: format(new Date(inv.period_start), "MMM yy", { locale: de }),
      lokalstrom: Number(inv.local_kwh),
      netzstrom: Number(inv.grid_kwh),
    }));
  }, [invoices]);

  const totalConsumption = invoices.reduce((s, i) => s + Number(i.total_kwh), 0);
  const totalCost = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const avgMonthly = invoices.length > 0 ? totalConsumption / invoices.length : 0;

  return (
    <div className="space-y-4">
      <div className="text-center pb-2">
        <p className="text-sm text-muted-foreground">Willkommen,</p>
        <h2 className="text-xl font-bold">{tenantRecord.name}</h2>
        {tenantRecord.unit_label && <p className="text-sm text-muted-foreground">{tenantRecord.unit_label}</p>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Ø Monat</span>
            </div>
            <p className="text-lg font-bold">{avgMonthly.toFixed(0)} kWh</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Gesamt</span>
            </div>
            <p className="text-lg font-bold">{totalCost.toFixed(2)} €</p>
          </CardContent>
        </Card>
      </div>

      {/* Latest invoice summary */}
      {latestInvoice && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Letzte Abrechnung</CardDescription>
            <CardTitle className="text-base">
              {format(new Date(latestInvoice.period_start), "dd.MM.")} – {format(new Date(latestInvoice.period_end), "dd.MM.yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Lokal (PV)</p>
                <p className="font-semibold text-green-600">{Number(latestInvoice.local_kwh).toFixed(0)} kWh</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Netz</p>
                <p className="font-semibold">{Number(latestInvoice.grid_kwh).toFixed(0)} kWh</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Betrag</p>
                <p className="font-bold">{Number(latestInvoice.total_amount).toFixed(2)} €</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Consumption chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Verbrauchsverlauf</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="lokalstrom" name="Lokalstrom (PV)" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="netzstrom" name="Netzstrom" fill="#64748b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Noch keine Verbrauchsdaten verfügbar</p>
        </Card>
      )}
    </div>
  );
}

// ── Invoices Tab ──
function InvoicesTab({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Abrechnungen</h2>
      {invoices.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Noch keine Abrechnungen vorhanden</p>
        </Card>
      ) : (
        invoices.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-sm">
                    {format(new Date(inv.period_start), "dd.MM.")} – {format(new Date(inv.period_end), "dd.MM.yyyy")}
                  </p>
                  {inv.invoice_number && <p className="text-xs text-muted-foreground">Nr. {inv.invoice_number}</p>}
                </div>
                <Badge variant={inv.status === "paid" ? "default" : inv.status === "issued" ? "secondary" : "outline"}>
                  {inv.status === "paid" ? "Bezahlt" : inv.status === "issued" ? "Offen" : "Entwurf"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>PV: {Number(inv.local_kwh).toFixed(1)} kWh = {Number(inv.local_amount).toFixed(2)} €</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Netz: {Number(inv.grid_kwh).toFixed(1)} kWh = {Number(inv.grid_amount).toFixed(2)} €</span>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t text-sm">
                <span className="text-muted-foreground">Grundgebühr: {Number(inv.base_fee).toFixed(2)} €</span>
                <span className="font-bold">{Number(inv.total_amount).toFixed(2)} €</span>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ── Meter Tab ──
// German number formatter
const fmtDe = (v: number, decimals = 1) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function MeterTab({ tenantRecord }: { tenantRecord: TenantRecord }) {
  const [meters, setMeters] = useState<any[]>([]);
  const [allTotals, setAllTotals] = useState<any[]>([]);
  const [allReadings, setAllReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const meterIds = useMemo(() => {
    const ids = (tenantRecord.assigned_meters || [])
      .map((am) => am.meter_id)
      .filter(Boolean);
    if (ids.length === 0 && tenantRecord.meter_id) {
      ids.push(tenantRecord.meter_id);
    }
    return ids;
  }, [tenantRecord]);

  useEffect(() => {
    if (meterIds.length === 0) { setLoading(false); return; }

    const fetchData = async () => {
      const [{ data: mData }, { data: tData }, { data: rData }] = await Promise.all([
        supabase.from("meters").select("id, name, meter_number, energy_type, unit").in("id", meterIds),
        supabase.from("meter_period_totals").select("*").in("meter_id", meterIds).eq("period_type", "month").order("period_start", { ascending: false }).limit(120),
        supabase.from("meter_readings").select("meter_id, value, reading_date").in("meter_id", meterIds).order("reading_date", { ascending: false }).limit(120),
      ]);
      setMeters(mData || []);
      setAllTotals(tData || []);
      setAllReadings(rData || []);
      setLoading(false);
    };
    fetchData();
  }, [meterIds]);

  // Group data by month across all meters
  const monthGroups = useMemo(() => {
    // Collect all unique months from totals, filtered by tenancy period
    const moveIn = tenantRecord.move_in_date ? new Date(tenantRecord.move_in_date) : null;
    const moveOut = tenantRecord.move_out_date ? new Date(tenantRecord.move_out_date) : null;
    const monthSet = new Set<string>();
    allTotals.forEach((t: any) => {
      const monthDate = new Date(t.period_start);
      // Only include months that fall within the tenancy period
      if (moveIn && monthDate < startOfMonth(moveIn)) return;
      if (moveOut && monthDate > startOfMonth(moveOut)) return;
      monthSet.add(t.period_start);
    });

    const sorted = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    return sorted.map((periodStart) => {
      const monthDate = new Date(periodStart);
      const label = format(monthDate, "MMMM yyyy", { locale: de });

      const meterEntries = meters.map((m) => {
        const reading = allTotals.find((t: any) => t.meter_id === m.id && t.period_start === periodStart);
        // Find meter reading (Zählerstand) closest to end of this month
        const monthEnd = endOfMonth(monthDate);
        const meterReading = allReadings.find((r: any) =>
          r.meter_id === m.id && new Date(r.reading_date) <= monthEnd && new Date(r.reading_date) >= monthDate
        );

        return {
          meter: m,
          consumption: reading ? Number(reading.total_value) : null,
          meterStand: meterReading ? Number(meterReading.value) : null,
          unit: m.unit || "kWh",
        };
      });

      return { periodStart, label, meterEntries };
    });
  }, [meters, allTotals, allReadings, tenantRecord.move_in_date, tenantRecord.move_out_date]);

  if (meterIds.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Kein Zähler zugeordnet</p>
        <p className="text-xs mt-1">Bitte wenden Sie sich an Ihren Vermieter.</p>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Meter overview cards */}
      <div className="space-y-2">
        {meters.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.meter_number && `Nr. ${m.meter_number} · `}
                    {m.energy_type} · {m.unit}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold">Monatliche Verbräuche</h2>

      {monthGroups.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Noch keine Verbrauchsdaten verfügbar</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {monthGroups.map(({ periodStart, label, meterEntries }) => (
            <div key={periodStart}>
              <h3 className="text-sm font-semibold mb-2">{label}</h3>
              <div className="space-y-2">
                {meterEntries.map(({ meter, consumption, meterStand, unit }) => (
                  <Card key={meter.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{meter.name}</p>
                          <p className="text-xs text-muted-foreground">{meter.energy_type}</p>
                        </div>
                        <div className="text-right">
                          {consumption !== null ? (
                            <p className="font-bold">{fmtDe(consumption)} {unit}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">–</p>
                          )}
                          {meterStand !== null && (
                            <p className="text-xs text-muted-foreground">
                              Zählerstand: {fmtDe(meterStand, 0)} {unit}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Not Linked Screen ──
function NotLinkedScreen({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Home className="h-9 w-9 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Kein Mietverhältnis gefunden</h1>
        <p className="text-sm text-muted-foreground">
          Für <strong>{email}</strong> wurde kein aktives Mietverhältnis gefunden. 
          Bitte wenden Sie sich an Ihren Vermieter, damit Ihr Konto verknüpft wird.
        </p>
        <Button variant="outline" onClick={onLogout} className="gap-2">
          <LogOut className="h-4 w-4" /> Abmelden
        </Button>
      </div>
    </div>
  );
}

// ── Main App ──
type AppTab = "dashboard" | "meter" | "invoices";

const TenantEnergyApp = () => {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenantRecord, setTenantRecord] = useState<TenantRecord | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");

  // Set PWA manifest
  useEffect(() => {
    let link = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = "/manifest-te.json";
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute("content", "Mein Strom");
  }, []);

  // Auth state
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load tenant data when user is authenticated
  useEffect(() => {
    if (!user) { setTenantRecord(null); setInvoices([]); return; }

    const loadData = async () => {
      setDataLoading(true);

      // Try to find by auth_user_id first, then by email
      let { data: rec } = await supabase
        .from("tenant_electricity_tenants")
        .select("id, name, unit_label, meter_id, tenant_id, status, move_in_date, move_out_date, tenant_electricity_tenant_meters(meter_id, meters(id, name, energy_type, unit, meter_number))")
        .eq("auth_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      // If not found by auth_user_id, try email match and link
      if (!rec && user.email) {
        const { data: emailMatch } = await supabase
          .from("tenant_electricity_tenants")
          .select("id, name, unit_label, meter_id, tenant_id, status, move_in_date, move_out_date, tenant_electricity_tenant_meters(meter_id, meters(id, name, energy_type, unit, meter_number))")
          .eq("email", user.email)
          .eq("status", "active")
          .is("auth_user_id", null)
          .maybeSingle();

        if (emailMatch) {
          // Auto-link user
          await supabase
            .from("tenant_electricity_tenants")
            .update({ auth_user_id: user.id })
            .eq("id", emailMatch.id);
          rec = emailMatch;
        }
      }

      if (rec) {
        const mapped: TenantRecord = {
          ...rec,
          assigned_meters: (rec as any).tenant_electricity_tenant_meters || [],
        };
        setTenantRecord(mapped);

        // Load invoices
        const { data: invData } = await supabase
          .from("tenant_electricity_invoices")
          .select("*")
          .eq("tenant_electricity_tenant_id", rec.id)
          .order("period_start", { ascending: false });
        setInvoices((invData || []) as Invoice[]);
      } else {
        setTenantRecord(null);
      }

      setDataLoading(false);
    };

    loadData();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTenantRecord(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!user) {
    return <TenantAppAuth onAuth={() => {}} />;
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Daten werden geladen…</p>
        </div>
      </div>
    );
  }

  if (!tenantRecord) {
    return <NotLinkedScreen email={user.email || ""} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-green-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold">Mein Strom</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {activeTab === "dashboard" && <DashboardTab tenantRecord={tenantRecord} invoices={invoices} />}
        {activeTab === "meter" && <MeterTab tenantRecord={tenantRecord} />}
        {activeTab === "invoices" && <InvoicesTab invoices={invoices} />}
      </div>

      {/* Bottom Navigation */}
      <div className="border-t bg-background/95 backdrop-blur-sm flex" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {([
          { id: "dashboard" as AppTab, icon: Home, label: "Übersicht" },
          { id: "meter" as AppTab, icon: BarChart3, label: "Zähler" },
          { id: "invoices" as AppTab, icon: Receipt, label: "Rechnungen" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center py-2.5 text-xs transition-colors ${
              activeTab === tab.id ? "text-green-600" : "text-muted-foreground"
            }`}
          >
            <tab.icon className={`h-5 w-5 mb-0.5 ${activeTab === tab.id ? "text-green-600" : ""}`} />
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TenantEnergyApp;
