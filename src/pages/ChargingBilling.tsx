import { useState, useMemo } from "react";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useChargingSessions } from "@/hooks/useChargingSessions";
import { useChargingTariffs, ChargingTariff } from "@/hooks/useChargingTariffs";
import { useChargingInvoices } from "@/hooks/useChargingInvoices";
import { useChargePoints } from "@/hooks/useChargePoints";
import { useTenant } from "@/hooks/useTenant";
import ChargingUsersTab from "@/components/charging/ChargingUsersTab";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Receipt, Euro, Zap, Clock, Trash2, Edit, Users, Globe, Calendar, TrendingUp, Percent } from "lucide-react";
import { format } from "date-fns";
import { fmtNum, fmtCurrency, fmtKwh } from "@/lib/formatCharging";

const ChargingBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { sessions, isLoading: sessionsLoading } = useChargingSessions();
  const { tariffs, isLoading: tariffsLoading, addTariff, updateTariff, deleteTariff } = useChargingTariffs();
  const { invoices, createInvoice } = useChargingInvoices();
  const { chargePoints } = useChargePoints();

  const [tariffOpen, setTariffOpen] = useState(false);
  const [editTariff, setEditTariff] = useState<ChargingTariff | null>(null);
  const [tariffForm, setTariffForm] = useState({ name: "", price_per_kwh: "0.35", base_fee: "0", idle_fee_per_minute: "0", idle_fee_grace_minutes: "60", currency: "EUR" });
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");

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

  const resetTariffForm = () => setTariffForm({ name: "", price_per_kwh: "0.35", base_fee: "0", idle_fee_per_minute: "0", idle_fee_grace_minutes: "60", currency: "EUR" });

  const handleAddTariff = () => {
    if (!tenant?.id) return;
    addTariff.mutate({
      tenant_id: tenant.id,
      name: tariffForm.name,
      price_per_kwh: parseFloat(tariffForm.price_per_kwh),
      base_fee: parseFloat(tariffForm.base_fee),
      idle_fee_per_minute: parseFloat(tariffForm.idle_fee_per_minute),
      idle_fee_grace_minutes: parseInt(tariffForm.idle_fee_grace_minutes),
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
    } as any);
    setEditTariff(null);
    resetTariffForm();
  };

  const openEditTariff = (t: ChargingTariff) => {
    setTariffForm({ name: t.name, price_per_kwh: String(t.price_per_kwh), base_fee: String(t.base_fee), idle_fee_per_minute: String(t.idle_fee_per_minute || 0), idle_fee_grace_minutes: String(t.idle_fee_grace_minutes || 60), currency: t.currency });
    setEditTariff(t);
  };

  const tariffFormFields = (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={tariffForm.name} onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Preis pro kWh (€)</Label><Input type="number" step="0.01" value={tariffForm.price_per_kwh} onChange={(e) => setTariffForm({ ...tariffForm, price_per_kwh: e.target.value })} /></div>
        <div><Label>Grundgebühr (€)</Label><Input type="number" step="0.01" value={tariffForm.base_fee} onChange={(e) => setTariffForm({ ...tariffForm, base_fee: e.target.value })} /></div>
      </div>
      <div className="border-t pt-4">
        <Label className="text-sm font-medium flex items-center gap-2 mb-3"><Clock className="h-4 w-4" />Blockiergebühr</Label>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Gebühr pro Minute (€)</Label><Input type="number" step="0.01" min="0" value={tariffForm.idle_fee_per_minute} onChange={(e) => setTariffForm({ ...tariffForm, idle_fee_per_minute: e.target.value })} /></div>
          <div><Label>Freibetrag (Min.)</Label><Input type="number" step="1" min="0" value={tariffForm.idle_fee_grace_minutes} onChange={(e) => setTariffForm({ ...tariffForm, idle_fee_grace_minutes: e.target.value })} /></div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Nach Ablauf der Freibetragszeit wird pro Minute die Blockiergebühr berechnet.</p>
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
                {([
                  { key: "day", label: "Tag" },
                  { key: "week", label: "Woche" },
                  { key: "month", label: "Monat" },
                  { key: "quarter", label: "Quartal" },
                  { key: "year", label: "Jahr" },
                ] as const).map(({ key, label }) => (
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
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4 flex items-center gap-3"><Zap className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{fmtKwh(totalEnergy, 1)}</p><p className="text-sm text-muted-foreground">gesamt</p></div></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3"><Receipt className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{fmtNum(completedSessions.length, 0)}</p><p className="text-sm text-muted-foreground">Ladevorgänge</p></div></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{activeTariff ? fmtCurrency(totalEnergy * activeTariff.price_per_kwh + (completedSessions.length > 0 ? activeTariff.base_fee : 0)) : "—"}</p><p className="text-sm text-muted-foreground">Gesamtumsatz</p></div></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3"><Percent className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{chargePoints.length > 0 ? fmtNum((filteredSessions.filter(s => s.status === "active").length / chargePoints.length) * 100, 1) + " %" : "— %"}</p><p className="text-sm text-muted-foreground">Durchsch. Auslastung</p></div></CardContent></Card>
            </div>
          </div>

          <Tabs defaultValue="sessions">
            <TabsList>
              <TabsTrigger value="sessions">Ladevorgänge</TabsTrigger>
              <TabsTrigger value="tariffs">Tarife</TabsTrigger>
              <TabsTrigger value="invoices">Rechnungen</TabsTrigger>
              <TabsTrigger value="users">Nutzer</TabsTrigger>
              <TabsTrigger value="roaming">Roaming</TabsTrigger>
            </TabsList>

            {/* Sessions Tab */}
            <TabsContent value="sessions">
              <Card>
                <CardHeader><CardTitle>Ladevorgänge</CardTitle></CardHeader>
                <CardContent>
                  {sessionsLoading ? <p className="text-muted-foreground">Laden...</p> : sessions.length === 0 ? <p className="text-muted-foreground">Keine Ladevorgänge vorhanden.</p> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ladepunkt</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>Ende</TableHead>
                          <TableHead>Energie</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>ID-Tag</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{getCpName(s.charge_point_id)}</TableCell>
                            <TableCell>{format(new Date(s.start_time), "dd.MM.yyyy HH:mm")}</TableCell>
                            <TableCell>{s.stop_time ? format(new Date(s.stop_time), "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                            <TableCell>{fmtKwh(s.energy_kwh)}</TableCell>
                            <TableCell><Badge variant={s.status === "active" ? "default" : s.status === "completed" ? "secondary" : "destructive"}>{s.status === "active" ? "Aktiv" : s.status === "completed" ? "Abgeschlossen" : "Fehler"}</Badge></TableCell>
                            <TableCell className="font-mono text-sm">{s.id_tag || "—"}</TableCell>
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
                  <CardTitle>Tarife</CardTitle>
                  {isAdmin && (
                    <Dialog open={tariffOpen} onOpenChange={setTariffOpen}>
                      <DialogTrigger asChild><Button size="sm" onClick={resetTariffForm}><Plus className="h-4 w-4 mr-2" />Tarif hinzufügen</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Neuer Tarif</DialogTitle></DialogHeader>
                        {tariffFormFields}
                        <Button onClick={handleAddTariff} disabled={!tariffForm.name}>Erstellen</Button>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {tariffsLoading ? <p className="text-muted-foreground">Laden...</p> : tariffs.length === 0 ? <p className="text-muted-foreground">Keine Tarife vorhanden.</p> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                           <TableHead>Name</TableHead>
                          <TableHead>Preis/kWh</TableHead>
                          <TableHead>Grundgebühr</TableHead>
                          <TableHead>Blockiergebühr</TableHead>
                          <TableHead>Aktiv</TableHead>
                          {isAdmin && <TableHead className="w-24">Aktionen</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tariffs.map((tariff) => (
                          <TableRow key={tariff.id}>
                            <TableCell className="font-medium">{tariff.name}</TableCell>
                            <TableCell>{fmtCurrency(tariff.price_per_kwh)}</TableCell>
                            <TableCell>{fmtCurrency(tariff.base_fee)}</TableCell>
                            <TableCell>{tariff.idle_fee_per_minute > 0 ? <span className="text-sm">{fmtCurrency(tariff.idle_fee_per_minute)}/Min. <span className="text-muted-foreground">ab {tariff.idle_fee_grace_minutes} Min.</span></span> : <span className="text-muted-foreground">—</span>}</TableCell>
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
                  <DialogHeader><DialogTitle>Tarif bearbeiten</DialogTitle></DialogHeader>
                  {tariffFormFields}
                  <Button onClick={handleEditTariff} disabled={!tariffForm.name}>Speichern</Button>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices">
              <Card>
                <CardHeader><CardTitle>Rechnungen</CardTitle></CardHeader>
                <CardContent>
                  {invoices.length === 0 ? <p className="text-muted-foreground">Keine Rechnungen vorhanden.</p> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rechnungsnr.</TableHead>
                          <TableHead>Energie</TableHead>
                          <TableHead>Ladekosten</TableHead>
                          <TableHead>Blockiergebühr</TableHead>
                          <TableHead>Gesamt</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Erstellt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono">{inv.invoice_number || "—"}</TableCell>
                            <TableCell>{fmtKwh(inv.total_energy_kwh)}</TableCell>
                            <TableCell>{fmtCurrency(inv.total_amount - (inv.idle_fee_amount || 0))}</TableCell>
                            <TableCell>{inv.idle_fee_amount > 0 ? fmtCurrency(inv.idle_fee_amount) : <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="font-medium">{fmtCurrency(inv.total_amount)}</TableCell>
                            <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "issued" ? "secondary" : "outline"}>{inv.status === "paid" ? "Bezahlt" : inv.status === "issued" ? "Ausgestellt" : "Entwurf"}</Badge></TableCell>
                            <TableCell>{format(new Date(inv.created_at), "dd.MM.yyyy")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              <ChargingUsersTab />
            </TabsContent>

            {/* Roaming Tab */}
            <TabsContent value="roaming">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Roaming</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Roaming-Verbindungen zu externen Netzwerken (z.&nbsp;B. Hubject, OCPI) werden in einem zukünftigen Update verfügbar sein.</p>
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
