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
import ChargingUsersTab from "@/components/charging/ChargingUsersTab";
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
import { Plus, Receipt, Euro, Zap, Clock, Trash2, Edit, Users, Globe, Calendar, TrendingUp, Percent, FileText, Send, Settings, Download } from "lucide-react";
import { format } from "date-fns";
import { fmtNum, fmtCurrency, fmtKwh } from "@/lib/formatCharging";
import { generateChargingInvoicePdf, downloadBlob } from "@/lib/generateChargingInvoicePdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ChargingBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { sessions, isLoading: sessionsLoading } = useChargingSessions();
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

  const filteredSessions = useMemo(() =>
    sessions.filter(s => new Date(s.start_time) >= periodStart),
    [sessions, periodStart]
  );

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const completedSessions = filteredSessions.filter((s) => s.status === "completed");
  const totalEnergy = completedSessions.reduce((sum, s) => sum + s.energy_kwh, 0);
  const activeTariff = tariffs.find((t) => t.is_active);

  const getCpName = (id: string) => chargePoints.find((cp) => cp.id === id)?.name || "—";

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
        <div><Label>{t("charging.pricePerKwh" as any)}</Label><Input type="number" step="0.01" value={tariffForm.price_per_kwh} onChange={(e) => setTariffForm({ ...tariffForm, price_per_kwh: e.target.value })} /></div>
        <div><Label>{t("charging.baseFee" as any)}</Label><Input type="number" step="0.01" value={tariffForm.base_fee} onChange={(e) => setTariffForm({ ...tariffForm, base_fee: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>MwSt-Satz (%)</Label><Input type="number" step="0.1" min="0" max="100" value={tariffForm.tax_rate_percent} onChange={(e) => setTariffForm({ ...tariffForm, tax_rate_percent: e.target.value })} /></div>
      </div>
      <div className="border-t pt-4">
        <Label className="text-sm font-medium flex items-center gap-2 mb-3"><Clock className="h-4 w-4" />{t("charging.idleFee" as any)}</Label>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>{t("charging.idleFeePerMin" as any)}</Label><Input type="number" step="0.01" min="0" value={tariffForm.idle_fee_per_minute} onChange={(e) => setTariffForm({ ...tariffForm, idle_fee_per_minute: e.target.value })} /></div>
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
              <TabsTrigger value="users">{t("charging.tabUsers" as any)}</TabsTrigger>
              <TabsTrigger value="roaming">{t("charging.tabRoaming" as any)}</TabsTrigger>
            </TabsList>

            {/* Sessions Tab */}
            <TabsContent value="sessions">
              <Card>
                <CardHeader><CardTitle>{t("charging.sessions" as any)}</CardTitle></CardHeader>
                <CardContent>
                  {sessionsLoading ? <p className="text-muted-foreground">{t("charging.loading" as any)}</p> : sessions.length === 0 ? <p className="text-muted-foreground">{t("charging.noSessions" as any)}</p> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("charging.chargePoint" as any)}</TableHead>
                          <TableHead>{t("charging.start" as any)}</TableHead>
                          <TableHead>{t("charging.end" as any)}</TableHead>
                          <TableHead>{t("charging.energy" as any)}</TableHead>
                          <TableHead>{t("common.status" as any)}</TableHead>
                          <TableHead>{t("charging.idTag" as any)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{getCpName(s.charge_point_id)}</TableCell>
                            <TableCell>{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</TableCell>
                            <TableCell>{s.stop_time ? format(new Date(s.stop_time), "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                            <TableCell>{fmtKwh(s.energy_kwh)}</TableCell>
                            <TableCell><Badge variant={s.status === "active" ? "default" : s.status === "completed" ? "secondary" : "destructive"}>{s.status === "active" ? t("charging.statusActive" as any) : s.status === "completed" ? t("charging.statusCompleted" as any) : t("charging.statusError" as any)}</Badge></TableCell>
                            <TableCell className="text-sm">{resolveTag(s.id_tag) || s.id_tag || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
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
                          <TableHead>{t("charging.priceKwh" as any)}</TableHead>
                          <TableHead>{t("charging.baseFee" as any)}</TableHead>
                          <TableHead>{t("charging.idleFee" as any)}</TableHead>
                          <TableHead>MwSt</TableHead>
                          <TableHead>{t("charging.active" as any)}</TableHead>
                          {isAdmin && <TableHead className="w-24">{t("charging.actions" as any)}</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tariffs.map((tariff) => (
                          <TableRow key={tariff.id}>
                            <TableCell className="font-medium">{tariff.name}</TableCell>
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
                          <TableHead>Zeitraum</TableHead>
                          <TableHead>{t("charging.energyCol" as any)}</TableHead>
                          <TableHead>Netto</TableHead>
                          <TableHead>MwSt</TableHead>
                          <TableHead>{t("charging.totalAmount" as any)}</TableHead>
                          <TableHead>{t("common.status" as any)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => (
                          <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedInvoice(inv)}>
                            <TableCell className="font-mono">{inv.invoice_number || "—"}</TableCell>
                            <TableCell>{inv.invoice_date ? format(new Date(inv.invoice_date), "dd.MM.yyyy") : format(new Date(inv.created_at), "dd.MM.yyyy")}</TableCell>
                            <TableCell className="text-sm">
                              {inv.period_start && inv.period_end
                                ? `${format(new Date(inv.period_start), "dd.MM.")} – ${format(new Date(inv.period_end), "dd.MM.yyyy")}`
                                : "—"}
                            </TableCell>
                            <TableCell>{fmtKwh(inv.total_energy_kwh)}</TableCell>
                            <TableCell>{fmtCurrency(inv.net_amount || (inv.total_amount - (inv.tax_amount || 0)))}</TableCell>
                            <TableCell>{fmtCurrency(inv.tax_amount || 0)}</TableCell>
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
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Rechnungsvorschau</DialogTitle>
                  </DialogHeader>
                  {selectedInvoice && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Rechnungsnummer</p>
                          <p className="font-mono font-semibold">{selectedInvoice.invoice_number || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</p>
                          <Badge variant={selectedInvoice.status === "paid" ? "default" : selectedInvoice.status === "issued" ? "secondary" : "outline"}>
                            {selectedInvoice.status === "paid" ? "Bezahlt" : selectedInvoice.status === "issued" ? "Ausgestellt" : "Entwurf"}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Rechnungsdatum</p>
                          <p>{selectedInvoice.invoice_date ? format(new Date(selectedInvoice.invoice_date), "dd.MM.yyyy") : "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Zeitraum</p>
                          <p>{selectedInvoice.period_start && selectedInvoice.period_end
                            ? `${format(new Date(selectedInvoice.period_start), "dd.MM.")} – ${format(new Date(selectedInvoice.period_end), "dd.MM.yyyy")}`
                            : "—"}</p>
                        </div>
                      </div>

                      <div className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Energie</span>
                          <span>{fmtKwh(selectedInvoice.total_energy_kwh)}</span>
                        </div>
                        {selectedInvoice.idle_fee_amount > 0 && (
                          <div className="flex justify-between text-sm text-destructive">
                            <span>Blockiergebühr</span>
                            <span>{fmtCurrency(selectedInvoice.idle_fee_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span>Nettobetrag</span>
                          <span>{fmtCurrency(selectedInvoice.net_amount || (selectedInvoice.total_amount - (selectedInvoice.tax_amount || 0)))}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>MwSt ({fmtNum(selectedInvoice.tax_rate_percent, 0)} %)</span>
                          <span>{fmtCurrency(selectedInvoice.tax_amount || 0)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-base border-t pt-2">
                          <span>Gesamtbetrag (brutto)</span>
                          <span>{fmtCurrency(selectedInvoice.total_amount)}</span>
                        </div>
                      </div>

                      {selectedInvoice.issued_at && (
                        <p className="text-xs text-muted-foreground">
                          Ausgestellt am {format(new Date(selectedInvoice.issued_at), "dd.MM.yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                  )}
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

            {/* Users Tab */}
            <TabsContent value="users">
              <ChargingUsersTab />
            </TabsContent>

            {/* Roaming Tab */}
            <TabsContent value="roaming">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />{t("charging.roaming" as any)}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t("charging.roamingDesc" as any)}</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default ChargingBilling;
