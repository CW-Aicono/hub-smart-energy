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
  Settings, Plus, Trash2, Pencil,
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
  const [meterTotals, setMeterTotals] = useState<any[]>([]);
  const [selfTariffs, setSelfTariffs] = useState<any[]>([]);
  const [landlordTariff, setLandlordTariff] = useState<any>(null);
  const [loadingMeter, setLoadingMeter] = useState(true);

  const meterIds = useMemo(() => {
    const ids = (tenantRecord.assigned_meters || []).map((am) => am.meter_id).filter(Boolean);
    if (ids.length === 0 && tenantRecord.meter_id) ids.push(tenantRecord.meter_id);
    return ids;
  }, [tenantRecord]);

  const meterMap = useMemo(() => {
    const map: Record<string, { name: string; energy_type: string }> = {};
    (tenantRecord.assigned_meters || []).forEach((am) => {
      if (am.meters) map[am.meter_id] = { name: am.meters.name, energy_type: am.meters.energy_type };
    });
    return map;
  }, [tenantRecord]);

  useEffect(() => {
    if (meterIds.length === 0) { setLoadingMeter(false); return; }
    const fetch = async () => {
      const [{ data: totals }, { data: st }, { data: lt }] = await Promise.all([
        supabase.from("meter_period_totals").select("*").in("meter_id", meterIds).eq("period_type", "month").order("period_start", { ascending: false }).limit(120),
        supabase.from("tenant_self_tariffs").select("*").eq("tenant_electricity_tenant_id", tenantRecord.id),
        supabase.from("tenant_electricity_tariffs").select("*").eq("tenant_id", tenantRecord.tenant_id).limit(1),
      ]);
      setMeterTotals(totals || []);
      setSelfTariffs(st || []);
      setLandlordTariff((lt || [])[0] || null);
      setLoadingMeter(false);
    };
    fetch();
  }, [meterIds, tenantRecord.id, tenantRecord.tenant_id]);

  // Group meter totals by month and energy type
  const monthlyByType = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    meterTotals.forEach((t: any) => {
      const month = t.period_start.substring(0, 7); // YYYY-MM
      const eType = meterMap[t.meter_id]?.energy_type || t.energy_type || "strom";
      if (!map[month]) map[month] = {};
      map[month][eType] = (map[month][eType] || 0) + Number(t.total_value);
    });
    return map;
  }, [meterTotals, meterMap]);

  // Get tariff price for an energy type
  const getTariffPrice = (energyType: string): { pricePerKwh: number; baseFee: number } | null => {
    if (energyType === "strom" && landlordTariff) {
      return { pricePerKwh: Number(landlordTariff.price_per_kwh_grid), baseFee: Number(landlordTariff.base_fee_monthly) };
    }
    const st = (selfTariffs || []).find((t: any) => t.energy_type === energyType && (!t.valid_until || new Date(t.valid_until) >= new Date()));
    if (st) return { pricePerKwh: Number(st.price_per_kwh), baseFee: Number(st.base_fee_monthly) };
    return null;
  };

  // Aggregate all months
  const months = Object.keys(monthlyByType).sort();
  const allEnergyTypes = useMemo(() => {
    const types = new Set<string>();
    Object.values(monthlyByType).forEach((byType) => Object.keys(byType).forEach((et) => types.add(et)));
    return Array.from(types);
  }, [monthlyByType]);

  // Chart data: last 6 months, grouped by energy type
  const chartData = useMemo(() => {
    const last6 = months.slice(-6);
    return last6.map((m) => {
      const entry: any = { month: format(new Date(m + "-01"), "MMM yy", { locale: de }) };
      allEnergyTypes.forEach((et) => {
        entry[et] = monthlyByType[m]?.[et] || 0;
      });
      return entry;
    });
  }, [months, monthlyByType, allEnergyTypes]);

  // Total consumption per energy type
  const totalByType = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.values(monthlyByType).forEach((byType) => {
      Object.entries(byType).forEach(([et, val]) => {
        totals[et] = (totals[et] || 0) + val;
      });
    });
    return totals;
  }, [monthlyByType]);

  // Estimated total cost
  const totalCostEstimate = useMemo(() => {
    let cost = 0;
    Object.entries(totalByType).forEach(([et, kwh]) => {
      const tariff = getTariffPrice(et);
      if (tariff) cost += kwh * tariff.pricePerKwh + tariff.baseFee * months.length;
    });
    return cost;
  }, [totalByType, selfTariffs, landlordTariff, months.length]);

  // Avg monthly consumption
  const avgMonthly = months.length > 0
    ? Object.values(totalByType).reduce((s, v) => s + v, 0) / months.length
    : 0;

  // Use invoice data if available, otherwise meter data
  const hasInvoices = invoices.length > 0;
  const displayAvg = hasInvoices ? (invoices.reduce((s, i) => s + Number(i.total_kwh), 0) / invoices.length) : avgMonthly;
  const displayCost = hasInvoices ? invoices.reduce((s, i) => s + Number(i.total_amount), 0) : totalCostEstimate;

  const energyColors: Record<string, string> = {
    strom: "#3b82f6", gas: "#f59e0b", waerme: "#ef4444", wasser: "#06b6d4",
  };

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
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Ø Monat</span>
            </div>
            <p className="text-lg font-bold">{displayAvg.toFixed(0)} kWh</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">{hasInvoices ? "Gesamt" : "Geschätzt"}</span>
            </div>
            <p className="text-lg font-bold">{displayCost.toFixed(2)} €</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-energy-type breakdown */}
      {allEnergyTypes.length > 0 && !loadingMeter && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Verbrauch nach Energieträger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allEnergyTypes.map((et) => {
              const total = totalByType[et] || 0;
              const tariff = getTariffPrice(et);
              const cost = tariff ? total * tariff.pricePerKwh : null;
              return (
                <div key={et} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: energyColors[et] || "#94a3b8" }} />
                    <span className="text-sm font-medium">{fmtEnergyType(et)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{total.toFixed(1)} kWh</span>
                    {cost !== null && (
                      <span className="text-xs text-muted-foreground ml-2">≈ {cost.toFixed(2)} €</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
                <p className="font-semibold text-primary">{Number(latestInvoice.local_kwh).toFixed(0)} kWh</p>
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
                  {allEnergyTypes.map((et) => (
                    <Bar key={et} dataKey={et} name={fmtEnergyType(et)} fill={energyColors[et] || "#94a3b8"} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length === 0 && !loadingMeter && (
        <Card className="p-6 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Noch keine Verbrauchsdaten verfügbar</p>
        </Card>
      )}

      {loadingMeter && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
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

// Capitalize energy type and map display unit
const fmtEnergyType = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const displayUnit = (_unit: string, energyType: string) => {
  // Gas/Wasser volumes are stored in m³ but displayed as kWh in tenant app
  if (energyType === "gas") return "kWh";
  if (energyType === "strom") return "kWh";
  return "kWh";
};

function MeterTab({ tenantRecord }: { tenantRecord: TenantRecord }) {
  const [meters, setMeters] = useState<any[]>([]);
  const [allTotals, setAllTotals] = useState<any[]>([]);
  const [allReadings, setAllReadings] = useState<any[]>([]);
  const [meterStands, setMeterStands] = useState<Record<string, number>>({});
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
        supabase.from("meters").select("id, name, meter_number, energy_type, unit, sensor_uuid, location_integration_id").in("id", meterIds),
        supabase.from("meter_period_totals").select("*").in("meter_id", meterIds).eq("period_type", "month").order("period_start", { ascending: false }).limit(120),
        supabase.from("meter_readings").select("meter_id, value, reading_date").in("meter_id", meterIds).order("reading_date", { ascending: false }).limit(120),
      ]);
      setMeters(mData || []);
      setAllTotals(tData || []);
      setAllReadings(rData || []);
      setLoading(false);

      // Fetch live Zählerstände from gateway for automatic meters
      const autoMeters = (mData || []).filter((m: any) => m.sensor_uuid && m.location_integration_id);
      if (autoMeters.length > 0) {
        // Group by integration
        const byIntegration = new Map<string, any[]>();
        autoMeters.forEach((m: any) => {
          const arr = byIntegration.get(m.location_integration_id) || [];
          arr.push(m);
          byIntegration.set(m.location_integration_id, arr);
        });

        const stands: Record<string, number> = {};
        for (const [integrationId, intMeters] of byIntegration) {
          try {
            const { data } = await supabase.functions.invoke("loxone-api", {
              body: { locationIntegrationId: integrationId, action: "getSensors" },
            });
            if (data?.sensors) {
              for (const m of intMeters) {
                const sensor = data.sensors.find((s: any) => s.id === m.sensor_uuid);
                if (sensor?.meterReading !== undefined && sensor.meterReading !== null) {
                  stands[m.id] = Number(sensor.meterReading);
                } else if (sensor?.secondaryValue !== undefined && sensor.secondaryValue !== null) {
                  stands[m.id] = Number(sensor.secondaryValue);
                }
              }
            }
          } catch (e) {
            console.warn("Failed to fetch live meter stands:", e);
          }
        }
        setMeterStands(stands);
      }
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
          unit: displayUnit(m.unit, m.energy_type),
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
        {meters.map((m) => {
          const stand = meterStands[m.id];
          return (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.meter_number && `Nr. ${m.meter_number} · `}
                        {fmtEnergyType(m.energy_type)} · {displayUnit(m.unit, m.energy_type)}
                      </p>
                    </div>
                  </div>
                  {stand !== undefined && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Zählerstand</p>
                      <p className="font-bold text-sm">{fmtDe(stand, 1)} {displayUnit(m.unit, m.energy_type)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
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
                          <p className="text-xs text-muted-foreground">{fmtEnergyType(meter.energy_type)}</p>
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

// ── Tariffs Tab (Self-managed tariffs) ──
interface SelfTariff {
  id: string;
  tenant_electricity_tenant_id: string;
  energy_type: string;
  price_per_kwh: number;
  base_fee_monthly: number;
  provider_name: string | null;
  valid_from: string;
  valid_until: string | null;
}

function TariffsTab({ tenantRecord }: { tenantRecord: TenantRecord }) {
  const [tariffs, setTariffs] = useState<SelfTariff[]>([]);
  const [landlordTariffExists, setLandlordTariffExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    energy_type: "gas", price_per_kwh: "", base_fee_monthly: "0",
    provider_name: "", valid_from: new Date().toISOString().split("T")[0], valid_until: "",
  });

  const energyTypes = useMemo(() => {
    const types = new Set<string>();
    (tenantRecord.assigned_meters || []).forEach((am) => {
      if (am.meters?.energy_type) types.add(am.meters.energy_type);
    });
    return Array.from(types);
  }, [tenantRecord]);

  const fetchTariffs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tenant_self_tariffs")
      .select("*")
      .eq("tenant_electricity_tenant_id", tenantRecord.id)
      .order("valid_from", { ascending: false });
    setTariffs((data || []) as SelfTariff[]);

    // Check if landlord has set a Mieterstrom tariff for this tenant's location
    const { data: landlordTariff } = await supabase
      .from("tenant_electricity_tariffs")
      .select("id")
      .eq("tenant_id", tenantRecord.tenant_id)
      .limit(1);
    setLandlordTariffExists((landlordTariff || []).length > 0);

    setLoading(false);
  };

  useEffect(() => { fetchTariffs(); }, [tenantRecord.id]);

  const resetForm = (energyType = "gas") => {
    setForm({
      energy_type: energyType, price_per_kwh: "", base_fee_monthly: "0",
      provider_name: "", valid_from: new Date().toISOString().split("T")[0], valid_until: "",
    });
    setEditId(null);
  };

  const handleSave = async () => {
    const payload = {
      tenant_electricity_tenant_id: tenantRecord.id,
      energy_type: form.energy_type,
      price_per_kwh: parseFloat(form.price_per_kwh) || 0,
      base_fee_monthly: parseFloat(form.base_fee_monthly) || 0,
      provider_name: form.provider_name || null,
      valid_from: form.valid_from,
      valid_until: form.valid_until || null,
    };

    if (editId) {
      const { error } = await supabase.from("tenant_self_tariffs").update(payload).eq("id", editId);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Tarif aktualisiert");
    } else {
      const { error } = await supabase.from("tenant_self_tariffs").insert(payload);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Tarif gespeichert");
    }
    setShowForm(false);
    resetForm();
    fetchTariffs();
  };

  const handleEdit = (t: SelfTariff) => {
    setForm({
      energy_type: t.energy_type,
      price_per_kwh: String(t.price_per_kwh),
      base_fee_monthly: String(t.base_fee_monthly),
      provider_name: t.provider_name || "",
      valid_from: t.valid_from,
      valid_until: t.valid_until || "",
    });
    setEditId(t.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("tenant_self_tariffs").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Tarif gelöscht");
    fetchTariffs();
  };

  // Determine which energy types the tenant can self-manage
  const selfManagedTypes = useMemo(() => {
    const types: string[] = [];
    // Include wasser even if not from meters
    const allTypes = new Set(energyTypes);
    allTypes.add("wasser");
    allTypes.forEach((et) => {
      if (et === "gas" || et === "wasser" || et === "waerme") {
        types.push(et);
      } else if (et === "strom" && !landlordTariffExists) {
        types.push(et);
      }
    });
    return types;
  }, [energyTypes, landlordTariffExists]);

  // Energy types that already have an active (no valid_until or future valid_until) tariff
  const availableTypesForNew = useMemo(() => {
    const usedTypes = new Set(
      tariffs
        .filter((t) => !t.valid_until || new Date(t.valid_until) >= new Date())
        .map((t) => t.energy_type)
    );
    return selfManagedTypes.filter((et) => !usedTypes.has(et));
  }, [selfManagedTypes, tariffs]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Meine Tarife</h2>
        {!showForm && availableTypesForNew.length > 0 && (
          <Button size="sm" onClick={() => { resetForm(availableTypesForNew[0]); setShowForm(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> Tarif anlegen
          </Button>
        )}
      </div>

      {landlordTariffExists && energyTypes.includes("strom") && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600" />
              <p className="text-sm">
                <strong>Strom:</strong> Ihr Vermieter hat einen Mieterstrom-Tarif für Sie hinterlegt.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {selfManagedTypes.length === 0 && tariffs.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Keine selbstverwalteten Tarife nötig</p>
          <p className="text-xs mt-1">Ihr Vermieter verwaltet alle Tarife für Sie.</p>
        </Card>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{editId ? "Tarif bearbeiten" : "Neuer Tarif"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">Energieart</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={form.energy_type}
                onChange={(e) => setForm({ ...form, energy_type: e.target.value })}
                disabled={!!editId}
              >
                {(editId ? selfManagedTypes : availableTypesForNew).map((et) => (
                  <option key={et} value={et}>{fmtEnergyType(et)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm">Anbieter (optional)</Label>
              <Input
                value={form.provider_name}
                onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                placeholder="z.B. Stadtwerke..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Preis pro kWh (€)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.price_per_kwh}
                  onChange={(e) => setForm({ ...form, price_per_kwh: e.target.value })}
                  placeholder="0.35"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">Grundgebühr/Monat (€)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.base_fee_monthly}
                  onChange={(e) => setForm({ ...form, base_fee_monthly: e.target.value })}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Gültig ab</Label>
                <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Gültig bis (optional)</Label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1" disabled={!form.price_per_kwh}>
                {editId ? "Speichern" : "Anlegen"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Abbrechen</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing tariffs */}
      {tariffs.map((t) => (
        <Card key={t.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{fmtEnergyType(t.energy_type)}</Badge>
                  {t.provider_name && <span className="text-sm text-muted-foreground">{t.provider_name}</span>}
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-bold">{Number(t.price_per_kwh).toFixed(4)} €/kWh</span>
                  {Number(t.base_fee_monthly) > 0 && (
                    <span className="text-muted-foreground ml-2">+ {Number(t.base_fee_monthly).toFixed(2)} €/Monat</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ab {format(new Date(t.valid_from), "dd.MM.yyyy")}
                  {t.valid_until && ` bis ${format(new Date(t.valid_until), "dd.MM.yyyy")}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
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
type AppTab = "dashboard" | "meter" | "invoices" | "tariffs";

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
        {activeTab === "tariffs" && <TariffsTab tenantRecord={tenantRecord} />}
      </div>

      {/* Bottom Navigation */}
      <div className="border-t bg-background/95 backdrop-blur-sm flex" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {([
          { id: "dashboard" as AppTab, icon: Home, label: "Übersicht" },
          { id: "meter" as AppTab, icon: BarChart3, label: "Zähler" },
          { id: "tariffs" as AppTab, icon: Settings, label: "Tarife" },
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
