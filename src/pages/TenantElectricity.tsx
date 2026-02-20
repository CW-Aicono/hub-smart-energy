import { useState } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Home, Users, Receipt, Settings, Plus, Trash2, FileText, Sun, Plug2, Pencil, Archive, ArchiveRestore, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenantElectricityTenants } from "@/hooks/useTenantElectricityTenants";
import { useTenantElectricityTariffs } from "@/hooks/useTenantElectricityTariffs";
import { useTenantElectricityInvoices } from "@/hooks/useTenantElectricityInvoices";
import { useTenantElectricitySettings } from "@/hooks/useTenantElectricitySettings";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { format } from "date-fns";

const TenantElectricity = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("nav.tenantElectricity")}</h1>
          <p className="text-muted-foreground">PV-Mieterstrom verwalten, abrechnen und dokumentieren</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="tenants">Mieter</TabsTrigger>
            <TabsTrigger value="tariffs">Tarife</TabsTrigger>
            <TabsTrigger value="invoices">Abrechnung</TabsTrigger>
            <TabsTrigger value="settings">Einstellungen</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="tenants"><TenantsTab /></TabsContent>
          <TabsContent value="tariffs"><TariffsTab /></TabsContent>
          <TabsContent value="invoices"><InvoicesTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ── Overview ──
function OverviewTab() {
  const { activeTenants } = useTenantElectricityTenants();
  const { activeTariff } = useTenantElectricityTariffs();
  const { totalRevenue, invoices } = useTenantElectricityInvoices();

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardDescription>Aktive Mieter</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" />{activeTenants.length}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardDescription>Aktiver Tarif</CardDescription></CardHeader>
        <CardContent><div className="text-lg font-semibold">{activeTariff?.name || "Kein Tarif"}</div>
          {activeTariff && <p className="text-xs text-muted-foreground">Lokal: {activeTariff.price_per_kwh_local} ct | Netz: {activeTariff.price_per_kwh_grid} ct</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardDescription>Rechnungen</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold">{invoices.length}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardDescription>Umsatz (gestellt)</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold">{totalRevenue.toFixed(2)} €</div></CardContent>
      </Card>
    </div>
  );
}

// ── Tenants Tab ──
function TenantsTab() {
  const { tenants, activeTenants, archivedTenants, createTenant, updateTenant, archiveTenant } = useTenantElectricityTenants();
  const { locations } = useLocations();
  const { meters } = useMeters();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: "", unit_label: "", email: "", location_id: "", meter_ids: [] as string[], move_in_date: "" });
  const [editForm, setEditForm] = useState({ name: "", unit_label: "", email: "", location_id: "", meter_ids: [] as string[], move_in_date: "", move_out_date: "" });

  const toggleMeter = (meterId: string, isEdit: boolean) => {
    if (isEdit) {
      setEditForm((f) => ({
        ...f,
        meter_ids: f.meter_ids.includes(meterId) ? f.meter_ids.filter((id) => id !== meterId) : [...f.meter_ids, meterId],
      }));
    } else {
      setForm((f) => ({
        ...f,
        meter_ids: f.meter_ids.includes(meterId) ? f.meter_ids.filter((id) => id !== meterId) : [...f.meter_ids, meterId],
      }));
    }
  };

  const handleCreate = () => {
    createTenant.mutate({
      name: form.name, unit_label: form.unit_label || undefined, email: form.email || undefined,
      location_id: form.location_id || undefined, meter_ids: form.meter_ids.length > 0 ? form.meter_ids : undefined,
      move_in_date: form.move_in_date || undefined,
    }, { onSuccess: () => { setOpen(false); setForm({ name: "", unit_label: "", email: "", location_id: "", meter_ids: [], move_in_date: "" }); } });
  };

  const openEdit = (te: any) => {
    setEditTenant(te);
    setEditForm({
      name: te.name || "", unit_label: te.unit_label || "", email: te.email || "",
      location_id: te.location_id || "",
      meter_ids: (te.assigned_meters || []).map((am: any) => am.meter_id),
      move_in_date: te.move_in_date || "", move_out_date: te.move_out_date || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editTenant) return;
    updateTenant.mutate({
      id: editTenant.id,
      name: editForm.name, unit_label: editForm.unit_label || null, email: editForm.email || null,
      location_id: editForm.location_id || null, meter_ids: editForm.meter_ids,
      move_in_date: editForm.move_in_date || null, move_out_date: editForm.move_out_date || null,
    }, { onSuccess: () => setEditOpen(false) });
  };

  const handleReactivate = (id: string) => {
    updateTenant.mutate({ id, status: "active", move_out_date: null });
  };

  const displayedTenants = showArchived ? archivedTenants : activeTenants;

  const MeterSelector = ({ selectedIds, isEdit }: { selectedIds: string[]; isEdit: boolean }) => (
    <div>
      <Label>Zähler zuordnen</Label>
      <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
        {meters.length === 0 && <p className="text-sm text-muted-foreground p-1">Keine Zähler verfügbar</p>}
        {meters.map((m) => (
          <label key={m.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
            <Checkbox checked={selectedIds.includes(m.id)} onCheckedChange={() => toggleMeter(m.id, isEdit)} />
            <span className="font-medium">{m.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">{m.energy_type}</span>
          </label>
        ))}
      </div>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedIds.map((mid) => {
            const m = meters.find((me) => me.id === mid);
            return m ? (
              <Badge key={mid} variant="secondary" className="gap-1">
                {m.name} <X className="h-3 w-3 cursor-pointer" onClick={() => toggleMeter(mid, isEdit)} />
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Mieterverwaltung</h2>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            <Archive className="h-4 w-4 mr-1" />
            Archiv {archivedTenants.length > 0 && `(${archivedTenants.length})`}
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Mieter anlegen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neuer Mieter</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Einheit (z.B. Whg 3)</Label><Input value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} /></div>
              </div>
              <div><Label>E-Mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Standort</Label>
                <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <MeterSelector selectedIds={form.meter_ids} isEdit={false} />
              <div><Label>Einzugsdatum</Label><Input type="date" value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></div>
              <Button onClick={handleCreate} disabled={!form.name || createTenant.isPending} className="w-full">Speichern</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mieter bearbeiten</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
              <div><Label>Einheit</Label><Input value={editForm.unit_label} onChange={(e) => setEditForm({ ...editForm, unit_label: e.target.value })} /></div>
            </div>
            <div><Label>E-Mail</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><Label>Standort</Label>
              <Select value={editForm.location_id} onValueChange={(v) => setEditForm({ ...editForm, location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <MeterSelector selectedIds={editForm.meter_ids} isEdit={true} />
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Einzugsdatum</Label><Input type="date" value={editForm.move_in_date} onChange={(e) => setEditForm({ ...editForm, move_in_date: e.target.value })} /></div>
              <div><Label>Auszugsdatum</Label><Input type="date" value={editForm.move_out_date} onChange={(e) => setEditForm({ ...editForm, move_out_date: e.target.value })} /></div>
            </div>
            <Button onClick={handleUpdate} disabled={!editForm.name || updateTenant.isPending} className="w-full">Änderungen speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Einheit</TableHead><TableHead>E-Mail</TableHead><TableHead>Zähler</TableHead><TableHead>Einzug</TableHead>{showArchived && <TableHead>Auszug</TableHead>}<TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {displayedTenants.map((te) => (
            <TableRow key={te.id} className={te.status === "archived" ? "opacity-60" : ""}>
              <TableCell className="font-medium">{te.name}</TableCell>
              <TableCell>{te.unit_label || "–"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{te.email || "–"}</TableCell>
              <TableCell>
                {te.assigned_meters && te.assigned_meters.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {te.assigned_meters.map((am) => (
                      <Badge key={am.meter_id} variant="outline" className="text-xs">
                        {am.meters?.name || "–"} <span className="text-muted-foreground ml-1">{am.meters?.energy_type}</span>
                      </Badge>
                    ))}
                  </div>
                ) : "–"}
              </TableCell>
              <TableCell>{te.move_in_date ? format(new Date(te.move_in_date), "dd.MM.yyyy") : "–"}</TableCell>
              {showArchived && <TableCell>{te.move_out_date ? format(new Date(te.move_out_date), "dd.MM.yyyy") : "–"}</TableCell>}
              <TableCell>
                <Badge variant={te.status === "active" ? "default" : "secondary"}>
                  {te.status === "active" ? "Aktiv" : "Archiviert"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {te.status === "active" ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(te)} title="Bearbeiten">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Archivieren">
                            <Archive className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Mieter archivieren?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>{te.name}</strong> {te.unit_label ? `(${te.unit_label})` : ""} wird archiviert. Alle zugehörigen Daten (Rechnungen, Ablesungen) bleiben erhalten. Der Mieter kann später reaktiviert werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => archiveTenant.mutate(te.id)}>Archivieren</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(te)} title="Bearbeiten">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleReactivate(te.id)} title="Reaktivieren">
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {displayedTenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={showArchived ? 8 : 7} className="text-center text-muted-foreground py-8">
                {showArchived ? "Keine archivierten Mieter" : "Noch keine Mieter angelegt"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Tariffs Tab ──
function TariffsTab() {
  const { tariffs, createTariff, deleteTariff } = useTenantElectricityTariffs();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", price_per_kwh_local: 0.22, price_per_kwh_grid: 0.35, base_fee_monthly: 5.0, valid_from: new Date().toISOString().split("T")[0], valid_until: "" });

  const handleCreate = () => {
    createTariff.mutate({
      name: form.name,
      price_per_kwh_local: form.price_per_kwh_local,
      price_per_kwh_grid: form.price_per_kwh_grid,
      base_fee_monthly: form.base_fee_monthly,
      valid_from: form.valid_from,
      valid_until: form.valid_until || undefined,
    }, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Tarifverwaltung</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Tarif anlegen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neuer Tarif</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Tarifname</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Lokalstrom (€/kWh)</Label><Input type="number" step="0.01" value={form.price_per_kwh_local} onChange={(e) => setForm({ ...form, price_per_kwh_local: Number(e.target.value) })} /></div>
                <div><Label>Netzstrom (€/kWh)</Label><Input type="number" step="0.01" value={form.price_per_kwh_grid} onChange={(e) => setForm({ ...form, price_per_kwh_grid: Number(e.target.value) })} /></div>
                <div><Label>Grundgebühr (€/Monat)</Label><Input type="number" step="0.5" value={form.base_fee_monthly} onChange={(e) => setForm({ ...form, base_fee_monthly: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Gültig ab</Label><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
                <div><Label>Gültig bis (optional)</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
              </div>
              <Button onClick={handleCreate} disabled={!form.name || createTariff.isPending} className="w-full">Speichern</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground"><Sun className="inline h-4 w-4 mr-1" />Hinweis: Der Mieterstromtarif muss gemäß § 42a EnWG mindestens 10 % unter dem örtlichen Grundversorgungstarif liegen.</p>
      </Card>

      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Lokal (€/kWh)</TableHead><TableHead>Netz (€/kWh)</TableHead><TableHead>Grundgebühr</TableHead><TableHead>Gültig ab</TableHead><TableHead>Gültig bis</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {tariffs.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{Number(t.price_per_kwh_local).toFixed(2)}</TableCell>
              <TableCell>{Number(t.price_per_kwh_grid).toFixed(2)}</TableCell>
              <TableCell>{Number(t.base_fee_monthly).toFixed(2)} €</TableCell>
              <TableCell>{format(new Date(t.valid_from), "dd.MM.yyyy")}</TableCell>
              <TableCell>{t.valid_until ? format(new Date(t.valid_until), "dd.MM.yyyy") : "unbegrenzt"}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => deleteTariff.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {tariffs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Noch keine Tarife angelegt</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Invoices Tab ──
function InvoicesTab() {
  const { invoices, createInvoice, updateInvoice } = useTenantElectricityInvoices();
  const { activeTenants } = useTenantElectricityTenants();
  const { activeTariff } = useTenantElectricityTariffs();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tenant_electricity_tenant_id: "", period_start: "", period_end: "",
    local_kwh: 0, grid_kwh: 0,
  });

  const totalKwh = form.local_kwh + form.grid_kwh;
  const localAmount = activeTariff ? form.local_kwh * Number(activeTariff.price_per_kwh_local) : 0;
  const gridAmount = activeTariff ? form.grid_kwh * Number(activeTariff.price_per_kwh_grid) : 0;
  const baseFee = activeTariff ? Number(activeTariff.base_fee_monthly) : 0;
  const totalAmount = localAmount + gridAmount + baseFee;

  const handleCreate = () => {
    if (!activeTariff || !form.tenant_electricity_tenant_id) return;
    createInvoice.mutate({
      tenant_electricity_tenant_id: form.tenant_electricity_tenant_id,
      tariff_id: activeTariff.id,
      period_start: form.period_start, period_end: form.period_end,
      local_kwh: form.local_kwh, grid_kwh: form.grid_kwh, total_kwh: totalKwh,
      local_amount: localAmount, grid_amount: gridAmount, base_fee: baseFee, total_amount: totalAmount,
    }, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Abrechnungen</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Rechnung erstellen</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Neue Rechnung</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Mieter</Label>
                <Select value={form.tenant_electricity_tenant_id} onValueChange={(v) => setForm({ ...form, tenant_electricity_tenant_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Mieter wählen" /></SelectTrigger>
                  <SelectContent>{activeTenants.map((te) => <SelectItem key={te.id} value={te.id}>{te.name} {te.unit_label ? `(${te.unit_label})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Zeitraum von</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                <div><Label>Zeitraum bis</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label><Sun className="inline h-3 w-3 mr-1" />Lokalstrom (kWh)</Label><Input type="number" value={form.local_kwh} onChange={(e) => setForm({ ...form, local_kwh: Number(e.target.value) })} /></div>
                <div><Label><Plug2 className="inline h-3 w-3 mr-1" />Netzstrom (kWh)</Label><Input type="number" value={form.grid_kwh} onChange={(e) => setForm({ ...form, grid_kwh: Number(e.target.value) })} /></div>
              </div>
              {activeTariff && (
                <Card className="p-3 bg-muted/50">
                  <p className="text-sm font-medium mb-1">Vorschau (Tarif: {activeTariff.name})</p>
                  <div className="text-xs space-y-1">
                    <p>Lokalstrom: {form.local_kwh} kWh × {Number(activeTariff.price_per_kwh_local).toFixed(2)} € = {localAmount.toFixed(2)} €</p>
                    <p>Netzstrom: {form.grid_kwh} kWh × {Number(activeTariff.price_per_kwh_grid).toFixed(2)} € = {gridAmount.toFixed(2)} €</p>
                    <p>Grundgebühr: {baseFee.toFixed(2)} €</p>
                    <p className="font-bold pt-1 border-t">Gesamt: {totalAmount.toFixed(2)} €</p>
                  </div>
                </Card>
              )}
              <Button onClick={handleCreate} disabled={!form.tenant_electricity_tenant_id || !activeTariff || createInvoice.isPending} className="w-full">Rechnung erstellen</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>Mieter</TableHead><TableHead>Zeitraum</TableHead><TableHead>Lokal</TableHead><TableHead>Netz</TableHead><TableHead>Gesamt</TableHead><TableHead>Betrag</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium">{(inv as any).tenant_electricity_tenants?.name || "–"} {(inv as any).tenant_electricity_tenants?.unit_label ? `(${(inv as any).tenant_electricity_tenants.unit_label})` : ""}</TableCell>
              <TableCell>{format(new Date(inv.period_start), "dd.MM.")} – {format(new Date(inv.period_end), "dd.MM.yyyy")}</TableCell>
              <TableCell>{Number(inv.local_kwh).toFixed(1)} kWh</TableCell>
              <TableCell>{Number(inv.grid_kwh).toFixed(1)} kWh</TableCell>
              <TableCell>{Number(inv.total_kwh).toFixed(1)} kWh</TableCell>
              <TableCell className="font-medium">{Number(inv.total_amount).toFixed(2)} €</TableCell>
              <TableCell>
                <Badge
                  variant={inv.status === "paid" ? "default" : inv.status === "issued" ? "secondary" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const next = inv.status === "draft" ? "issued" : inv.status === "issued" ? "paid" : inv.status;
                    if (next !== inv.status) updateInvoice.mutate({ id: inv.id, status: next, ...(next === "issued" ? { issued_at: new Date().toISOString() } : {}) });
                  }}
                >
                  {inv.status === "draft" ? "Entwurf" : inv.status === "issued" ? "Gestellt" : inv.status === "paid" ? "Bezahlt" : inv.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {invoices.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Noch keine Rechnungen erstellt</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Settings Tab ──
function SettingsTab() {
  const { settings, upsertSettings } = useTenantElectricitySettings();
  const { locations } = useLocations();
  const { meters } = useMeters();
  const [form, setForm] = useState({
    location_id: settings?.location_id || "",
    pv_meter_id: settings?.pv_meter_id || "",
    grid_meter_id: settings?.grid_meter_id || "",
    allocation_method: settings?.allocation_method || "proportional",
    billing_period: settings?.billing_period || "monthly",
  });

  // Sync form with loaded settings
  useState(() => {
    if (settings) setForm({
      location_id: settings.location_id || "",
      pv_meter_id: settings.pv_meter_id || "",
      grid_meter_id: settings.grid_meter_id || "",
      allocation_method: settings.allocation_method || "proportional",
      billing_period: settings.billing_period || "monthly",
    });
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Mieterstrom-Einstellungen</h2>
      <div className="space-y-4">
        <div><Label>Standort</Label>
          <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
            <SelectTrigger><SelectValue placeholder="Standort wählen" /></SelectTrigger>
            <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label><Sun className="inline h-3 w-3 mr-1" />PV-Erzeugungszähler</Label>
            <Select value={form.pv_meter_id} onValueChange={(v) => setForm({ ...form, pv_meter_id: v })}>
              <SelectTrigger><SelectValue placeholder="Zähler wählen" /></SelectTrigger>
              <SelectContent>{meters.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label><Plug2 className="inline h-3 w-3 mr-1" />Netzbezugszähler</Label>
            <Select value={form.grid_meter_id} onValueChange={(v) => setForm({ ...form, grid_meter_id: v })}>
              <SelectTrigger><SelectValue placeholder="Zähler wählen" /></SelectTrigger>
              <SelectContent>{meters.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Verteilmethode</Label>
            <Select value={form.allocation_method} onValueChange={(v) => setForm({ ...form, allocation_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proportional">Proportional (nach Verbrauch)</SelectItem>
                <SelectItem value="metered">Direkt gemessen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Abrechnungszeitraum</Label>
            <Select value={form.billing_period} onValueChange={(v) => setForm({ ...form, billing_period: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="quarterly">Quartalsweise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => upsertSettings.mutate(form)} disabled={upsertSettings.isPending}>Einstellungen speichern</Button>
      </div>
    </div>
  );
}

export default TenantElectricity;
