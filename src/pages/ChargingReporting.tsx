import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, BarChart3, Users as UsersIcon, Zap, Euro, Clock, PlugZap } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
type Dimension =
  | "charge_point"
  | "charge_point_group"
  | "user"
  | "user_group"
  | "billing_group"
  | "day"
  | "week"
  | "month";

type Metric = "energy_kwh" | "revenue_gross" | "revenue_net" | "sessions" | "duration_h" | "idle_fee";

interface SessionRow {
  id: string;
  charge_point_id: string | null;
  id_tag: string | null;
  start_time: string;
  stop_time: string | null;
  energy_kwh: number | null;
  status: string | null;
}
interface InvoiceRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  billing_group_id: string | null;
  total_amount: number | null;
  net_amount: number | null;
  idle_fee_amount: number | null;
  total_energy_kwh: number | null;
  status: string | null;
  invoice_date: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtEur = (n: number) => `${fmtNum(n, 2)} €`;
const fmtKwh = (n: number) => `${fmtNum(n, 1)} kWh`;

function isoStartOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); }
function isoEndOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.toISOString(); }
function daysAgo(n: number) { const x = new Date(); x.setDate(x.getDate() - n); return x; }
function toISODate(d: Date) { return d.toISOString().slice(0, 10); }

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Page ─────────────────────────────────────────────────────────────────────
const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "7d", label: "Letzte 7 Tage", days: 7 },
  { key: "30d", label: "Letzte 30 Tage", days: 30 },
  { key: "90d", label: "Letzte 90 Tage", days: 90 },
  { key: "365d", label: "Letzte 12 Monate", days: 365 },
];

const METRIC_META: Record<Metric, { label: string; fmt: (n: number) => string; short: string }> = {
  energy_kwh:   { label: "Energie",      fmt: fmtKwh,               short: "kWh" },
  revenue_gross:{ label: "Umsatz brutto", fmt: fmtEur,              short: "€ brutto" },
  revenue_net:  { label: "Umsatz netto",  fmt: fmtEur,              short: "€ netto" },
  sessions:     { label: "Sessions",     fmt: (n) => fmtNum(n),     short: "#" },
  duration_h:   { label: "Ladedauer",    fmt: (n) => `${fmtNum(n, 1)} h`, short: "h" },
  idle_fee:     { label: "Standzeit-Gebühr", fmt: fmtEur,           short: "€" },
};

const DIMENSION_LABEL: Record<Dimension, string> = {
  charge_point: "Ladepunkt",
  charge_point_group: "Ladepunktgruppe",
  user: "Nutzer",
  user_group: "Nutzergruppe",
  billing_group: "Rechnungsgruppe",
  day: "Tag",
  week: "Woche",
  month: "Monat",
};

const PRIMARY_HSL = "hsl(var(--primary))";
const MUTED_HSL = "hsl(var(--muted-foreground))";

const ChargingReporting = () => {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  // Filter state
  const [rangePreset, setRangePreset] = useState<string>("30d");
  const [customFrom, setCustomFrom] = useState<string>(toISODate(daysAgo(30)));
  const [customTo, setCustomTo] = useState<string>(toISODate(new Date()));
  const [dimension, setDimension] = useState<Dimension>("charge_point");
  const [metric, setMetric] = useState<Metric>("energy_kwh");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "open">("all");

  const { fromISO, toISO } = useMemo(() => {
    if (rangePreset === "custom") {
      return { fromISO: isoStartOfDay(new Date(customFrom)), toISO: isoEndOfDay(new Date(customTo)) };
    }
    const preset = PRESETS.find((p) => p.key === rangePreset) ?? PRESETS[1];
    return { fromISO: isoStartOfDay(daysAgo(preset.days)), toISO: isoEndOfDay(new Date()) };
  }, [rangePreset, customFrom, customTo]);

  // ── Data (parallel loads) ──────────────────────────────────────────────────
  const sessionsQ = useQuery({
    queryKey: ["cr-sessions", tenantId, fromISO, toISO],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("id, charge_point_id, id_tag, start_time, stop_time, energy_kwh, status")
        .eq("tenant_id", tenantId!)
        .gte("start_time", fromISO)
        .lte("start_time", toISO)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["cr-invoices", tenantId, fromISO, toISO],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from("charging_invoices")
        .select("id, session_id, user_id, billing_group_id, total_amount, net_amount, idle_fee_amount, total_energy_kwh, status, invoice_date")
        .eq("tenant_id", tenantId!)
        .gte("invoice_date", fromISO.slice(0, 10))
        .lte("invoice_date", toISO.slice(0, 10));
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const chargePointsQ = useQuery({
    queryKey: ["cr-cps", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("id, name, group_id")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cpGroupsQ = useQuery({
    queryKey: ["cr-cp-groups", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("charge_point_groups").select("id, name").eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const usersQ = useQuery({
    queryKey: ["cr-users", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_users").select("id, name, group_id").eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const userGroupsQ = useQuery({
    queryKey: ["cr-user-groups", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_user_groups").select("id, name").eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const billingGroupsQ = useQuery({
    queryKey: ["cr-billing-groups", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_billing_groups").select("id, name").eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rfidQ = useQuery({
    queryKey: ["cr-rfid", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_user_rfid_tags").select("tag, user_id").eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = sessionsQ.isLoading || invoicesQ.isLoading;

  // Lookup maps
  const cpMap = useMemo(() => new Map((chargePointsQ.data ?? []).map((c) => [c.id, c])), [chargePointsQ.data]);
  const cpGroupMap = useMemo(() => new Map((cpGroupsQ.data ?? []).map((g) => [g.id, g.name])), [cpGroupsQ.data]);
  const userMap = useMemo(() => new Map((usersQ.data ?? []).map((u) => [u.id, u])), [usersQ.data]);
  const userGroupMap = useMemo(() => new Map((userGroupsQ.data ?? []).map((g) => [g.id, g.name])), [userGroupsQ.data]);
  const billingGroupMap = useMemo(() => new Map((billingGroupsQ.data ?? []).map((g) => [g.id, g.name])), [billingGroupsQ.data]);
  const rfidToUser = useMemo(() => new Map((rfidQ.data ?? []).map((r) => [String(r.tag ?? "").toLowerCase(), r.user_id])), [rfidQ.data]);

  // Invoices per session_id — quick revenue lookup
  const invoiceBySession = useMemo(() => {
    const m = new Map<string, InvoiceRow>();
    for (const inv of invoicesQ.data ?? []) {
      if (inv.session_id) m.set(inv.session_id, inv);
    }
    return m;
  }, [invoicesQ.data]);

  // Filtered sessions after status filter
  const sessions = useMemo(() => {
    const all = sessionsQ.data ?? [];
    if (statusFilter === "all") return all;
    return all.filter((s) => {
      const inv = invoiceBySession.get(s.id);
      if (statusFilter === "paid") return inv?.status === "paid";
      if (statusFilter === "open") return !inv || inv.status !== "paid";
      return true;
    });
  }, [sessionsQ.data, statusFilter, invoiceBySession]);

  // ── KPI ────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    let energy = 0, durationH = 0, count = 0;
    for (const s of sessions) {
      energy += Number(s.energy_kwh ?? 0);
      if (s.start_time && s.stop_time) {
        durationH += (new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000;
      }
      count += 1;
    }
    let revenueGross = 0, revenueNet = 0, idleFee = 0;
    for (const inv of invoicesQ.data ?? []) {
      revenueGross += Number(inv.total_amount ?? 0);
      revenueNet += Number(inv.net_amount ?? 0);
      idleFee += Number(inv.idle_fee_amount ?? 0);
    }
    const avgKwh = count > 0 ? energy / count : 0;
    const avgPrice = energy > 0 ? revenueGross / energy : 0;
    return { energy, durationH, count, revenueGross, revenueNet, idleFee, avgKwh, avgPrice };
  }, [sessions, invoicesQ.data]);

  // ── Grouping key resolver ──────────────────────────────────────────────────
  function groupKey(s: SessionRow): { key: string; label: string } {
    const inv = invoiceBySession.get(s.id);
    switch (dimension) {
      case "charge_point": {
        const cp = s.charge_point_id ? cpMap.get(s.charge_point_id) : null;
        return { key: s.charge_point_id ?? "unknown", label: cp?.name ?? "—" };
      }
      case "charge_point_group": {
        const cp = s.charge_point_id ? cpMap.get(s.charge_point_id) : null;
        const gid = cp?.group_id ?? null;
        return { key: gid ?? "none", label: gid ? cpGroupMap.get(gid) ?? "—" : "Ohne Gruppe" };
      }
      case "user": {
        const uid = inv?.user_id ?? rfidToUser.get(String(s.id_tag ?? "").toLowerCase()) ?? null;
        return { key: uid ?? "anon", label: uid ? userMap.get(uid)?.name ?? "—" : "Unbekannt" };
      }
      case "user_group": {
        const uid = inv?.user_id ?? rfidToUser.get(String(s.id_tag ?? "").toLowerCase()) ?? null;
        const gid = uid ? userMap.get(uid)?.group_id ?? null : null;
        return { key: gid ?? "none", label: gid ? userGroupMap.get(gid) ?? "—" : "Ohne Gruppe" };
      }
      case "billing_group": {
        const gid = inv?.billing_group_id ?? null;
        return { key: gid ?? "none", label: gid ? billingGroupMap.get(gid) ?? "—" : "Ohne Gruppe" };
      }
      case "day": {
        const d = new Date(s.start_time);
        const key = toISODate(d);
        return { key, label: d.toLocaleDateString("de-DE") };
      }
      case "week": {
        const d = new Date(s.start_time);
        const year = d.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const week = Math.ceil((((d.getTime() - oneJan.getTime()) / 86400000) + oneJan.getDay() + 1) / 7);
        return { key: `${year}-W${String(week).padStart(2, "0")}`, label: `KW ${week}/${year}` };
      }
      case "month": {
        const d = new Date(s.start_time);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return { key, label: d.toLocaleDateString("de-DE", { month: "short", year: "numeric" }) };
      }
    }
  }

  function metricValue(s: SessionRow): number {
    const inv = invoiceBySession.get(s.id);
    switch (metric) {
      case "energy_kwh": return Number(s.energy_kwh ?? 0);
      case "revenue_gross": return Number(inv?.total_amount ?? 0);
      case "revenue_net": return Number(inv?.net_amount ?? 0);
      case "sessions": return 1;
      case "duration_h":
        return s.start_time && s.stop_time
          ? (new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000
          : 0;
      case "idle_fee": return Number(inv?.idle_fee_amount ?? 0);
    }
  }

  // ── Aggregation ────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const m = new Map<string, { label: string; value: number; sessions: number; kwh: number; revenue: number }>();
    for (const s of sessions) {
      const { key, label } = groupKey(s);
      const inv = invoiceBySession.get(s.id);
      const cur = m.get(key) ?? { label, value: 0, sessions: 0, kwh: 0, revenue: 0 };
      cur.value += metricValue(s);
      cur.sessions += 1;
      cur.kwh += Number(s.energy_kwh ?? 0);
      cur.revenue += Number(inv?.total_amount ?? 0);
      m.set(key, cur);
    }
    const rows = Array.from(m.entries()).map(([key, v]) => ({ key, ...v }));
    // Sort: time dimensions chronologically, others by value desc
    if (dimension === "day" || dimension === "week" || dimension === "month") {
      rows.sort((a, b) => a.key.localeCompare(b.key));
    } else {
      rows.sort((a, b) => b.value - a.value);
    }
    return rows;
  }, [sessions, dimension, metric, invoiceBySession]);

  const chartData = useMemo(() => grouped.slice(0, 20).map((r) => ({ name: r.label, value: r.value })), [grouped]);

  // Time-series (always by day) for the trend widget
  const timeSeries = useMemo(() => {
    const m = new Map<string, { kwh: number; revenue: number; sessions: number }>();
    for (const s of sessions) {
      const key = toISODate(new Date(s.start_time));
      const inv = invoiceBySession.get(s.id);
      const cur = m.get(key) ?? { kwh: 0, revenue: 0, sessions: 0 };
      cur.kwh += Number(s.energy_kwh ?? 0);
      cur.revenue += Number(inv?.total_amount ?? 0);
      cur.sessions += 1;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, label: new Date(date).toLocaleDateString("de-DE"), ...v }));
  }, [sessions, invoiceBySession]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [DIMENSION_LABEL[dimension], METRIC_META[metric].label, "Sessions", "kWh", "Umsatz (€)"],
      ...grouped.map((r) => [r.label, r.value, r.sessions, r.kwh, r.revenue]),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`ladeinfrastruktur-report_${dimension}_${metric}_${stamp}.csv`, rows);
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-full overflow-x-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Reporting
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Statistiken und Auswertungen zu Ladepunkten, Nutzern und Abrechnung
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || grouped.length === 0}>
            <Download className="h-4 w-4 mr-2" /> CSV exportieren
          </Button>
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Zeitraum</label>
                <Select value={rangePreset} onValueChange={setRangePreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    <SelectItem value="custom">Frei wählbar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {rangePreset === "custom" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Von</label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Bis</label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Gruppierung</label>
                <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DIMENSION_LABEL) as Dimension[]).map((k) => (
                      <SelectItem key={k} value={k}>{DIMENSION_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Metrik</label>
                <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(METRIC_META) as Metric[]).map((k) => (
                      <SelectItem key={k} value={k}>{METRIC_META[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Sessions</SelectItem>
                    <SelectItem value="paid">Nur bezahlt</SelectItem>
                    <SelectItem value="open">Nur offen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile icon={<PlugZap className="h-4 w-4" />} label="Sessions" value={fmtNum(kpi.count)} />
          <KpiTile icon={<Zap className="h-4 w-4" />} label="Energie" value={fmtKwh(kpi.energy)} />
          <KpiTile icon={<Euro className="h-4 w-4" />} label="Umsatz brutto" value={fmtEur(kpi.revenueGross)} />
          <KpiTile icon={<Clock className="h-4 w-4" />} label="Ø Ladedauer" value={kpi.count > 0 ? `${fmtNum(kpi.durationH / kpi.count, 1)} h` : "—"} />
          <KpiTile icon={<Zap className="h-4 w-4" />} label="Ø kWh/Session" value={fmtNum(kpi.avgKwh, 1)} />
          <KpiTile icon={<Euro className="h-4 w-4" />} label="Ø €/kWh" value={kpi.avgPrice > 0 ? `${fmtNum(kpi.avgPrice, 3)} €` : "—"} />
        </div>

        {/* Widgets */}
        <Tabs defaultValue="ranking" className="w-full">
          <TabsList>
            <TabsTrigger value="ranking">Ranking</TabsTrigger>
            <TabsTrigger value="trend">Zeitverlauf</TabsTrigger>
            <TabsTrigger value="table">Tabelle</TabsTrigger>
          </TabsList>

          <TabsContent value="ranking" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {METRIC_META[metric].label} nach {DIMENSION_LABEL[dimension]} (Top 20)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">Lade Daten…</div>
                ) : chartData.length === 0 ? (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">Keine Daten im Zeitraum</div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} />
                        <Tooltip formatter={(v: number) => METRIC_META[metric].fmt(Number(v))} />
                        <Bar dataKey="value" fill={PRIMARY_HSL} radius={[4, 4, 0, 0]} name={METRIC_META[metric].label} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trend" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Tagesverlauf
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">Lade Daten…</div>
                ) : timeSeries.length === 0 ? (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">Keine Daten im Zeitraum</div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeSeries} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} />
                        <Tooltip formatter={(v: number, name: string) => {
                          if (name === "Umsatz") return fmtEur(Number(v));
                          if (name === "kWh") return fmtKwh(Number(v));
                          return fmtNum(Number(v));
                        }} />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="kwh" stroke={PRIMARY_HSL} name="kWh" dot={false} strokeWidth={2} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke={MUTED_HSL} name="Umsatz" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="table" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" /> Detailauswertung nach {DIMENSION_LABEL[dimension]}
                  <Badge variant="secondary" className="ml-2">{grouped.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{DIMENSION_LABEL[dimension]}</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Energie (kWh)</TableHead>
                        <TableHead className="text-right">Umsatz brutto</TableHead>
                        <TableHead className="text-right">Ø kWh/Session</TableHead>
                        <TableHead className="text-right">Ø €/kWh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            {loading ? "Lade Daten…" : "Keine Daten im Zeitraum"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        grouped.map((r) => (
                          <TableRow key={r.key}>
                            <TableCell className="font-medium">{r.label}</TableCell>
                            <TableCell className="text-right">{fmtNum(r.sessions)}</TableCell>
                            <TableCell className="text-right">{fmtNum(r.kwh, 1)}</TableCell>
                            <TableCell className="text-right">{fmtEur(r.revenue)}</TableCell>
                            <TableCell className="text-right">{r.sessions > 0 ? fmtNum(r.kwh / r.sessions, 1) : "—"}</TableCell>
                            <TableCell className="text-right">{r.kwh > 0 ? fmtNum(r.revenue / r.kwh, 3) : "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

const KpiTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-lg font-semibold mt-1 truncate" title={value}>{value}</div>
    </CardContent>
  </Card>
);

export default ChargingReporting;
