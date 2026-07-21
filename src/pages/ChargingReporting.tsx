import { useEffect, useMemo, useState } from "react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Download, BarChart3, Users as UsersIcon, Zap, Euro, Clock, PlugZap,
  GripVertical, Star, Save, Trash2, FileSpreadsheet, Flame, LineChart as LineChartIcon, Table as TableIcon,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as XLSX from "@e965/xlsx";

// ── Types ────────────────────────────────────────────────────────────────────
type Dimension =
  | "charge_point" | "charge_point_group"
  | "user" | "user_group" | "billing_group"
  | "day" | "week" | "month";

type Metric = "energy_kwh" | "revenue_gross" | "revenue_net" | "sessions" | "duration_h" | "idle_fee";

type WidgetId = "ranking" | "trend" | "heatmap" | "table";

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

interface ReportPreset {
  key: string;
  label: string;
  builtIn?: boolean;
  rangePreset: string;
  customFrom?: string;
  customTo?: string;
  dimension: Dimension;
  metric: Metric;
  statusFilter: "all" | "paid" | "open";
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

// ── Page ─────────────────────────────────────────────────────────────────────
const DATE_PRESETS: { key: string; label: string; days: number }[] = [
  { key: "7d", label: "Letzte 7 Tage", days: 7 },
  { key: "30d", label: "Letzte 30 Tage", days: 30 },
  { key: "90d", label: "Letzte 90 Tage", days: 90 },
  { key: "365d", label: "Letzte 12 Monate", days: 365 },
];

const METRIC_META: Record<Metric, { label: string; fmt: (n: number) => string; short: string }> = {
  energy_kwh:   { label: "Energie",      fmt: fmtKwh,                     short: "kWh" },
  revenue_gross:{ label: "Umsatz brutto", fmt: fmtEur,                    short: "€ brutto" },
  revenue_net:  { label: "Umsatz netto",  fmt: fmtEur,                    short: "€ netto" },
  sessions:     { label: "Sessions",     fmt: (n) => fmtNum(n),           short: "#" },
  duration_h:   { label: "Ladedauer",    fmt: (n) => `${fmtNum(n, 1)} h`, short: "h" },
  idle_fee:     { label: "Standzeit-Gebühr", fmt: fmtEur,                 short: "€" },
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

// 8 vorgefertigte Report-Presets
const BUILTIN_PRESETS: ReportPreset[] = [
  { key: "b1", label: "Umsatz nach Ladepunkt (30 T.)",       builtIn: true, rangePreset: "30d",  dimension: "charge_point",       metric: "revenue_gross", statusFilter: "all" },
  { key: "b2", label: "Energie nach Nutzer (30 T.)",         builtIn: true, rangePreset: "30d",  dimension: "user",               metric: "energy_kwh",    statusFilter: "all" },
  { key: "b3", label: "Sessions je Tag (7 T.)",              builtIn: true, rangePreset: "7d",   dimension: "day",                metric: "sessions",      statusFilter: "all" },
  { key: "b4", label: "Umsatz nach Rechnungsgruppe (90 T.)", builtIn: true, rangePreset: "90d",  dimension: "billing_group",      metric: "revenue_gross", statusFilter: "paid" },
  { key: "b5", label: "Energie nach Ladepunktgruppe (90 T.)",builtIn: true, rangePreset: "90d",  dimension: "charge_point_group", metric: "energy_kwh",    statusFilter: "all" },
  { key: "b6", label: "Standzeit-Gebühr nach Nutzer (90 T.)",builtIn: true, rangePreset: "90d",  dimension: "user",               metric: "idle_fee",      statusFilter: "paid" },
  { key: "b7", label: "Energie je Woche (90 T.)",            builtIn: true, rangePreset: "90d",  dimension: "week",               metric: "energy_kwh",    statusFilter: "all" },
  { key: "b8", label: "Umsatz je Monat (12 M.)",             builtIn: true, rangePreset: "365d", dimension: "month",              metric: "revenue_gross", statusFilter: "all" },
];

const WIDGET_META: Record<WidgetId, { label: string; icon: React.ReactNode }> = {
  ranking: { label: "Ranking", icon: <BarChart3 className="h-4 w-4" /> },
  trend:   { label: "Zeitverlauf", icon: <LineChartIcon className="h-4 w-4" /> },
  heatmap: { label: "Heatmap (Wochentag × Stunde)", icon: <Flame className="h-4 w-4" /> },
  table:   { label: "Detailtabelle", icon: <TableIcon className="h-4 w-4" /> },
};
const DEFAULT_LAYOUT: WidgetId[] = ["ranking", "trend", "heatmap", "table"];
const LAYOUT_STORAGE_KEY = "charging-reporting.layout.v1";
const PRESETS_STORAGE_KEY = "charging-reporting.presets.v1";

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

  // Layout state (persisted)
  const [layout, setLayout] = useState<WidgetId[]>(() => {
    if (typeof window === "undefined") return DEFAULT_LAYOUT;
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return DEFAULT_LAYOUT;
      const parsed = JSON.parse(raw) as WidgetId[];
      const valid = parsed.filter((w) => w in WIDGET_META);
      // add missing widgets at the end so future additions are visible
      const missing = DEFAULT_LAYOUT.filter((w) => !valid.includes(w));
      return [...valid, ...missing];
    } catch { return DEFAULT_LAYOUT; }
  });
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
  }, [layout]);

  // User-defined presets (persisted)
  const [userPresets, setUserPresets] = useState<ReportPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ReportPreset[]) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(userPresets)); } catch { /* ignore */ }
  }, [userPresets]);

  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  function applyPreset(p: ReportPreset) {
    setRangePreset(p.rangePreset);
    if (p.customFrom) setCustomFrom(p.customFrom);
    if (p.customTo) setCustomTo(p.customTo);
    setDimension(p.dimension);
    setMetric(p.metric);
    setStatusFilter(p.statusFilter);
    toast.success(`Preset „${p.label}" angewendet`);
  }
  function saveCurrentAsPreset() {
    const label = newPresetName.trim();
    if (!label) { toast.error("Bitte einen Namen vergeben"); return; }
    const p: ReportPreset = {
      key: `u-${Date.now()}`,
      label,
      rangePreset,
      customFrom: rangePreset === "custom" ? customFrom : undefined,
      customTo: rangePreset === "custom" ? customTo : undefined,
      dimension, metric, statusFilter,
    };
    setUserPresets((prev) => [...prev, p]);
    setNewPresetName("");
    setPresetDialogOpen(false);
    toast.success(`Preset „${label}" gespeichert`);
  }
  function deletePreset(key: string) {
    setUserPresets((prev) => prev.filter((p) => p.key !== key));
    toast.success("Preset gelöscht");
  }

  const { fromISO, toISO } = useMemo(() => {
    if (rangePreset === "custom") {
      return { fromISO: isoStartOfDay(new Date(customFrom)), toISO: isoEndOfDay(new Date(customTo)) };
    }
    const preset = DATE_PRESETS.find((p) => p.key === rangePreset) ?? DATE_PRESETS[1];
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
        .from("charge_points").select("id, name, group_id").eq("tenant_id", tenantId!);
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

  const invoiceBySession = useMemo(() => {
    const m = new Map<string, InvoiceRow>();
    for (const inv of invoicesQ.data ?? []) if (inv.session_id) m.set(inv.session_id, inv);
    return m;
  }, [invoicesQ.data]);

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
    let energy = 0, durationH = 0, count = 0, invoicedKwh = 0;
    for (const s of sessions) {
      const kwh = Number(s.energy_kwh ?? 0);
      energy += kwh;
      if (s.start_time && s.stop_time) {
        durationH += (new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000;
      }
      count += 1;
      if (invoiceBySession.has(s.id)) invoicedKwh += kwh;
    }
    let revenueGross = 0, revenueNet = 0, idleFee = 0;
    for (const inv of invoicesQ.data ?? []) {
      revenueGross += Number(inv.total_amount ?? 0);
      revenueNet += Number(inv.net_amount ?? 0);
      idleFee += Number(inv.idle_fee_amount ?? 0);
    }
    const avgKwh = count > 0 ? energy / count : 0;
    const avgPrice = invoicedKwh > 0 ? revenueGross / invoicedKwh : 0;
    return { energy, durationH, count, revenueGross, revenueNet, idleFee, avgKwh, avgPrice, invoicedKwh };
  }, [sessions, invoicesQ.data, invoiceBySession]);

  // ── Grouping ───────────────────────────────────────────────────────────────
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
        return { key: toISODate(d), label: d.toLocaleDateString("de-DE") };
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
          ? (new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000 : 0;
      case "idle_fee": return Number(inv?.idle_fee_amount ?? 0);
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, { label: string; value: number; sessions: number; kwh: number; invoicedKwh: number; revenue: number }>();
    for (const s of sessions) {
      const { key, label } = groupKey(s);
      const inv = invoiceBySession.get(s.id);
      const cur = m.get(key) ?? { label, value: 0, sessions: 0, kwh: 0, invoicedKwh: 0, revenue: 0 };
      cur.value += metricValue(s);
      cur.sessions += 1;
      const kwh = Number(s.energy_kwh ?? 0);
      cur.kwh += kwh;
      if (inv) { cur.invoicedKwh += kwh; cur.revenue += Number(inv.total_amount ?? 0); }
      m.set(key, cur);
    }
    const rows = Array.from(m.entries()).map(([key, v]) => ({ key, ...v }));
    if (dimension === "day" || dimension === "week" || dimension === "month") {
      rows.sort((a, b) => a.key.localeCompare(b.key));
    } else {
      rows.sort((a, b) => b.value - a.value);
    }
    return rows;
  }, [sessions, dimension, metric, invoiceBySession]);

  const chartData = useMemo(() => grouped.slice(0, 20).map((r) => ({ name: r.label, value: r.value })), [grouped]);

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

  // ── Heatmap: Wochentag (Mo-So) × Stunde (0-23) ─────────────────────────────
  const heatmap = useMemo(() => {
    // grid[weekday 0=Mo..6=So][hour 0..23]
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const s of sessions) {
      const d = new Date(s.start_time);
      const jsDay = d.getDay(); // 0=So..6=Sa
      const wd = (jsDay + 6) % 7; // 0=Mo..6=So
      const hr = d.getHours();
      const v = metricValue(s);
      grid[wd][hr] += v;
      if (grid[wd][hr] > max) max = grid[wd][hr];
    }
    return { grid, max };
  }, [sessions, metric, invoiceBySession]);

  // ── Exports ────────────────────────────────────────────────────────────────
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

  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [DIMENSION_LABEL[dimension], METRIC_META[metric].label, "Sessions", "kWh", "Umsatz (€)"],
      ...grouped.map((r) => [r.label, r.value, r.sessions, r.kwh, r.revenue]),
    ];
    downloadCsv(`ladeinfrastruktur-report_${dimension}_${metric}_${stamp()}.csv`, rows);
  };

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();

    // Übersicht (KPI)
    const overview = [
      ["AICONO EMS · Ladeinfrastruktur-Reporting"],
      ["Zeitraum", `${fromISO.slice(0, 10)} bis ${toISO.slice(0, 10)}`],
      ["Gruppierung", DIMENSION_LABEL[dimension]],
      ["Metrik", METRIC_META[metric].label],
      ["Status-Filter", statusFilter],
      [],
      ["KPI", "Wert"],
      ["Sessions", kpi.count],
      ["Energie (kWh)", Number(kpi.energy.toFixed(2))],
      ["Umsatz brutto (€)", Number(kpi.revenueGross.toFixed(2))],
      ["Umsatz netto (€)", Number(kpi.revenueNet.toFixed(2))],
      ["Standzeit-Gebühren (€)", Number(kpi.idleFee.toFixed(2))],
      ["Ø kWh/Session", Number(kpi.avgKwh.toFixed(2))],
      ["Ø €/kWh (abgerechnet)", Number(kpi.avgPrice.toFixed(4))],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), "Übersicht");

    // Detail
    const detail = [
      [DIMENSION_LABEL[dimension], "Sessions", "Energie (kWh)", "Umsatz brutto (€)", "Ø kWh/Session", "Ø €/kWh"],
      ...grouped.map((r) => [
        r.label, r.sessions, Number(r.kwh.toFixed(2)), Number(r.revenue.toFixed(2)),
        r.sessions > 0 ? Number((r.kwh / r.sessions).toFixed(2)) : "",
        r.invoicedKwh > 0 ? Number((r.revenue / r.invoicedKwh).toFixed(4)) : "",
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), "Detail");

    // Zeitverlauf
    const trend = [
      ["Datum", "Sessions", "Energie (kWh)", "Umsatz (€)"],
      ...timeSeries.map((r) => [r.date, r.sessions, Number(r.kwh.toFixed(2)), Number(r.revenue.toFixed(2))]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trend), "Zeitverlauf");

    // Heatmap
    const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const header = ["Wochentag", ...Array.from({ length: 24 }, (_, h) => `${h}:00`)];
    const heat = [header, ...heatmap.grid.map((row, i) => [weekdays[i], ...row.map((v) => Number(v.toFixed(2)))])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(heat), "Heatmap");

    XLSX.writeFile(wb, `ladeinfrastruktur-report_${dimension}_${metric}_${stamp()}.xlsx`);
    toast.success("XLSX-Datei erstellt");
  };

  // ── Widgets ────────────────────────────────────────────────────────────────
  const widgetRenderers: Record<WidgetId, () => React.ReactNode> = {
    ranking: () => (
      loading ? <EmptyBox text="Lade Daten…" /> :
      chartData.length === 0 ? <EmptyBox text="Keine Daten im Zeitraum" /> :
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
    ),
    trend: () => (
      loading ? <EmptyBox text="Lade Daten…" /> :
      timeSeries.length === 0 ? <EmptyBox text="Keine Daten im Zeitraum" /> :
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
    ),
    heatmap: () => (
      loading ? <EmptyBox text="Lade Daten…" /> :
      heatmap.max === 0 ? <EmptyBox text="Keine Daten im Zeitraum" /> :
      <Heatmap grid={heatmap.grid} max={heatmap.max} fmt={METRIC_META[metric].fmt} />
    ),
    table: () => (
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
                  <TableCell className="text-right" title={`Ø-Preis über ${fmtNum(r.invoicedKwh, 1)} kWh mit Rechnung`}>
                    {r.invoicedKwh > 0 ? fmtNum(r.revenue / r.invoicedKwh, 3) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    ),
  };

  const widgetTitle = (id: WidgetId): string => {
    if (id === "ranking") return `${METRIC_META[metric].label} nach ${DIMENSION_LABEL[dimension]} (Top 20)`;
    if (id === "trend")   return "Tagesverlauf";
    if (id === "heatmap") return `Heatmap · ${METRIC_META[metric].label} pro Wochentag & Stunde`;
    if (id === "table")   return `Detailauswertung nach ${DIMENSION_LABEL[dimension]} (${grouped.length})`;
    return WIDGET_META[id as WidgetId].label;
  };

  // ── DnD ────────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const oldIndex = prev.indexOf(active.id as WidgetId);
      const newIndex = prev.indexOf(over.id as WidgetId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

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

          <div className="flex flex-wrap items-center gap-2">
            {/* Presets */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Star className="h-4 w-4 mr-2" /> Presets
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Vorgefertigte Berichte</DropdownMenuLabel>
                {BUILTIN_PRESETS.map((p) => (
                  <DropdownMenuItem key={p.key} onClick={() => applyPreset(p)}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
                {userPresets.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Eigene Presets</DropdownMenuLabel>
                    {userPresets.map((p) => (
                      <DropdownMenuItem key={p.key} onClick={() => applyPreset(p)} className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.label}</span>
                        <Trash2
                          className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => { e.stopPropagation(); deletePreset(p.key); }}
                        />
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Save className="h-4 w-4 mr-2" /> Speichern
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Preset speichern</DialogTitle>
                  <DialogDescription>
                    Speichert die aktuellen Filter (Zeitraum, Gruppierung, Metrik, Status) als benanntes Preset.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus placeholder="z. B. Monatsbericht Rechnungsgruppen" value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCurrentAsPreset(); }}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPresetDialogOpen(false)}>Abbrechen</Button>
                  <Button onClick={saveCurrentAsPreset}>Speichern</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || grouped.length === 0}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx} disabled={loading || grouped.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> XLSX
            </Button>
          </div>
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
                    {DATE_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
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

        {/* Reorderable widgets */}
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <GripVertical className="h-3.5 w-3.5" /> Widgets per Drag &amp; Drop neu anordnen — Layout wird pro Nutzer gespeichert.
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layout} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {layout.map((id) => (
                <SortableWidget key={id} id={id} title={widgetTitle(id)}>
                  {widgetRenderers[id]()}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </AppLayout>
  );
};

// ── Presentation components ────────────────────────────────────────────────
const KpiTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-lg font-semibold mt-1 truncate" title={value}>{value}</div>
    </CardContent>
  </Card>
);

const EmptyBox = ({ text }: { text: string }) => (
  <div className="h-72 flex items-center justify-center text-muted-foreground">{text}</div>
);

function SortableWidget({ id, title, children }: { id: WidgetId; title: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1 rounded"
            aria-label="Widget verschieben"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <CardTitle className="text-base flex items-center gap-2">
            {WIDGET_META[id].icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function Heatmap({ grid, max, fmt }: { grid: number[][]; max: number; fmt: (n: number) => string }) {
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid" style={{ gridTemplateColumns: `40px repeat(24, minmax(22px, 1fr))` }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-[10px] text-muted-foreground text-center py-1">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {grid.map((row, wd) => (
            <>
              <div key={`wd-${wd}`} className="text-[11px] text-muted-foreground pr-2 flex items-center justify-end">
                {weekdays[wd]}
              </div>
              {row.map((v, h) => {
                const intensity = max > 0 ? v / max : 0;
                const bg = v === 0
                  ? "hsl(var(--muted) / 0.4)"
                  : `hsl(var(--primary) / ${(0.15 + intensity * 0.75).toFixed(2)})`;
                return (
                  <div
                    key={`c-${wd}-${h}`}
                    className="h-6 m-[1px] rounded-sm border border-border/40"
                    style={{ backgroundColor: bg }}
                    title={`${weekdays[wd]} ${h}:00 · ${fmt(v)}`}
                  />
                );
              })}
            </>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
          <span>weniger</span>
          <div className="flex gap-0.5">
            {[0.15, 0.35, 0.55, 0.75, 0.9].map((a) => (
              <div key={a} className="w-4 h-3 rounded-sm border border-border/40" style={{ backgroundColor: `hsl(var(--primary) / ${a})` }} />
            ))}
          </div>
          <span>mehr</span>
          <span className="ml-3">Max: {fmt(max)}</span>
        </div>
      </div>
    </div>
  );
}

export default ChargingReporting;
