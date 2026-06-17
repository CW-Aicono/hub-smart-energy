import { useState, useMemo, useEffect } from "react";
import {
  startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear,
  endOfDay, endOfWeek, endOfMonth, endOfQuarter, endOfYear,
  addDays, addWeeks, addMonths, addQuarters, addYears,
  subMonths,
} from "date-fns";
import { de } from "date-fns/locale";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useChargingSessions, useIdTagResolver } from "@/hooks/useChargingSessions";
import { useChargingTariffs, ChargingTariff } from "@/hooks/useChargingTariffs";
import { useChargingInvoices } from "@/hooks/useChargingInvoices";
import { useChargePoints } from "@/hooks/useChargePoints";
import { useTenant } from "@/hooks/useTenant";
import { useChargingInvoiceSettings } from "@/hooks/useChargingInvoiceSettings";
import { useChargingUsers } from "@/hooks/useChargingUsers";
import { useChargingBillingGroups, useGenerateGroupInvoices } from "@/hooks/useChargingBillingGroups";
import { useQuery } from "@tanstack/react-query";

import BillingGroupsTab from "@/components/charging/BillingGroupsTab";

import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Receipt, Euro, Zap, Clock, Trash2, Edit, Users, Globe, Calendar, TrendingUp, Percent, FileText, Send, Settings, Download, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { EichrechtTab } from "@/components/charging/EichrechtTab";
import { CreatedInvoicesDialog, SendInvoicesDialog } from "@/components/charging/ChargingInvoiceBulkDialogs";
import { Mail } from "lucide-react";
import { format } from "date-fns";
import { fmtNum, fmtCurrency, fmtKwh } from "@/lib/formatCharging";
import { generateChargingInvoicePdf, downloadBlob } from "@/lib/generateChargingInvoicePdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Sortable table header (generic)
function SortableHead({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  onDir,
  className,
}: {
  column: string;
  label: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (c: any) => void;
  onDir: (d: "asc" | "desc") => void;
  className?: string;
}) {
  const active = sortColumn === column;
  return (
    <TableHead
      className={"cursor-pointer select-none " + (className || "")}
      onClick={() => {
        if (active) {
          onDir(sortDirection === "asc" ? "desc" : "asc");
        } else {
          onSort(column);
          onDir("asc");
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </span>
    </TableHead>
  );
}



const ChargingBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { sessions, isLoading: sessionsLoading } = useChargingSessions();
  const [ocmfSessionId, setOcmfSessionId] = useState<string | null>(null);
  const resolveTag = useIdTagResolver();
  const { tariffs, isLoading: tariffsLoading, addTariff, updateTariff, deleteTariff } = useChargingTariffs();
  const { invoices, generateInvoices, sendInvoices, sendSelectedInvoices, finalizeInvoice, finalizeInvoices, markAsPaid } = useChargingInvoices();
  const [createdDialogOpen, setCreatedDialogOpen] = useState(false);
  const [createdInvoiceIds, setCreatedInvoiceIds] = useState<string[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [resendConfirm, setResendConfirm] = useState<any | null>(null);
  const [draftSendConfirm, setDraftSendConfirm] = useState<any | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const { chargePoints } = useChargePoints();
  const { settings: invoiceSettings } = useChargingInvoiceSettings();
  

  const [tariffOpen, setTariffOpen] = useState(false);
  const [editTariff, setEditTariff] = useState<ChargingTariff | null>(null);
  const [tariffForm, setTariffForm] = useState({ name: "", price_per_kwh: "0.35", base_fee: "0", idle_fee_per_minute: "0", idle_fee_grace_minutes: "60", tax_rate_percent: "19", currency: "EUR" });
  const [defaultConfirm, setDefaultConfirm] = useState<{ tariffId: string; currentDefaultName: string } | null>(null);

  const applySetDefault = (tariffId: string) => {
    updateTariff.mutate({ id: tariffId, is_default: true });
  };

  const handleToggleDefault = (tariff: ChargingTariff, checked: boolean) => {
    if (!checked) {
      updateTariff.mutate({ id: tariff.id, is_default: false });
      return;
    }
    const currentDefault = tariffs.find((t) => t.is_default && t.id !== tariff.id);
    if (currentDefault) {
      setDefaultConfirm({ tariffId: tariff.id, currentDefaultName: currentDefault.name });
    } else {
      applySetDefault(tariff.id);
    }
  };
  const [period, setPeriod] = useState<"all" | "day" | "week" | "month" | "quarter" | "year">("month");
  const [periodAnchor, setPeriodAnchor] = useState<Date>(new Date());
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [sessionPage, setSessionPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);

  // Invoice generation dialog
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(() => {
    const last = subMonths(new Date(), 1);
    return format(last, "yyyy-MM");
  });

  const genPeriod = useMemo(() => {
    const [y, m] = genMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = endOfMonth(start);
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd"), label: format(start, "MMMM yyyy") };
  }, [genMonth]);

  const weekStartsOn = (tenant?.week_start_day ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const periodRange = useMemo(() => {
    const a = periodAnchor;
    switch (period) {
      case "all": return null;
      case "day": return { start: startOfDay(a), end: endOfDay(a) };
      case "week": return { start: startOfWeek(a, { weekStartsOn }), end: endOfWeek(a, { weekStartsOn }) };
      case "month": return { start: startOfMonth(a), end: endOfMonth(a) };
      case "quarter": return { start: startOfQuarter(a), end: endOfQuarter(a) };
      case "year": return { start: startOfYear(a), end: endOfYear(a) };
    }
  }, [period, periodAnchor, weekStartsOn]);

  const periodLabel = useMemo(() => {
    if (!periodRange) return "Alle Zeiträume";
    const a = periodAnchor;
    switch (period) {
      case "day": return format(a, "EEEE, dd.MM.yyyy", { locale: de });
      case "week": return `KW ${format(periodRange.start, "II yyyy", { locale: de })} (${format(periodRange.start, "dd.MM.", { locale: de })}–${format(periodRange.end, "dd.MM.yyyy", { locale: de })})`;
      case "month": return format(a, "MMMM yyyy", { locale: de });
      case "quarter": return `Q${Math.floor(a.getMonth() / 3) + 1} ${a.getFullYear()}`;
      case "year": return String(a.getFullYear());
      default: return "";
    }
  }, [period, periodAnchor, periodRange]);

  const shiftPeriod = (dir: -1 | 1) => {
    setPeriodAnchor((a) => {
      switch (period) {
        case "day": return addDays(a, dir);
        case "week": return addWeeks(a, dir);
        case "month": return addMonths(a, dir);
        case "quarter": return addQuarters(a, dir);
        case "year": return addYears(a, dir);
        default: return a;
      }
    });
  };

  // Reset anchor to "now" whenever the period type changes
  useEffect(() => { setPeriodAnchor(new Date()); }, [period]);


  // Search state
  const [sessionSearch, setSessionSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Session sorting state
  const [sortColumn, setSortColumn] = useState<"charge_point" | "start_time" | "stop_time" | "energy" | "status" | "id_tag" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Invoice sorting state
  const [invSortColumn, setInvSortColumn] = useState<"invoice_number" | "invoice_date" | "user_name" | "period" | "total_amount" | "status" | null>("invoice_date");
  const [invSortDirection, setInvSortDirection] = useState<"asc" | "desc">("desc");

  // Sessions view mode: by individual users (rows = sessions) vs by billing groups (aggregated)
  const [sessionView, setSessionView] = useState<"users" | "groups">("users");

  // Group aggregation sort
  const [groupSortColumn, setGroupSortColumn] = useState<"group_name" | "user_count" | "session_count" | "energy" | null>("energy");
  const [groupSortDirection, setGroupSortDirection] = useState<"asc" | "desc">("desc");

  // Charging users (to resolve session id_tag -> user_id)
  const { users: chargingUsers } = useChargingUsers();
  const { groups: billingGroups } = useChargingBillingGroups();
  const generateGroupInvoices = useGenerateGroupInvoices();

  // Billing group membership map: user_id -> { group_id, group_name }
  const { data: billingMemberships = [] } = useQuery({
    queryKey: ["charging-billing-group-members-all", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_billing_group_members" as any)
        .select("user_id, group_id")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<{ user_id: string; group_id: string }>;
    },
  });

  const getCpName = (id: string) => chargePoints.find((cp) => cp.id === id)?.name || "—";


  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    return sessions.filter(s => {
      if (periodRange) {
        const d = new Date(s.start_time);
        if (d < periodRange.start || d > periodRange.end) return false;
      }
      if (!q) return true;
      const cp = getCpName(s.charge_point_id).toLowerCase();
      const tag = (resolveTag(s.id_tag) || s.id_tag || "").toLowerCase();
      const status = (s.status || "").toLowerCase();
      const start = format(new Date(s.start_time), "dd.MM.yyyy HH:mm");
      return cp.includes(q) || tag.includes(q) || status.includes(q) || start.includes(q);
    });
  }, [sessions, periodRange, sessionSearch, chargePoints, resolveTag]);


  const displayedSessions = useMemo(() => {
    if (!sortColumn) return filteredSessions;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filteredSessions].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "charge_point":
          cmp = getCpName(a.charge_point_id).localeCompare(getCpName(b.charge_point_id));
          break;
        case "start_time":
          cmp = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
          break;
        case "stop_time": {
          const aStop = a.stop_time ? new Date(a.stop_time).getTime() : 0;
          const bStop = b.stop_time ? new Date(b.stop_time).getTime() : 0;
          cmp = aStop - bStop;
          break;
        }
        case "energy":
          cmp = a.energy_kwh - b.energy_kwh;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "id_tag": {
          const aTag = resolveTag(a.id_tag) || a.id_tag || "";
          const bTag = resolveTag(b.id_tag) || b.id_tag || "";
          cmp = aTag.localeCompare(bTag);
          break;
        }
      }
      return cmp * dir;
    });
  }, [filteredSessions, sortColumn, sortDirection, chargePoints, resolveTag]);

  // ---- Aggregation by billing group ----
  // Map RFID tag (uppercase, no spaces) -> charging user id
  const tagToUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of chargingUsers) {
      const all = [
        ...(u.tags ?? []).map((t) => t.tag),
        u.rfid_tag,
      ].filter(Boolean) as string[];
      for (const raw of all) {
        const k = raw.replace(/\s+/g, "").toUpperCase();
        if (k) map.set(k, u.id);
      }
    }
    return map;
  }, [chargingUsers]);

  const userIdToBillingGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of billingMemberships) map.set(m.user_id, m.group_id);
    return map;
  }, [billingMemberships]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of billingGroups) map.set(g.id, g.name);
    return map;
  }, [billingGroups]);




  const NO_GROUP_KEY = "__no_group__";

  const groupedSessionRows = useMemo(() => {
    type Row = { key: string; group_name: string; user_ids: Set<string>; session_count: number; energy_kwh: number };
    const rows = new Map<string, Row>();
    for (const s of filteredSessions) {
      const tagKey = (s.id_tag || "").replace(/\s+/g, "").toUpperCase();
      const userId = tagToUserId.get(tagKey);
      const groupId = userId ? userIdToBillingGroup.get(userId) : undefined;
      const key = groupId ?? NO_GROUP_KEY;
      const name = groupId ? (groupNameById.get(groupId) ?? "—") : "Ohne Abrechnungsgruppe";
      let row = rows.get(key);
      if (!row) {
        row = { key, group_name: name, user_ids: new Set(), session_count: 0, energy_kwh: 0 };
        rows.set(key, row);
      }
      row.session_count += 1;
      row.energy_kwh += s.energy_kwh || 0;
      if (userId) row.user_ids.add(userId);
      else if (s.id_tag) row.user_ids.add(`tag:${s.id_tag}`);
    }
    // Search filter
    const q = sessionSearch.trim().toLowerCase();
    const list = Array.from(rows.values())
      .map((r) => ({ ...r, user_count: r.user_ids.size }))
      .filter((r) => !q || r.group_name.toLowerCase().includes(q));

    // Sort
    const dir = groupSortDirection === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (groupSortColumn) {
        case "group_name": cmp = a.group_name.localeCompare(b.group_name); break;
        case "user_count": cmp = a.user_count - b.user_count; break;
        case "session_count": cmp = a.session_count - b.session_count; break;
        case "energy":
        default: cmp = a.energy_kwh - b.energy_kwh; break;
      }
      return cmp * dir;
    });
    return list;
  }, [filteredSessions, tagToUserId, userIdToBillingGroup, groupNameById, sessionSearch, groupSortColumn, groupSortDirection]);



  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter((inv: any) => {
      const ref = new Date(inv.invoice_date || inv.period_start || inv.created_at);
      if (periodRange && (ref < periodRange.start || ref > periodRange.end)) return false;
      if (!q) return true;
      const fields = [
        inv.invoice_number, inv.user_name, inv.user_email, inv.status,
        inv.period_start ? format(new Date(inv.period_start), "dd.MM.yyyy") : "",
        inv.period_end ? format(new Date(inv.period_end), "dd.MM.yyyy") : "",
        inv.invoice_date ? format(new Date(inv.invoice_date), "dd.MM.yyyy") : "",
        String(inv.total_amount ?? ""),
      ];
      return fields.some((f) => String(f || "").toLowerCase().includes(q));
    });
  }, [invoices, periodRange, invoiceSearch]);


  const displayedInvoices = useMemo(() => {
    if (!invSortColumn) return filteredInvoices;
    const dir = invSortDirection === "asc" ? 1 : -1;
    return [...filteredInvoices].sort((a: any, b: any) => {
      let cmp = 0;
      switch (invSortColumn) {
        case "invoice_number":
          cmp = String(a.invoice_number || "").localeCompare(String(b.invoice_number || ""));
          break;
        case "invoice_date": {
          const ad = new Date(a.invoice_date || a.created_at).getTime();
          const bd = new Date(b.invoice_date || b.created_at).getTime();
          cmp = ad - bd;
          break;
        }
        case "user_name":
          cmp = String(a.user_name || "").localeCompare(String(b.user_name || ""));
          break;
        case "period": {
          const ap = a.period_start ? new Date(a.period_start).getTime() : 0;
          const bp = b.period_start ? new Date(b.period_start).getTime() : 0;
          cmp = ap - bp;
          break;
        }
        case "total_amount":
          cmp = Number(a.total_amount || 0) - Number(b.total_amount || 0);
          break;
        case "status":
          cmp = String(a.status || "").localeCompare(String(b.status || ""));
          break;
      }
      return cmp * dir;
    });
  }, [filteredInvoices, invSortColumn, invSortDirection]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const completedSessions = filteredSessions.filter((s) => s.status === "completed");
  const totalEnergy = completedSessions.reduce((sum, s) => sum + s.energy_kwh, 0);
  const activeTariff = tariffs.find((t) => t.is_active);

  const resetTariffForm = () => setTariffForm({ name: "", price_per_kwh: "0.35", base_fee: "0", idle_fee_per_minute: "0", idle_fee_grace_minutes: "60", tax_rate_percent: "19", currency: "EUR" });

  const handleAddTariff = () => {
    if (!tenant?.id) return;
    addTariff.mutate({
      tenant_id: tenant.id,
      name: tariffForm.name,
      price_per_kwh: parseFloat(tariffForm.price_per_kwh),
      base_fee: parseFloat(tariffForm.base_fee),
      idle_fee_per_minute: parseFloat(tariffForm.idle_fee_per_minute),
      idle_fee_grace_minutes: parseInt(tariffForm.idle_fee_grace_minutes),
      tax_rate_percent: parseFloat(tariffForm.tax_rate_percent),
      currency: tariffForm.currency,
    } as any);
    setTariffOpen(false);
    resetTariffForm();
  };

  const handleEditTariff = () => {
    if (!editTariff) return;
    updateTariff.mutate({
      id: editTariff.id,
      name: tariffForm.name,
      price_per_kwh: parseFloat(tariffForm.price_per_kwh),
      base_fee: parseFloat(tariffForm.base_fee),
      idle_fee_per_minute: parseFloat(tariffForm.idle_fee_per_minute),
      idle_fee_grace_minutes: parseInt(tariffForm.idle_fee_grace_minutes),
      tax_rate_percent: parseFloat(tariffForm.tax_rate_percent),
    } as any);
    setEditTariff(null);
    resetTariffForm();
  };

  const openEditTariff = (t: ChargingTariff) => {
    setTariffForm({
      name: t.name,
      price_per_kwh: String(t.price_per_kwh),
      base_fee: String(t.base_fee),
      idle_fee_per_minute: String(t.idle_fee_per_minute || 0),
      idle_fee_grace_minutes: String(t.idle_fee_grace_minutes || 60),
      tax_rate_percent: String(t.tax_rate_percent ?? 19),
      currency: t.currency,
    });
    setEditTariff(t);
  };

  const handleGenerate = () => {
    if (!tenant?.id) return;
    generateInvoices.mutate({ tenant_id: tenant.id, period_start: genPeriod.start, period_end: genPeriod.end });
    // Sammelrechnungen für alle Rechnungsgruppen automatisch mit erzeugen
    generateGroupInvoices.mutate({ period_start: genPeriod.start, period_end: genPeriod.end, mode: "generate" });
    setGenerateOpen(false);
  };

  const handleSendAll = () => {
    if (!tenant?.id) return;
    sendInvoices.mutate({ tenant_id: tenant.id, period_start: genPeriod.start, period_end: genPeriod.end });
    // Sammelrechnungen pro Gruppe ebenfalls erzeugen + versenden
    generateGroupInvoices.mutate({ period_start: genPeriod.start, period_end: genPeriod.end, mode: "both" });
  };

  const periodKeys = [
    { key: "all" as const, label: "Alle" },
    { key: "day" as const, label: t("charging.periodDay" as any) },
    { key: "week" as const, label: t("charging.periodWeek" as any) },
    { key: "month" as const, label: t("charging.periodMonth" as any) },
    { key: "quarter" as const, label: t("charging.periodQuarter" as any) },
    { key: "year" as const, label: t("charging.periodYear" as any) },
  ];

  // Paginate helper
  const paginate = <T,>(arr: T[], page: number) => {
    const total = Math.max(1, Math.ceil(arr.length / pageSize));
    const p = Math.min(Math.max(1, page), total);
    return { items: arr.slice((p - 1) * pageSize, p * pageSize), total, page: p };
  };

  // Reset to page 1 when filters change
  useEffect(() => { setSessionPage(1); }, [period, periodAnchor, sessionSearch, sessionView, pageSize]);
  useEffect(() => { setInvoicePage(1); }, [period, periodAnchor, invoiceSearch, pageSize]);
  useEffect(() => { setGroupPage(1); }, [period, periodAnchor, sessionSearch, pageSize]);

  const PaginationBar = ({ page, total, onChange, count }: { page: number; total: number; onChange: (p: number) => void; count: number }) => {
    if (count === 0) return null;
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Einträge pro Seite:</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) as 25 | 50 | 100)}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span>· {fmtNum(count, 0)} Einträge gesamt</span>
        </div>
        {total > 1 && (
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page > 1) onChange(page - 1); }}
                  className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {Array.from({ length: total }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === total || Math.abs(p - page) <= 1)
                .flatMap((p, idx, arr) => {
                  const nodes: JSX.Element[] = [];
                  if (idx > 0 && arr[idx - 1] !== p - 1) {
                    nodes.push(<PaginationItem key={`e-${p}`}><PaginationEllipsis /></PaginationItem>);
                  }
                  nodes.push(
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => { e.preventDefault(); onChange(p); }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  );
                  return nodes;
                })}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page < total) onChange(page + 1); }}
                  className={page >= total ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    );
  };

  const sessionsPaged = paginate(displayedSessions, sessionPage);
  const invoicesPaged = paginate(displayedInvoices, invoicePage);
  const groupsPaged = paginate(groupedSessionRows, groupPage);


  const tariffFormFields = (
    <div className="space-y-4">
      <div><Label>{t("charging.name" as any)}</Label><Input value={tariffForm.name} onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>{t("charging.pricePerKwh" as any)} <span className="text-xs text-muted-foreground">(inkl. MwSt.)</span></Label><Input type="number" step="0.01" value={tariffForm.price_per_kwh} onChange={(e) => setTariffForm({ ...tariffForm, price_per_kwh: e.target.value })} /></div>
        <div><Label>{t("charging.baseFee" as any)} <span className="text-xs text-muted-foreground">(inkl. MwSt.)</span></Label><Input type="number" step="0.01" value={tariffForm.base_fee} onChange={(e) => setTariffForm({ ...tariffForm, base_fee: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>MwSt-Satz (%)</Label><Input type="number" step="0.1" min="0" max="100" value={tariffForm.tax_rate_percent} onChange={(e) => setTariffForm({ ...tariffForm, tax_rate_percent: e.target.value })} /></div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Alle Preisangaben verstehen sich inklusive der angegebenen Mehrwertsteuer.</p>
      <div className="border-t pt-4">
        <Label className="text-sm font-medium flex items-center gap-2 mb-3"><Clock className="h-4 w-4" />{t("charging.idleFee" as any)}</Label>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>{t("charging.idleFeePerMin" as any)} <span className="text-xs text-muted-foreground">(inkl. MwSt.)</span></Label><Input type="number" step="0.01" min="0" value={tariffForm.idle_fee_per_minute} onChange={(e) => setTariffForm({ ...tariffForm, idle_fee_per_minute: e.target.value })} /></div>
          <div><Label>{t("charging.idleFeeGrace" as any)}</Label><Input type="number" step="1" min="0" value={tariffForm.idle_fee_grace_minutes} onChange={(e) => setTariffForm({ ...tariffForm, idle_fee_grace_minutes: e.target.value })} /></div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t("charging.idleFeeDesc" as any)}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("charging.billing" as any)}</h1>
            <p className="text-muted-foreground">{t("charging.billingDesc" as any)}</p>
          </div>

          {/* Period Filter + Stats */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={period === "all" ? "Zeitraum nicht aktiv" : "Zeitraum wechseln"}
                    disabled={period === "all"}
                  >
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftPeriod(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[180px] text-center text-sm font-medium">{periodLabel}</div>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftPeriod(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPeriodAnchor(new Date())}>
                      Heute
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {periodKeys.map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={period === key ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-3"
                    onClick={() => setPeriod(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {period !== "all" && (
                <span className="text-xs text-muted-foreground ml-1">{periodLabel}</span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4 flex items-center gap-3"><Zap className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{fmtKwh(totalEnergy, 1)}</p><p className="text-sm text-muted-foreground">{t("charging.total" as any)}</p></div></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3"><Receipt className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{fmtNum(completedSessions.length, 0)}</p><p className="text-sm text-muted-foreground">{t("charging.sessions" as any)}</p></div></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{activeTariff ? fmtCurrency(totalEnergy * activeTariff.price_per_kwh + (completedSessions.length > 0 ? activeTariff.base_fee : 0)) : "—"}</p><p className="text-sm text-muted-foreground">{t("charging.totalRevenue" as any)}</p></div></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3"><Percent className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{chargePoints.length > 0 ? fmtNum((filteredSessions.filter(s => s.status === "active").length / chargePoints.length) * 100, 1) + " %" : "— %"}</p><p className="text-sm text-muted-foreground">{t("charging.avgUtilization" as any)}</p></div></CardContent></Card>
            </div>
          </div>

          <Tabs defaultValue="sessions">
            <TabsList>
              <TabsTrigger value="sessions">{t("charging.tabSessions" as any)}</TabsTrigger>
              <TabsTrigger value="tariffs">{t("charging.tabTariffs" as any)}</TabsTrigger>
              <TabsTrigger value="invoices">{t("charging.tabInvoices" as any)}</TabsTrigger>
              <TabsTrigger value="billing-groups">Rechnungsgruppen</TabsTrigger>
            </TabsList>


            {/* Sessions Tab */}
            <TabsContent value="sessions">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle>{t("charging.sessions" as any)}</CardTitle>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <Button
                      variant={sessionView === "users" ? "default" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-3"
                      onClick={() => setSessionView("users")}
                    >
                      Nach Nutzern
                    </Button>
                    <Button
                      variant={sessionView === "groups" ? "default" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-3"
                      onClick={() => setSessionView("groups")}
                    >
                      Nach Abrechnungsgruppen
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder={sessionView === "users" ? "Suchen (Ladepunkt, Tag, Status, Datum…)" : "Gruppe suchen…"}
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="max-w-md h-9"
                  />

                  {sessionsLoading ? (
                    <p className="text-muted-foreground">{t("charging.loading" as any)}</p>
                  ) : sessionView === "users" ? (
                    displayedSessions.length === 0 ? <p className="text-muted-foreground">{t("charging.noSessions" as any)}</p> : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <SortableHead column="charge_point" label={t("charging.chargePoint" as any)} sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSortColumn} onDir={setSortDirection} />
                              <SortableHead column="start_time" label={t("charging.start" as any)} sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSortColumn} onDir={setSortDirection} />
                              <SortableHead column="stop_time" label={t("charging.end" as any)} sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSortColumn} onDir={setSortDirection} />
                              <SortableHead column="energy" label={t("charging.energy" as any)} sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSortColumn} onDir={setSortDirection} />
                              <SortableHead column="status" label={t("common.status" as any)} sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSortColumn} onDir={setSortDirection} />
                              <SortableHead column="id_tag" label={t("charging.idTag" as any)} sortColumn={sortColumn} sortDirection={sortDirection} onSort={setSortColumn} onDir={setSortDirection} />
                              <TableHead className="w-20 text-right">Beleg</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessionsPaged.items.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="font-medium">{getCpName(s.charge_point_id)}</TableCell>
                                <TableCell>{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</TableCell>
                                <TableCell>{s.stop_time ? format(new Date(s.stop_time), "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                                <TableCell>{fmtKwh(s.energy_kwh)}</TableCell>
                                <TableCell><Badge variant={s.status === "active" ? "default" : s.status === "completed" ? "secondary" : "destructive"}>{s.status === "active" ? t("charging.statusActive" as any) : s.status === "completed" ? t("charging.statusCompleted" as any) : t("charging.statusError" as any)}</Badge></TableCell>
                                <TableCell className="text-sm">{resolveTag(s.id_tag) || s.id_tag || "—"}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Eichrechts-Beleg (OCMF) anzeigen"
                                    onClick={() => setOcmfSessionId(s.id)}
                                  >
                                    <ShieldCheck className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <PaginationBar page={sessionsPaged.page} total={sessionsPaged.total} onChange={setSessionPage} count={displayedSessions.length} />
                      </>
                    )
                  ) : (
                    groupedSessionRows.length === 0 ? <p className="text-muted-foreground">{t("charging.noSessions" as any)}</p> : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <SortableHead column="group_name" label="Abrechnungsgruppe" sortColumn={groupSortColumn} sortDirection={groupSortDirection} onSort={setGroupSortColumn} onDir={setGroupSortDirection} />
                              <SortableHead column="user_count" label="Nutzer" sortColumn={groupSortColumn} sortDirection={groupSortDirection} onSort={setGroupSortColumn} onDir={setGroupSortDirection} />
                              <SortableHead column="session_count" label="Ladevorgänge" sortColumn={groupSortColumn} sortDirection={groupSortDirection} onSort={setGroupSortColumn} onDir={setGroupSortDirection} />
                              <SortableHead column="energy" label="Energie" sortColumn={groupSortColumn} sortDirection={groupSortDirection} onSort={setGroupSortColumn} onDir={setGroupSortDirection} />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupsPaged.items.map((row) => (
                              <TableRow key={row.key}>
                                <TableCell className="font-medium">
                                  {row.group_name}
                                  {row.key === NO_GROUP_KEY && (
                                    <Badge variant="outline" className="ml-2 text-xs">keine Gruppe</Badge>
                                  )}
                                </TableCell>
                                <TableCell>{fmtNum(row.user_count, 0)}</TableCell>
                                <TableCell>{fmtNum(row.session_count, 0)}</TableCell>
                                <TableCell>{fmtKwh(row.energy_kwh, 1)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <PaginationBar page={groupsPaged.page} total={groupsPaged.total} onChange={setGroupPage} count={groupedSessionRows.length} />
                      </>
                    )
                  )}

                </CardContent>
              </Card>


              <Dialog open={!!ocmfSessionId} onOpenChange={(o) => !o && setOcmfSessionId(null)}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Eichrechts-Beleg (OCMF)</DialogTitle>
                  </DialogHeader>
                  {ocmfSessionId && <EichrechtTab sessionId={ocmfSessionId} />}
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* Tariffs Tab */}
            <TabsContent value="tariffs">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t("charging.tariffs" as any)}</CardTitle>
                  {isAdmin && (
                    <Dialog open={tariffOpen} onOpenChange={setTariffOpen}>
                      <DialogTrigger asChild><Button size="sm" onClick={resetTariffForm}><Plus className="h-4 w-4 mr-2" />{t("charging.addTariff" as any)}</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{t("charging.newTariff" as any)}</DialogTitle></DialogHeader>
                        {tariffFormFields}
                        <Button onClick={handleAddTariff} disabled={!tariffForm.name}>{t("common.create" as any)}</Button>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {tariffsLoading ? <p className="text-muted-foreground">{t("charging.loading" as any)}</p> : tariffs.length === 0 ? <p className="text-muted-foreground">{t("charging.noTariffs" as any)}</p> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                           <TableHead>{t("charging.name" as any)}</TableHead>
                          <TableHead>{t("charging.priceKwh" as any)} <span className="text-xs text-muted-foreground font-normal">(inkl. MwSt.)</span></TableHead>
                          <TableHead>{t("charging.baseFee" as any)} <span className="text-xs text-muted-foreground font-normal">(inkl. MwSt.)</span></TableHead>
                          <TableHead>{t("charging.idleFee" as any)} <span className="text-xs text-muted-foreground font-normal">(inkl. MwSt.)</span></TableHead>
                          <TableHead>MwSt</TableHead>
                          <TableHead>{t("charging.active" as any)}</TableHead>
                          <TableHead>Standard</TableHead>
                          {isAdmin && <TableHead className="w-24">{t("charging.actions" as any)}</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tariffs.map((tariff) => (
                          <TableRow key={tariff.id}>
                            <TableCell className="font-medium">
                              {tariff.name}
                              {tariff.is_default && <Badge variant="secondary" className="ml-2">Standard</Badge>}
                            </TableCell>
                            <TableCell>{fmtCurrency(tariff.price_per_kwh)}</TableCell>
                            <TableCell>{fmtCurrency(tariff.base_fee)}</TableCell>
                            <TableCell>{tariff.idle_fee_per_minute > 0 ? <span className="text-sm">{fmtCurrency(tariff.idle_fee_per_minute)}/Min. <span className="text-muted-foreground">ab {tariff.idle_fee_grace_minutes} Min.</span></span> : <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell>{fmtNum(tariff.tax_rate_percent ?? 19, 0)} %</TableCell>
                            <TableCell>
                              <Switch
                                checked={tariff.is_active}
                                onCheckedChange={(checked) => updateTariff.mutate({ id: tariff.id, is_active: checked })}
                                disabled={!isAdmin}
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={tariff.is_default}
                                onCheckedChange={(checked) => handleToggleDefault(tariff, checked)}
                                disabled={!isAdmin}
                              />
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditTariff(tariff)}><Edit className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => deleteTariff.mutate(tariff.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Dialog open={!!editTariff} onOpenChange={(open) => { if (!open) setEditTariff(null); }}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("charging.editTariff" as any)}</DialogTitle></DialogHeader>
                  {tariffFormFields}
                  <Button onClick={handleEditTariff} disabled={!tariffForm.name}>{t("common.save" as any)}</Button>
                </DialogContent>
              </Dialog>

              <AlertDialog open={!!defaultConfirm} onOpenChange={(open) => { if (!open) setDefaultConfirm(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Standard-Tarif ändern?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Achtung! Der Tarif „{defaultConfirm?.currentDefaultName}" ist aktuell als Standard hinterlegt. Möchten Sie stattdessen diesen Tarif als neuen Standard definieren? Neue Lade-Nutzer ohne individuellen Tarif werden anschließend automatisch dem neuen Standard-Tarif zugeordnet.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { if (defaultConfirm) applySetDefault(defaultConfirm.tariffId); setDefaultConfirm(null); }}>
                      Als Standard setzen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t("charging.invoices" as any)}</CardTitle>
                  {isAdmin && (
                    <div className="flex gap-2">

                      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm"><FileText className="h-4 w-4 mr-2" />Rechnungen erstellen</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Rechnungen erstellen</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Abrechnungsmonat</Label>
                              <Input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
                            </div>
                            <div className="p-3 bg-muted rounded-lg text-sm">
                              <p>Zeitraum: <strong>{genPeriod.start}</strong> bis <strong>{genPeriod.end}</strong></p>
                              <p className="text-muted-foreground mt-1">Es werden Einzelrechnungen pro Nutzer sowie Sammelrechnungen für alle Rechnungsgruppen mit Mitgliedern im Zeitraum erstellt.</p>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Abbrechen</Button>
                            <Button onClick={handleGenerate} disabled={generateInvoices.isPending}>
                              {generateInvoices.isPending ? "Wird erstellt…" : "Rechnungen erstellen"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button size="sm" variant="outline" onClick={handleSendAll} disabled={sendInvoices.isPending}>
                        <Send className="h-4 w-4 mr-2" />
                        {sendInvoices.isPending ? "Wird versendet…" : "Per E-Mail senden"}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Rechnungen durchsuchen (Nummer, Kunde, E-Mail, Status, Datum…)"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="max-w-md h-9"
                  />
                  {displayedInvoices.length === 0 ? <p className="text-muted-foreground">{t("charging.noInvoices" as any)}</p> : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHead column="invoice_number" label={t("charging.invoiceNo" as any)} sortColumn={invSortColumn} sortDirection={invSortDirection} onSort={setInvSortColumn} onDir={setInvSortDirection} />
                            <SortableHead column="invoice_date" label="Rechnungsdatum" sortColumn={invSortColumn} sortDirection={invSortDirection} onSort={setInvSortColumn} onDir={setInvSortDirection} />
                            <SortableHead column="user_name" label="Kunde" sortColumn={invSortColumn} sortDirection={invSortDirection} onSort={setInvSortColumn} onDir={setInvSortDirection} />
                            <SortableHead column="period" label="Zeitraum" sortColumn={invSortColumn} sortDirection={invSortDirection} onSort={setInvSortColumn} onDir={setInvSortDirection} />
                            <SortableHead column="total_amount" label={t("charging.totalAmount" as any)} sortColumn={invSortColumn} sortDirection={invSortDirection} onSort={setInvSortColumn} onDir={setInvSortDirection} />
                            <SortableHead column="status" label={t("common.status" as any)} sortColumn={invSortColumn} sortDirection={invSortDirection} onSort={setInvSortColumn} onDir={setInvSortDirection} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoicesPaged.items.map((inv: any) => (
                            <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedInvoice(inv)}>
                              <TableCell className="font-mono">{inv.invoice_number || "—"}</TableCell>
                              <TableCell>{inv.invoice_date ? format(new Date(inv.invoice_date), "dd.MM.yyyy") : format(new Date(inv.created_at), "dd.MM.yyyy")}</TableCell>
                              <TableCell className="font-medium">{inv.user_name || "—"}</TableCell>
                              <TableCell className="text-sm">
                                {inv.period_start && inv.period_end
                                  ? `${format(new Date(inv.period_start), "dd.MM.")} – ${format(new Date(inv.period_end), "dd.MM.yyyy")}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="font-medium">{fmtCurrency(inv.total_amount)}</TableCell>
                              <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "issued" ? "secondary" : "outline"}>{inv.status === "paid" ? t("charging.statusPaid" as any) : inv.status === "issued" ? t("charging.statusIssued" as any) : t("charging.statusDraft" as any)}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <PaginationBar page={invoicesPaged.page} total={invoicesPaged.total} onChange={setInvoicePage} count={displayedInvoices.length} />
                    </>
                  )}

                </CardContent>
              </Card>

              {/* Invoice Preview Dialog */}
              <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null); }}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Rechnungsvorschau</DialogTitle>
                  </DialogHeader>
                  {selectedInvoice && (() => {
                    const inv = selectedInvoice;
                    const taxRate = inv.tax_rate_percent || 19;
                    const pricePerKwh = inv.tariff_price_per_kwh ?? 0;
                    const idleFeePerMin = inv.tariff_idle_fee_per_minute ?? 0;
                    const idleGrace = inv.tariff_idle_fee_grace_minutes ?? 60;
                    const tagLabelMap = new Map<string, string | null>();
                    for (const t of (inv.user_tags || [])) {
                      tagLabelMap.set(t.tag.toUpperCase(), t.label);
                    }
                    // Group sessions by tag
                    const grouped = new Map<string, typeof inv.sessions>();
                    for (const s of (inv.sessions || [])) {
                      const key = (s.id_tag || "—").toUpperCase();
                      const arr = grouped.get(key) ?? [];
                      arr.push(s);
                      grouped.set(key, arr);
                    }
                    const computeSession = (s: any) => {
                      const duration = s.stop_time ? Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000) : 0;
                      const idleMin = Math.max(0, duration - idleGrace);
                      const idleFee = idleFeePerMin > 0 ? idleMin * idleFeePerMin : 0;
                      const energyNet = (s.energy_kwh || 0) * pricePerKwh;
                      const net = energyNet + idleFee;
                      const gross = net * (1 + taxRate / 100);
                      return { duration, idleFee, energyNet, net, gross };
                    };

                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Rechnungsnummer</p>
                            <p className="font-mono font-semibold">{inv.invoice_number || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</p>
                            <Badge variant={inv.status === "paid" ? "default" : inv.status === "issued" ? "secondary" : "outline"}>
                              {inv.status === "paid" ? "Bezahlt" : inv.status === "issued" ? "Ausgestellt" : "Entwurf"}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Rechnungsdatum</p>
                            <p>{inv.invoice_date ? format(new Date(inv.invoice_date), "dd.MM.yyyy") : "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Zeitraum</p>
                            <p>{inv.period_start && inv.period_end
                              ? `${format(new Date(inv.period_start), "dd.MM.")} – ${format(new Date(inv.period_end), "dd.MM.yyyy")}`
                              : "—"}</p>
                          </div>
                          <div className="col-span-2 border-t pt-3">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Kunde</p>
                            <p className="font-semibold">{inv.user_name || "—"}</p>
                            {inv.user_email && <p className="text-xs text-muted-foreground">{inv.user_email}</p>}
                          </div>
                        </div>

                        {/* Sessions grouped by tag */}
                        <div className="space-y-4">
                          {Array.from(grouped.entries()).map(([tagKey, sess]) => {
                            const label = tagLabelMap.get(tagKey);
                            return (
                              <div key={tagKey} className="border rounded-lg overflow-hidden">
                                <div className="bg-muted/50 px-3 py-2 text-xs flex items-center justify-between">
                                  <span>
                                    <span className="font-mono font-semibold">{tagKey}</span>
                                    {label && <span className="text-muted-foreground ml-2">· {label}</span>}
                                  </span>
                                  <span className="text-muted-foreground">{sess!.length} Vorgang/Vorgänge</span>
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">Zeitpunkt</TableHead>
                                      <TableHead className="text-xs text-right">Energie</TableHead>
                                      <TableHead className="text-xs text-right">Blockier­gebühr</TableHead>
                                      <TableHead className="text-xs text-right">Netto</TableHead>
                                      <TableHead className="text-xs text-right">Brutto</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {sess!.map(s => {
                                      const c = computeSession(s);
                                      return (
                                        <TableRow key={s.id}>
                                          <TableCell className="text-xs">{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtKwh(s.energy_kwh)}</TableCell>
                                          <TableCell className="text-xs text-right">{c.idleFee > 0 ? fmtCurrency(c.idleFee) : "—"}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(c.net)}</TableCell>
                                          <TableCell className="text-xs text-right font-medium">{fmtCurrency(c.gross)}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            );
                          })}
                          {grouped.size === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">Keine Ladevorgänge verknüpft.</p>
                          )}
                        </div>

                        <div className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex justify-between font-semibold text-base">
                            <span>Gesamtbetrag (brutto, inkl. {fmtNum(taxRate, 0)} % MwSt.)</span>
                            <span>{fmtCurrency(inv.total_amount)}</span>
                          </div>
                        </div>

                        {inv.issued_at && (
                          <p className="text-xs text-muted-foreground">
                            Ausgestellt am {format(new Date(inv.issued_at), "dd.MM.yyyy HH:mm")}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedInvoice(null)}>Schließen</Button>
                    {selectedInvoice && invoiceSettings && (
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const blob = await generateChargingInvoicePdf({
                              invoice: selectedInvoice,
                              settings: invoiceSettings,
                              userName: selectedInvoice.user_name,
                            });

                            const filename = `Rechnung_${selectedInvoice.invoice_number || selectedInvoice.id}.pdf`;
                            downloadBlob(blob, filename);
                          } catch (e: any) {
                            toast({ title: "PDF-Fehler", description: e.message, variant: "destructive" });
                          }
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />PDF
                      </Button>
                    )}
                    {selectedInvoice?.status === "draft" && isAdmin && (
                      <Button
                        onClick={() => {
                          finalizeInvoice.mutate(selectedInvoice.id);
                          setSelectedInvoice(null);
                        }}
                        disabled={finalizeInvoice.isPending}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {finalizeInvoice.isPending ? "Wird ausgestellt…" : "Fertigstellen"}
                      </Button>
                    )}
                    {selectedInvoice?.status === "issued" && isAdmin && (
                      <Button
                        variant="default"
                        onClick={() => {
                          markAsPaid.mutate(selectedInvoice.id);
                          setSelectedInvoice(null);
                        }}
                        disabled={markAsPaid.isPending}
                      >
                        <Euro className="h-4 w-4 mr-2" />
                        {markAsPaid.isPending ? "Wird markiert…" : "Als bezahlt markieren"}
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>



            {/* Billing Groups Tab */}
            <TabsContent value="billing-groups">
              <BillingGroupsTab isAdmin={isAdmin} />
            </TabsContent>


          </Tabs>
        </div>

      </main>
    </div>
  );
};

export default ChargingBilling;
