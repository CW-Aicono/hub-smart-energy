import { useState, useMemo } from "react";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, subMonths, endOfMonth } from "date-fns";
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

import RoamingTab from "@/components/charging/RoamingTab";
import BillingGroupsTab from "@/components/charging/BillingGroupsTab";
import ChargingInvoiceSettingsDialog from "@/components/charging/ChargingInvoiceSettingsDialog";
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
import { Plus, Receipt, Euro, Zap, Clock, Trash2, Edit, Users, Globe, Calendar, TrendingUp, Percent, FileText, Send, Settings, Download, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { EichrechtTab } from "@/components/charging/EichrechtTab";
import { format } from "date-fns";
import { fmtNum, fmtCurrency, fmtKwh } from "@/lib/formatCharging";
import { generateChargingInvoicePdf, downloadBlob } from "@/lib/generateChargingInvoicePdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Sortable table header for charging sessions
function SortableHead({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  onDir,
}: {
  column: "charge_point" | "start_time" | "stop_time" | "energy" | "status" | "id_tag";
  label: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (c: "charge_point" | "start_time" | "stop_time" | "energy" | "status" | "id_tag" | null) => void;
  onDir: (d: "asc" | "desc") => void;
}) {
  const active = sortColumn === column;
  return (
    <TableHead
      className="cursor-pointer select-none"
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
  const { invoices, generateInvoices, sendInvoices, finalizeInvoice, markAsPaid } = useChargingInvoices();
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const { chargePoints } = useChargePoints();
  const { settings: invoiceSettings } = useChargingInvoiceSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");

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

  const periodStart = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "day": return startOfDay(now);
      case "week": return startOfWeek(now, { weekStartsOn: tenant?.week_start_day ?? 1 });
      case "month": return startOfMonth(now);
      case "quarter": return startOfQuarter(now);
      case "year": return startOfYear(now);
    }
  }, [period]);

  // Search state
  const [sessionSearch, setSessionSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Session sorting state
  const [sortColumn, setSortColumn] = useState<"charge_point" | "start_time" | "stop_time" | "energy" | "status" | "id_tag" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Invoice sorting state
  const [invSortColumn, setInvSortColumn] = useState<"invoice_number" | "invoice_date" | "user_name" | "period" | "total_amount" | "status" | null>("invoice_date");
  const [invSortDirection, setInvSortDirection] = useState<"asc" | "desc">("desc");

  const getCpName = (id: string) => chargePoints.find((cp) => cp.id === id)?.name || "—";

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    return sessions.filter(s => {
      if (new Date(s.start_time) < periodStart) return false;
      if (!q) return true;
      const cp = getCpName(s.charge_point_id).toLowerCase();
      const tag = (resolveTag(s.id_tag) || s.id_tag || "").toLowerCase();
      const status = (s.status || "").toLowerCase();
      const start = format(new Date(s.start_time), "dd.MM.yyyy HH:mm");
      return cp.includes(q) || tag.includes(q) || status.includes(q) || start.includes(q);
    });
  }, [sessions, periodStart, sessionSearch, chargePoints, resolveTag]);

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

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter((inv: any) => {
      // Period filter: use invoice_date (fallback created_at) or period_start
      const ref = new Date(inv.invoice_date || inv.period_start || inv.created_at);
      if (ref < periodStart) return false;
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
  }, [invoices, periodStart, invoiceSearch]);

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
    setGenerateOpen(false);
  };

  const handleSendAll = () => {
    if (!tenant?.id) return;
    sendInvoices.mutate({ tenant_id: tenant.id, period_start: genPeriod.start, period_end: genPeriod.end });
  };

  const periodKeys = [
    { key: "day" as const, labelKey: "charging.periodDay" },
    { key: "week" as const, labelKey: "charging.periodWeek" },
    { key: "month" as const, labelKey: "charging.periodMonth" },
    { key: "quarter" as const, labelKey: "charging.periodQuarter" },
    { key: "year" as const, labelKey: "charging.periodYear" },
  ];

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
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {periodKeys.map(({ key, labelKey }) => (
                  <Button
                    key={key}
                    variant={period === key ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-3"
                    onClick={() => setPeriod(key)}
                  >
                    {t(labelKey as any)}
                  </Button>
                ))}
              </div>
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
              <TabsTrigger value="roaming">{t("charging.tabRoaming" as any)}</TabsTrigger>
            </TabsList>

            {/* Sessions Tab */}
            <TabsContent value="sessions">
              <Card>
                <CardHeader><CardTitle>{t("charging.sessions" as any)}</CardTitle></CardHeader>
                <CardContent>
                  {sessionsLoading ? <p className="text-muted-foreground">{t("charging.loading" as any)}</p> : filteredSessions.length === 0 ? <p className="text-muted-foreground">{t("charging.noSessions" as any)}</p> : (
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
                        {displayedSessions.map((s) => (
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
                      <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                        <Settings className="h-4 w-4 mr-2" />Rechnungsdesign
                      </Button>
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
                              <p className="text-muted-foreground mt-1">Es werden Sammelrechnungen pro Nutzer für alle abgeschlossenen Ladevorgänge in diesem Zeitraum erstellt.</p>
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
                <CardContent>
                  {invoices.length === 0 ? <p className="text-muted-foreground">{t("charging.noInvoices" as any)}</p> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("charging.invoiceNo" as any)}</TableHead>
                          <TableHead>Rechnungsdatum</TableHead>
                          <TableHead>Kunde</TableHead>
                          <TableHead>Zeitraum</TableHead>
                          <TableHead>{t("charging.totalAmount" as any)}</TableHead>
                          <TableHead>{t("common.status" as any)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => (
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
              <BillingGroupsTab isAdmin={isAdmin} periodStart={genPeriod.start} periodEnd={genPeriod.end} periodLabel={genPeriod.label} />
            </TabsContent>

            {/* Roaming Tab */}
            <TabsContent value="roaming">
              <RoamingTab />
            </TabsContent>


          </Tabs>
        </div>
        <ChargingInvoiceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </main>
    </div>
  );
};

export default ChargingBilling;
