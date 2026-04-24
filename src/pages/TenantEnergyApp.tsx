import { useState, useEffect, useMemo } from "react";
import { tenantSupabase as supabase } from "@/integrations/supabase/tenantClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Zap, LogOut, Loader2, ArrowLeft, Mail, Lock, Eye, EyeOff,
  User, BarChart3, Receipt, Home, TrendingUp, TrendingDown,
  Settings, Plus, Trash2, Pencil, Sun, Moon, Monitor, Globe, ChevronRight,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { de, enUS, pl, fr } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { createTenantT, fmtEnergyTypeLocalized, type TenantLang } from "@/i18n/tenantAppTranslations";

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
  is_mieterstrom: boolean;
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

// Date-fns locale helper
const getDateFnsLocale = (lang: TenantLang) => {
  switch (lang) {
    case "en": return enUS;
    case "pl": return pl;
    case "fr": return fr;
    default: return de;
  }
};

// Number formatter based on language
const fmtNum = (v: number, decimals = 1, lang: TenantLang = "de") => {
  const loc = lang === "de" ? "de-DE" : lang === "fr" ? "fr-FR" : lang === "pl" ? "pl-PL" : "en-US";
  return v.toLocaleString(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const displayUnit = (_unit: string, energyType: string) => {
  if (energyType === "wasser") return "m³";
  return "kWh";
};

// ── Auth Screen ──
type AuthView = "login" | "register" | "forgotPassword";

function TenantAppAuth({ onAuth, lang }: { onAuth: () => void; lang: TenantLang }) {
  const t = createTenantT(lang);
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
      toast.error(error.message.includes("Invalid login") ? t("auth.invalid_credentials") : error.message);
    } else {
      onAuth();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error(t("auth.password_min")); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + "/te", data: { display_name: name } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("already registered") ? t("auth.email_exists") : error.message);
    } else {
      toast.success(t("auth.register_success"));
      setView("login");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error(t("auth.enter_email")); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/te",
    });
    setLoading(false);
    if (error) { toast.error(t("auth.send_error")); } else {
      toast.success(t("auth.reset_sent"));
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
          <h1 className="text-2xl font-bold">{t("app_name")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {view === "login" ? t("auth.login") : view === "register" ? t("auth.create_account") : t("auth.reset_password")}
          </p>
        </div>

        {view === "forgotPassword" ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10 text-base" required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("auth.send_link")}
            </Button>
            <button type="button" onClick={() => setView("login")} className="w-full text-sm text-muted-foreground flex items-center justify-center gap-1">
              <ArrowLeft className="h-3 w-3" /> {t("auth.back_to_login")}
            </button>
          </form>
        ) : (
          <form onSubmit={view === "login" ? handleLogin : handleRegister} className="space-y-4">
            {view === "register" && (
              <div className="space-y-2">
                <Label>{t("auth.name")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 pl-10 text-base" placeholder={t("auth.name_placeholder")} required />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10 text-base" required />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("auth.password")}</Label>
                {view === "login" && (
                  <button type="button" onClick={() => setView("forgotPassword")} className="text-xs text-green-600 hover:underline">
                    {t("auth.forgot_password")}
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
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : view === "login" ? t("auth.login") : t("auth.register")}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {view === "login" ? t("auth.no_account") : t("auth.already_registered")}{" "}
              <button type="button" onClick={() => setView(view === "login" ? "register" : "login")} className="text-green-600 hover:underline font-medium">
                {view === "login" ? t("auth.register") : t("auth.login")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Dashboard Tab ──
function DashboardTab({ tenantRecord, invoices, lang }: { tenantRecord: TenantRecord; invoices: Invoice[]; lang: TenantLang }) {
  const t = createTenantT(lang);
  const dateLoc = getDateFnsLocale(lang);
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
    const fetchData = async () => {
      const [{ data: totals }, { data: st }, { data: lt }] = await Promise.all([
        supabase.from("meter_period_totals").select("*").in("meter_id", meterIds).eq("period_type", "month").order("period_start", { ascending: false }).limit(120).gte("period_start", tenantRecord.move_in_date || "1900-01-01"),
        supabase.from("tenant_self_tariffs").select("*").eq("tenant_electricity_tenant_id", tenantRecord.id),
        supabase.from("tenant_electricity_tariffs").select("*").eq("tenant_id", tenantRecord.tenant_id).limit(1),
      ]);

      const existingKeys = new Set(
        (totals || []).map((t: any) => `${t.meter_id}::${(t.period_start as string).substring(0, 7)}`)
      );

      let fallbackTotals: any[] = [];
      // Paginate 5min readings to avoid the 1000-row PostgREST limit
      const PAGE_SIZE = 1000;
      let allAggData: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let aggQuery = supabase
          .from("meter_power_readings_5min")
          .select("meter_id, bucket, power_avg")
          .in("meter_id", meterIds)
          .order("bucket", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (tenantRecord.move_in_date) {
          aggQuery = aggQuery.gte("bucket", tenantRecord.move_in_date);
        }
        const { data: aggData } = await aggQuery;
        if (aggData && aggData.length > 0) {
          allAggData = allAggData.concat(aggData);
          offset += PAGE_SIZE;
          hasMore = aggData.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      if (allAggData.length > 0) {
        const monthlyMap: Record<string, number> = {};
        for (const row of allAggData) {
          const month = (row.bucket as string).substring(0, 7);
          const key = `${row.meter_id}::${month}`;
          if (existingKeys.has(key)) continue;
          monthlyMap[key] = (monthlyMap[key] || 0) + Number(row.power_avg) * (5.0 / 60.0);
        }
        for (const [key, total] of Object.entries(monthlyMap)) {
          const [meterId, month] = key.split("::");
          const meter = (tenantRecord.assigned_meters || []).find((am) => am.meter_id === meterId);
          fallbackTotals.push({
            meter_id: meterId,
            period_type: "month",
            period_start: `${month}-01`,
            total_value: total,
            energy_type: meter?.meters?.energy_type || "strom",
            source: "5min_aggregate",
          });
        }
      }

      setMeterTotals([...(totals || []), ...fallbackTotals]);
      setSelfTariffs(st || []);
      setLandlordTariff((lt || [])[0] || null);
      setLoadingMeter(false);
    };
    fetchData();
  }, [meterIds, tenantRecord.id, tenantRecord.tenant_id]);

  const monthlyByType = useMemo(() => {
    const moveInMonth = tenantRecord.move_in_date ? tenantRecord.move_in_date.substring(0, 7) : null;
    const map: Record<string, Record<string, number>> = {};
    meterTotals.forEach((t: any) => {
      const month = t.period_start.substring(0, 7);
      if (moveInMonth && month < moveInMonth) return;
      const eType = meterMap[t.meter_id]?.energy_type || t.energy_type || "strom";
      if (!map[month]) map[month] = {};
      map[month][eType] = (map[month][eType] || 0) + Number(t.total_value);
    });
    return map;
  }, [meterTotals, meterMap, tenantRecord.move_in_date]);

  const getTariffPrice = (energyType: string): { pricePerKwh: number; baseFee: number } | null => {
    if (energyType === "strom" && landlordTariff) {
      return { pricePerKwh: Number(landlordTariff.price_per_kwh_grid), baseFee: Number(landlordTariff.base_fee_monthly) };
    }
    const st = (selfTariffs || []).find((t: any) => t.energy_type === energyType && (!t.valid_until || new Date(t.valid_until) >= new Date()));
    if (st) return { pricePerKwh: Number(st.price_per_kwh), baseFee: Number(st.base_fee_monthly) };
    return null;
  };

  const months = Object.keys(monthlyByType).sort();
  const allEnergyTypes = useMemo(() => {
    const types = new Set<string>();
    (tenantRecord.assigned_meters || []).forEach((am) => {
      if (am.meters?.energy_type) types.add(am.meters.energy_type);
    });
    Object.values(monthlyByType).forEach((byType) => Object.keys(byType).forEach((et) => types.add(et)));
    return Array.from(types);
  }, [monthlyByType, tenantRecord.assigned_meters]);

  const chartData = useMemo(() => {
    const last6 = months.slice(-6);
    return last6.map((m) => {
      const entry: any = { month: format(new Date(m + "-01"), "MMM yy", { locale: dateLoc }) };
      allEnergyTypes.forEach((et) => {
        entry[fmtEnergyTypeLocalized(et, lang)] = monthlyByType[m]?.[et] || 0;
      });
      return entry;
    });
  }, [months, monthlyByType, allEnergyTypes, lang]);

  const totalByType = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.values(monthlyByType).forEach((byType) => {
      Object.entries(byType).forEach(([et, val]) => {
        totals[et] = (totals[et] || 0) + val;
      });
    });
    return totals;
  }, [monthlyByType]);

  const totalCostEstimate = useMemo(() => {
    let cost = 0;
    Object.entries(totalByType).forEach(([et, kwh]) => {
      const tariff = getTariffPrice(et);
      if (tariff) cost += kwh * tariff.pricePerKwh + tariff.baseFee * months.length;
    });
    return cost;
  }, [totalByType, selfTariffs, landlordTariff, months.length]);

  const avgMonthly = months.length > 0
    ? Object.values(totalByType).reduce((s, v) => s + v, 0) / months.length
    : 0;

  const hasInvoices = invoices.length > 0;
  const displayAvg = hasInvoices ? (invoices.reduce((s, i) => s + Number(i.total_kwh), 0) / invoices.length) : avgMonthly;
  const displayCost = hasInvoices ? invoices.reduce((s, i) => s + Number(i.total_amount), 0) : totalCostEstimate;

  const energyColors: Record<string, string> = {
    strom: "#3b82f6", gas: "#f59e0b", waerme: "#ef4444", wasser: "#06b6d4",
  };

  return (
    <div className="space-y-4">
      <div className="text-center pb-2">
        <p className="text-sm text-muted-foreground">{t("dash.welcome")}</p>
        <h2 className="text-xl font-bold">{tenantRecord.name}</h2>
        {tenantRecord.unit_label && <p className="text-sm text-muted-foreground">{tenantRecord.unit_label}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">{t("dash.avg_month")}</span>
            </div>
            <p className="text-lg font-bold">{fmtNum(displayAvg, 0, lang)} kWh</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">{hasInvoices ? t("dash.total") : t("dash.estimated")}</span>
            </div>
            <p className="text-lg font-bold">{fmtNum(displayCost, 2, lang)} €</p>
          </CardContent>
        </Card>
      </div>

      {allEnergyTypes.length > 0 && !loadingMeter && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("dash.by_energy_type")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allEnergyTypes.map((et) => {
              const total = totalByType[et] || 0;
              const tariff = getTariffPrice(et);
              const cost = tariff ? total * tariff.pricePerKwh : null;
              const unit = et === "wasser" ? "m³" : "kWh";
              return (
                <div key={et} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: energyColors[et] || "#94a3b8" }} />
                    <span className="text-sm font-medium">{fmtEnergyTypeLocalized(et, lang)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{fmtNum(total, 1, lang)} {unit}</span>
                    {cost !== null ? (
                      <span className="text-xs text-muted-foreground ml-2">≈ {fmtNum(cost, 2, lang)} €</span>
                    ) : (
                      <span className="text-xs text-muted-foreground ml-2">≈ 0,00 €</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {latestInvoice && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("dash.latest_invoice")}</CardDescription>
            <CardTitle className="text-base">
              {format(new Date(latestInvoice.period_start), "dd.MM.")} – {format(new Date(latestInvoice.period_end), "dd.MM.yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">{t("dash.local_pv")}</p>
                <p className="font-semibold text-primary">{fmtNum(Number(latestInvoice.local_kwh), 0, lang)} kWh</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t("dash.grid")}</p>
                <p className="font-semibold">{fmtNum(Number(latestInvoice.grid_kwh), 0, lang)} kWh</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t("dash.amount")}</p>
                <p className="font-bold">{fmtNum(Number(latestInvoice.total_amount), 2, lang)} €</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("dash.consumption_chart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => fmtNum(value, 1, lang)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {allEnergyTypes.map((et) => (
                    <Bar key={et} dataKey={fmtEnergyTypeLocalized(et, lang)} name={fmtEnergyTypeLocalized(et, lang)} fill={energyColors[et] || "#94a3b8"} radius={[2, 2, 0, 0]} />
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
          <p>{t("dash.no_data")}</p>
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
function InvoicesTab({ invoices, lang }: { invoices: Invoice[]; lang: TenantLang }) {
  const t = createTenantT(lang);
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("inv.title")}</h2>
      {invoices.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t("inv.none")}</p>
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
                  {inv.status === "paid" ? t("inv.paid") : inv.status === "issued" ? t("inv.open") : t("inv.draft")}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>PV: {fmtNum(Number(inv.local_kwh), 1, lang)} kWh = {fmtNum(Number(inv.local_amount), 2, lang)} €</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>{t("dash.grid")}: {fmtNum(Number(inv.grid_kwh), 1, lang)} kWh = {fmtNum(Number(inv.grid_amount), 2, lang)} €</span>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t text-sm">
                <span className="text-muted-foreground">{t("inv.base_fee")} {fmtNum(Number(inv.base_fee), 2, lang)} €</span>
                <span className="font-bold">{fmtNum(Number(inv.total_amount), 2, lang)} €</span>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ── Meter Tab ──
function MeterTab({ tenantRecord, lang }: { tenantRecord: TenantRecord; lang: TenantLang }) {
  const t = createTenantT(lang);
  const dateLoc = getDateFnsLocale(lang);
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

      // Fallback: aggregate from 5min data for months missing in period_totals
      const existingKeys = new Set(
        (tData || []).map((t: any) => `${t.meter_id}::${(t.period_start as string).substring(0, 7)}`)
      );

      let fallbackTotals: any[] = [];
      const moveInFilter = tenantRecord.move_in_date || "1900-01-01";
      let aggQuery = supabase
        .from("meter_power_readings_5min")
        .select("meter_id, bucket, power_avg")
        .in("meter_id", meterIds)
        .gte("bucket", moveInFilter)
        .order("bucket", { ascending: true });
      const { data: aggData } = await aggQuery;

      if (aggData && aggData.length > 0) {
        const monthlyMap: Record<string, number> = {};
        for (const row of aggData) {
          const month = (row.bucket as string).substring(0, 7);
          const key = `${row.meter_id}::${month}`;
          if (existingKeys.has(key)) continue;
          monthlyMap[key] = (monthlyMap[key] || 0) + Number(row.power_avg) * (5.0 / 60.0);
        }
        for (const [key, total] of Object.entries(monthlyMap)) {
          const [meterId, month] = key.split("::");
          const meter = (mData || []).find((m: any) => m.id === meterId);
          fallbackTotals.push({
            meter_id: meterId,
            period_type: "month",
            period_start: `${month}-01`,
            total_value: total,
            energy_type: meter?.energy_type || "strom",
            source: "5min_aggregate",
          });
        }
      }

      setMeters(mData || []);
      setAllTotals([...(tData || []), ...fallbackTotals]);
      setAllReadings(rData || []);
      setLoading(false);

      // Fetch live Zählerstände from gateway for automatic meters
      const autoMeters = (mData || []).filter((m: any) => m.sensor_uuid && m.location_integration_id);
      if (autoMeters.length > 0) {
        const byIntegration = new Map<string, any[]>();
        autoMeters.forEach((m: any) => {
          const arr = byIntegration.get(m.location_integration_id) || [];
          arr.push(m);
          byIntegration.set(m.location_integration_id, arr);
        });

        const stands: Record<string, number> = {};
        // Fetch integration types for dynamic edge function resolution
        const integrationIds = Array.from(byIntegration.keys());
        const { data: liRows } = await supabase
          .from("location_integrations")
          .select("id, integrations(type)")
          .in("id", integrationIds);
        const typeMap = new Map<string, string>();
        liRows?.forEach((row: any) => {
          if (row.integrations?.type) typeMap.set(row.id, row.integrations.type);
        });

        for (const [integrationId, intMeters] of byIntegration) {
          try {
            const integrationType = typeMap.get(integrationId) || "";
            const edgeFn = integrationType
              ? (await import("@/lib/gatewayRegistry")).getEdgeFunctionName(integrationType)
              : "loxone-api";
            const { invokeWithRetry } = await import("@/lib/invokeWithRetry");
            const { data } = await invokeWithRetry(edgeFn, {
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

  const monthGroups = useMemo(() => {
    const moveIn = tenantRecord.move_in_date ? new Date(tenantRecord.move_in_date) : null;
    const moveOut = tenantRecord.move_out_date ? new Date(tenantRecord.move_out_date) : null;
    const monthSet = new Set<string>();

    allTotals.forEach((t: any) => {
      const monthDate = new Date(t.period_start);
      if (moveIn && monthDate < startOfMonth(moveIn)) return;
      if (moveOut && monthDate > startOfMonth(moveOut)) return;
      monthSet.add(t.period_start);
    });

    if (meters.length > 0) {
      const now = new Date();
      const currentMonthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const currentMonthDate = new Date(currentMonthStart);
      const inRange = (!moveIn || currentMonthDate >= startOfMonth(moveIn)) &&
                      (!moveOut || currentMonthDate <= startOfMonth(moveOut));
      if (inRange) monthSet.add(currentMonthStart);
    }

    const sorted = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    return sorted.map((periodStart) => {
      const monthDate = new Date(periodStart);
      const label = format(monthDate, "MMMM yyyy", { locale: dateLoc });

      const meterEntries = meters.map((m) => {
        const reading = allTotals.find((t: any) => t.meter_id === m.id && t.period_start === periodStart);
        const monthEnd = endOfMonth(monthDate);
        const meterReading = allReadings.find((r: any) =>
          r.meter_id === m.id && new Date(r.reading_date) <= monthEnd && new Date(r.reading_date) >= monthDate
        );

        return {
          meter: m,
          consumption: reading ? Number(reading.total_value) : 0,
          meterStand: meterReading ? Number(meterReading.value) : null,
          unit: displayUnit(m.unit, m.energy_type),
        };
      });

      return { periodStart, label, meterEntries };
    });
  }, [meters, allTotals, allReadings, tenantRecord.move_in_date, tenantRecord.move_out_date, dateLoc]);

  if (meterIds.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{t("meter.no_meter")}</p>
        <p className="text-xs mt-1">{t("meter.contact_landlord")}</p>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
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
                        {fmtEnergyTypeLocalized(m.energy_type, lang)} · {displayUnit(m.unit, m.energy_type)}
                      </p>
                    </div>
                  </div>
                  {stand !== undefined && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t("meter.reading")}</p>
                      <p className="font-bold text-sm">{fmtNum(stand, 1, lang)} {displayUnit(m.unit, m.energy_type)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="text-lg font-semibold">{t("meter.monthly")}</h2>

      {monthGroups.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t("meter.no_data")}</p>
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
                          <p className="text-xs text-muted-foreground">{fmtEnergyTypeLocalized(meter.energy_type, lang)}</p>
                        </div>
                        <div className="text-right">
                          {consumption !== null ? (
                            <p className="font-bold">{fmtNum(consumption, 1, lang)} {unit}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">–</p>
                          )}
                          {meterStand !== null && (
                            <p className="text-xs text-muted-foreground">
                              {t("meter.reading_label")} {fmtNum(meterStand, 0, lang)} {unit}
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

// ── Tariffs Tab ──
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

function TariffsTab({ tenantRecord, lang }: { tenantRecord: TenantRecord; lang: TenantLang }) {
  const t = createTenantT(lang);
  const [tariffs, setTariffs] = useState<SelfTariff[]>([]);
  const [landlordTariffExists, setLandlordTariffExists] = useState(false);
  const [landlordTariff, setLandlordTariff] = useState<{ price_per_kwh_local: number; price_per_kwh_grid: number; base_fee_monthly: number; valid_from: string } | null>(null);
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
    const [{ data }, { data: ltData }] = await Promise.all([
      supabase
        .from("tenant_self_tariffs")
        .select("*")
        .eq("tenant_electricity_tenant_id", tenantRecord.id)
        .order("valid_from", { ascending: false }),
      tenantRecord.is_mieterstrom
        ? supabase
            .from("tenant_electricity_tariffs")
            .select("*")
            .eq("tenant_id", tenantRecord.tenant_id)
            .order("valid_from", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: null }),
    ]);
    setTariffs((data || []) as SelfTariff[]);
    setLandlordTariffExists(!!tenantRecord.is_mieterstrom);
    if (ltData && ltData.length > 0) {
      setLandlordTariff(ltData[0] as any);
    }
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
      if (error) { toast.error(t("tariff.save_error")); return; }
      toast.success(t("tariff.updated"));
    } else {
      const { error } = await supabase.from("tenant_self_tariffs").insert(payload);
      if (error) { toast.error(t("tariff.save_error")); return; }
      toast.success(t("tariff.saved"));
    }
    setShowForm(false);
    resetForm();
    fetchTariffs();
  };

  const handleEdit = (tr: SelfTariff) => {
    setForm({
      energy_type: tr.energy_type,
      price_per_kwh: String(tr.price_per_kwh),
      base_fee_monthly: String(tr.base_fee_monthly),
      provider_name: tr.provider_name || "",
      valid_from: tr.valid_from,
      valid_until: tr.valid_until || "",
    });
    setEditId(tr.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("tenant_self_tariffs").delete().eq("id", id);
    if (error) { toast.error(t("tariff.delete_error")); return; }
    toast.success(t("tariff.deleted"));
    fetchTariffs();
  };

  const selfManagedTypes = useMemo(() => {
    const types: string[] = [];
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

  const availableTypesForNew = useMemo(() => {
    const usedTypes = new Set(
      tariffs
        .filter((tr) => !tr.valid_until || new Date(tr.valid_until) >= new Date())
        .map((tr) => tr.energy_type)
    );
    return selfManagedTypes.filter((et) => !usedTypes.has(et));
  }, [selfManagedTypes, tariffs]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("tariff.title")}</h2>
        {!showForm && availableTypesForNew.length > 0 && (
          <Button size="sm" onClick={() => { resetForm(availableTypesForNew[0]); setShowForm(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> {t("tariff.add")}
          </Button>
        )}
      </div>

      {landlordTariffExists && energyTypes.includes("strom") && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600" />
              <p className="text-sm">
                <strong>{fmtEnergyTypeLocalized("strom", lang)}:</strong> {t("tariff.mieterstrom_info")}
              </p>
            </div>
            {landlordTariff && (
              <div className="pl-6 text-sm space-y-0.5 text-muted-foreground">
                <p>{t("dash.local_pv")}: <span className="font-semibold text-foreground">{fmtNum(landlordTariff.price_per_kwh_local, 4, lang)} €/kWh</span></p>
                <p>{t("dash.grid")}: <span className="font-semibold text-foreground">{fmtNum(landlordTariff.price_per_kwh_grid, 4, lang)} €/kWh</span></p>
                {landlordTariff.base_fee_monthly > 0 && (
                  <p>{t("inv.base_fee")} <span className="font-semibold text-foreground">{fmtNum(landlordTariff.base_fee_monthly, 2, lang)} €/{lang === "de" ? "Monat" : lang === "fr" ? "mois" : lang === "pl" ? "mies." : "month"}</span></p>
                )}
                <p className="text-xs">{t("tariff.from")} {landlordTariff.valid_from}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selfManagedTypes.length === 0 && tariffs.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t("tariff.none_needed")}</p>
          <p className="text-xs mt-1">{t("tariff.landlord_manages")}</p>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{editId ? t("tariff.edit") : t("tariff.new")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">{t("tariff.energy_type")}</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={form.energy_type}
                onChange={(e) => setForm({ ...form, energy_type: e.target.value })}
                disabled={!!editId}
              >
                {(editId ? selfManagedTypes : availableTypesForNew).map((et) => (
                  <option key={et} value={et}>{fmtEnergyTypeLocalized(et, lang)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm">{t("tariff.provider")}</Label>
              <Input
                value={form.provider_name}
                onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                placeholder={t("tariff.provider_placeholder")}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">{t("tariff.price_per")} {form.energy_type === "wasser" || form.energy_type === "gas" ? "m³" : "kWh"} (€)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.price_per_kwh}
                  onChange={(e) => setForm({ ...form, price_per_kwh: e.target.value })}
                  placeholder="0.35"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">{t("tariff.base_fee_monthly")}</Label>
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
                <Label className="text-sm">{t("tariff.valid_from")}</Label>
                <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">{t("tariff.valid_until")}</Label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1" disabled={!form.price_per_kwh}>
                {editId ? t("tariff.save") : t("tariff.create")}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>{t("tariff.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tariffs.map((tr) => (
        <Card key={tr.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{fmtEnergyTypeLocalized(tr.energy_type, lang)}</Badge>
                  {tr.provider_name && <span className="text-sm text-muted-foreground">{tr.provider_name}</span>}
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-bold">{fmtNum(Number(tr.price_per_kwh), 4, lang)} €/{tr.energy_type === "wasser" || tr.energy_type === "gas" ? "m³" : "kWh"}</span>
                  {Number(tr.base_fee_monthly) > 0 && (
                    <span className="text-muted-foreground ml-2">+ {fmtNum(Number(tr.base_fee_monthly), 2, lang)} €/{lang === "de" ? "Monat" : lang === "en" ? "month" : lang === "pl" ? "mies." : "mois"}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("tariff.from")} {format(new Date(tr.valid_from), "dd.MM.yyyy")}
                  {tr.valid_until && ` ${t("tariff.until")} ${format(new Date(tr.valid_until), "dd.MM.yyyy")}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(tr)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(tr.id)}>
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
function NotLinkedScreen({ email, onLogout, lang }: { email: string; onLogout: () => void; lang: TenantLang }) {
  const t = createTenantT(lang);
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Home className="h-9 w-9 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">{t("notlinked.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {lang === "de" ? `Für ` : ""}<strong>{email}</strong> {t("notlinked.message")}
        </p>
        <Button variant="outline" onClick={onLogout} className="gap-2">
          <LogOut className="h-4 w-4" /> {t("auth.logout")}
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

  // Tenant app user preferences (persisted in localStorage)
  type TenantThemeMode = "light" | "dark" | "system";
  const [tenantLang, setTenantLangState] = useState<TenantLang>(() => {
    try { return (localStorage.getItem("te-lang") as TenantLang) || "de"; } catch { return "de"; }
  });
  const [tenantTheme, setTenantThemeState] = useState<TenantThemeMode>(() => {
    try { return (localStorage.getItem("te-theme") as TenantThemeMode) || "system"; } catch { return "system"; }
  });

  const setTenantLang = (lang: TenantLang) => {
    setTenantLangState(lang);
    try { localStorage.setItem("te-lang", lang); } catch {}
  };
  const setTenantTheme = (mode: TenantThemeMode) => {
    setTenantThemeState(mode);
    try { localStorage.setItem("te-theme", mode); } catch {}
  };

  const t = createTenantT(tenantLang);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (tenantTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", tenantTheme === "dark");
    }
  }, [tenantTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (tenantTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => document.documentElement.classList.toggle("dark", e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [tenantTheme]);

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
    if (meta) meta.setAttribute("content", t("app_name"));
  }, [tenantLang]);

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

      let { data: rec } = await supabase
        .from("tenant_electricity_tenants")
        .select("id, name, unit_label, meter_id, tenant_id, status, move_in_date, move_out_date, is_mieterstrom, tenant_electricity_tenant_meters(meter_id, meters(id, name, energy_type, unit, meter_number))")
        .eq("auth_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!rec && user.email) {
        const { data: emailMatch } = await supabase
          .from("tenant_electricity_tenants")
          .select("id, name, unit_label, meter_id, tenant_id, status, move_in_date, move_out_date, is_mieterstrom, tenant_electricity_tenant_meters(meter_id, meters(id, name, energy_type, unit, meter_number))")
          .eq("email", user.email)
          .eq("status", "active")
          .is("auth_user_id", null)
          .maybeSingle();

        if (emailMatch) {
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

        let invQuery = supabase
          .from("tenant_electricity_invoices")
          .select("*")
          .eq("tenant_electricity_tenant_id", rec.id)
          .order("period_start", { ascending: false });
        if (rec.move_in_date) {
          invQuery = invQuery.gte("period_start", rec.move_in_date);
        }
        const { data: invData } = await invQuery;
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
    return <TenantAppAuth onAuth={() => {}} lang={tenantLang} />;
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("loading.data")}</p>
        </div>
      </div>
    );
  }

  if (!tenantRecord) {
    return <NotLinkedScreen email={user.email || ""} onLogout={handleLogout} lang={tenantLang} />;
  }

  const langLabels: Record<TenantLang, string> = { de: "Deutsch", en: "English", pl: "Polski", fr: "Français" };

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-green-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold">{t("app_name")}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground truncate">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Language */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Globe className="h-4 w-4" />
                {langLabels[tenantLang]}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(Object.entries(langLabels) as [TenantLang, string][]).map(([code, label]) => (
                  <DropdownMenuItem key={code} onClick={() => setTenantLang(code)} className={tenantLang === code ? "font-semibold" : ""}>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {/* Theme */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                {tenantTheme === "dark" ? <Moon className="h-4 w-4" /> : tenantTheme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                {tenantTheme === "dark" ? t("menu.dark") : tenantTheme === "light" ? t("menu.light") : t("menu.system")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {([["light", t("menu.light"), Sun], ["dark", t("menu.dark"), Moon], ["system", t("menu.system"), Monitor]] as const).map(([val, label, Icon]) => (
                  <DropdownMenuItem key={val} onClick={() => setTenantTheme(val as any)} className={`gap-2 ${tenantTheme === val ? "font-semibold" : ""}`}>
                    <Icon className="h-4 w-4" /> {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> {t("auth.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4 pb-20">
        {activeTab === "dashboard" && <DashboardTab tenantRecord={tenantRecord} invoices={invoices} lang={tenantLang} />}
        {activeTab === "meter" && <MeterTab tenantRecord={tenantRecord} lang={tenantLang} />}
        {activeTab === "invoices" && <InvoicesTab invoices={invoices} lang={tenantLang} />}
        {activeTab === "tariffs" && <TariffsTab tenantRecord={tenantRecord} lang={tenantLang} />}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm flex" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {([
          { id: "dashboard" as AppTab, icon: Home, label: t("nav.overview") },
          { id: "meter" as AppTab, icon: BarChart3, label: t("nav.meters") },
          { id: "tariffs" as AppTab, icon: Settings, label: t("nav.tariffs") },
          { id: "invoices" as AppTab, icon: Receipt, label: t("nav.invoices") },
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
