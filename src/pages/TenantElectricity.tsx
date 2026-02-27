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
import { Home, Users, Receipt, Settings, Plus, Trash2, FileText, Sun, Plug2, Archive, ArchiveRestore, X, Smartphone, ExternalLink, Copy, Check, Link, QrCode } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenantElectricityTenants } from "@/hooks/useTenantElectricityTenants";
import { useTenantElectricityTariffs } from "@/hooks/useTenantElectricityTariffs";
import { useTenantElectricityInvoices } from "@/hooks/useTenantElectricityInvoices";
import { useTenantElectricitySettings } from "@/hooks/useTenantElectricitySettings";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { format } from "date-fns";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";

const T = (t: (k: any) => string, key: string) => t(key as any);

const TenantElectricity = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("nav.tenantElectricity")}</h1>
          <p className="text-muted-foreground">{T(t, "te.subtitle")}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">{T(t, "te.tabOverview")}</TabsTrigger>
            <TabsTrigger value="tenants">{T(t, "te.tabTenants")}</TabsTrigger>
            <TabsTrigger value="tariffs">{T(t, "te.tabTariffs")}</TabsTrigger>
            <TabsTrigger value="invoices">{T(t, "te.tabInvoices")}</TabsTrigger>
            <TabsTrigger value="settings">{T(t, "te.tabSettings")}</TabsTrigger>
            <TabsTrigger value="app" className="gap-1.5"><Smartphone className="h-4 w-4" />{T(t, "te.tabApp")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="tenants"><TenantsTab /></TabsContent>
          <TabsContent value="tariffs"><TariffsTab /></TabsContent>
          <TabsContent value="invoices"><InvoicesTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
          <TabsContent value="app"><MeinStromAppTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ── Overview ──
function OverviewTab() {
  const { t } = useTranslation();
  const { activeTenants } = useTenantElectricityTenants();
  const { tariffs } = useTenantElectricityTariffs();
  const { totalRevenue, invoices } = useTenantElectricityInvoices();

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardDescription>{T(t, "te.activeTenants")}</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" />{activeTenants.length}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardDescription>{T(t, "te.activeTariffs")}</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold">{tariffs.length}</div>
          <p className="text-xs text-muted-foreground">{tariffs.length === 0 ? T(t, "te.noTariffs") : T(t, "te.tariffsConfigured").replace("{count}", String(tariffs.length))}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardDescription>{T(t, "te.invoicesCount")}</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold">{invoices.length}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardDescription>{T(t, "te.revenue")}</CardDescription></CardHeader>
        <CardContent><div className="text-2xl font-bold">{totalRevenue.toFixed(2)} €</div></CardContent>
      </Card>
    </div>
  );
}

// ── Tenants Tab ──
function TenantsTab() {
  const { t } = useTranslation();
  const { tenants, activeTenants, archivedTenants, createTenant, updateTenant, archiveTenant } = useTenantElectricityTenants();
  const { locations } = useLocations();
  const { meters } = useMeters();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: "", unit_label: "", email: "", location_id: "", meter_ids: [] as string[], move_in_date: "", is_mieterstrom: false });
  const [editForm, setEditForm] = useState({ name: "", unit_label: "", email: "", location_id: "", meter_ids: [] as string[], move_in_date: "", move_out_date: "", is_mieterstrom: false });

  const toggleMeter = (meterId: string, isEdit: boolean) => {
    if (isEdit) {
      setEditForm((f) => ({ ...f, meter_ids: f.meter_ids.includes(meterId) ? f.meter_ids.filter((id) => id !== meterId) : [...f.meter_ids, meterId] }));
    } else {
      setForm((f) => ({ ...f, meter_ids: f.meter_ids.includes(meterId) ? f.meter_ids.filter((id) => id !== meterId) : [...f.meter_ids, meterId] }));
    }
  };

  const handleCreate = () => {
    createTenant.mutate({
      name: form.name, unit_label: form.unit_label || undefined, email: form.email || undefined,
      location_id: form.location_id, meter_ids: form.meter_ids.length > 0 ? form.meter_ids : undefined,
      move_in_date: form.move_in_date || undefined, is_mieterstrom: form.is_mieterstrom,
    }, { onSuccess: () => { setOpen(false); setForm({ name: "", unit_label: "", email: "", location_id: "", meter_ids: [], move_in_date: "", is_mieterstrom: false }); } });
  };

  const openEdit = (te: any) => {
    setEditTenant(te);
    setEditForm({
      name: te.name || "", unit_label: te.unit_label || "", email: te.email || "",
      location_id: te.location_id || "",
      meter_ids: (te.assigned_meters || []).map((am: any) => am.meter_id),
      move_in_date: te.move_in_date || "", move_out_date: te.move_out_date || "",
      is_mieterstrom: !!(te as any).is_mieterstrom,
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
      is_mieterstrom: editForm.is_mieterstrom,
    }, { onSuccess: () => setEditOpen(false) });
  };

  const handleReactivate = (id: string) => {
    updateTenant.mutate({ id, status: "active", move_out_date: null });
  };

  const displayedTenants = showArchived ? archivedTenants : activeTenants;

  const MeterSelector = ({ selectedIds, isEdit, locationId }: { selectedIds: string[]; isEdit: boolean; locationId: string }) => {
    const filteredMeters = locationId ? meters.filter((m) => m.location_id === locationId) : [];
    return (
      <div>
        <Label>{T(t, "te.assignMeters")}</Label>
        <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
          {!locationId && <p className="text-sm text-muted-foreground p-1">{T(t, "te.selectLocationFirst")}</p>}
          {locationId && filteredMeters.length === 0 && <p className="text-sm text-muted-foreground p-1">{T(t, "te.noMetersAtLocation")}</p>}
          {filteredMeters.map((m) => (
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
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{T(t, "te.tenantManagement")}</h2>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            <Archive className="h-4 w-4 mr-1" />
            {T(t, "te.archive")} {archivedTenants.length > 0 && `(${archivedTenants.length})`}
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{T(t, "te.createTenant")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{T(t, "te.newTenant")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("common.name" as any)}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>{T(t, "te.unit")}</Label><Input value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} /></div>
              </div>
              <div><Label>{t("common.email" as any)}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>{t("common.location" as any)}</Label>
                <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v, meter_ids: [] })}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectLocation" as any)} /></SelectTrigger>
                  <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <MeterSelector selectedIds={form.meter_ids} isEdit={false} locationId={form.location_id} />
              <div><Label>{T(t, "te.moveInDate")}</Label><Input type="date" value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <Checkbox checked={form.is_mieterstrom} onCheckedChange={(v) => setForm({ ...form, is_mieterstrom: !!v })} />
                <span className="text-sm font-medium">{T(t, "te.mieterstrom")}</span>
                <span className="text-xs text-muted-foreground">{T(t, "te.mieterstromDesc")}</span>
              </label>
              <Button onClick={handleCreate} disabled={!form.name || !form.location_id || createTenant.isPending} className="w-full">{t("common.save" as any)}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T(t, "te.editTenant")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("common.name" as any)}</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
              <div><Label>{T(t, "te.unitLabel")}</Label><Input value={editForm.unit_label} onChange={(e) => setEditForm({ ...editForm, unit_label: e.target.value })} /></div>
            </div>
            <div><Label>{t("common.email" as any)}</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><Label>{t("common.location" as any)}</Label>
              <Select value={editForm.location_id} onValueChange={(v) => setEditForm({ ...editForm, location_id: v, meter_ids: [] })}>
                <SelectTrigger><SelectValue placeholder={t("common.selectLocation" as any)} /></SelectTrigger>
                <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <MeterSelector selectedIds={editForm.meter_ids} isEdit={true} locationId={editForm.location_id} />
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{T(t, "te.moveInDate")}</Label><Input type="date" value={editForm.move_in_date} onChange={(e) => setEditForm({ ...editForm, move_in_date: e.target.value })} /></div>
              <div><Label>{T(t, "te.moveOutDate")}</Label><Input type="date" value={editForm.move_out_date} onChange={(e) => setEditForm({ ...editForm, move_out_date: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <Checkbox checked={editForm.is_mieterstrom} onCheckedChange={(v) => setEditForm({ ...editForm, is_mieterstrom: !!v })} />
              <span className="text-sm font-medium">{T(t, "te.mieterstrom")}</span>
              <span className="text-xs text-muted-foreground">{T(t, "te.mieterstromDesc")}</span>
            </label>
            <Button onClick={handleUpdate} disabled={!editForm.name || !editForm.location_id || updateTenant.isPending} className="w-full">{T(t, "te.saveChanges")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name" as any)}</TableHead><TableHead>{T(t, "te.unitLabel")}</TableHead><TableHead>{t("common.email" as any)}</TableHead><TableHead>{T(t, "te.meters")}</TableHead><TableHead>{T(t, "te.moveIn")}</TableHead>{showArchived && <TableHead>{T(t, "te.moveOut")}</TableHead>}<TableHead>{t("common.status" as any)}</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {displayedTenants.map((te) => (
            <TableRow key={te.id} className={te.status === "archived" ? "opacity-60" : ""}>
              <TableCell className="font-medium"><button className="hover:underline text-left cursor-pointer text-primary" onClick={() => openEdit(te)}>{te.name}</button></TableCell>
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
                  {te.status === "active" ? T(t, "te.statusActive") : T(t, "te.statusArchived")}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {te.status === "active" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title={T(t, "te.archive")}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{T(t, "te.archiveTenant")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            <strong>{te.name}</strong> {te.unit_label ? `(${te.unit_label})` : ""} {T(t, "te.archiveTenantDesc")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel" as any)}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => archiveTenant.mutate(te.id)}>{T(t, "te.archive")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => handleReactivate(te.id)} title={T(t, "te.statusActive")}>
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {displayedTenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={showArchived ? 8 : 7} className="text-center text-muted-foreground py-8">
                {showArchived ? T(t, "te.noArchivedTenants") : T(t, "te.noTenantsYet")}
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
  const { t } = useTranslation();
  const { tariffs, createTariff, updateTariff, deleteTariff } = useTenantElectricityTariffs();
  const { locations } = useLocations();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTariff, setEditTariff] = useState<any>(null);
  const [form, setForm] = useState({ name: "", price_per_kwh_local: 0.22, price_per_kwh_grid: 0.35, base_fee_monthly: 5.0, location_id: "", valid_from: new Date().toISOString().split("T")[0], valid_until: "" });
  const [editForm, setEditForm] = useState({ name: "", price_per_kwh_local: 0, price_per_kwh_grid: 0, base_fee_monthly: 0, location_id: "", valid_from: "", valid_until: "" });

  const handleCreate = () => {
    createTariff.mutate({
      name: form.name, price_per_kwh_local: form.price_per_kwh_local, price_per_kwh_grid: form.price_per_kwh_grid,
      base_fee_monthly: form.base_fee_monthly, location_id: form.location_id, valid_from: form.valid_from,
      valid_until: form.valid_until || undefined,
    }, { onSuccess: () => { setOpen(false); setForm({ name: "", price_per_kwh_local: 0.22, price_per_kwh_grid: 0.35, base_fee_monthly: 5.0, location_id: "", valid_from: new Date().toISOString().split("T")[0], valid_until: "" }); } });
  };

  const openEdit = (tariff: any) => {
    setEditTariff(tariff);
    setEditForm({
      name: tariff.name || "", price_per_kwh_local: Number(tariff.price_per_kwh_local),
      price_per_kwh_grid: Number(tariff.price_per_kwh_grid), base_fee_monthly: Number(tariff.base_fee_monthly),
      location_id: tariff.location_id || "", valid_from: tariff.valid_from || "", valid_until: tariff.valid_until || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editTariff) return;
    updateTariff.mutate({
      id: editTariff.id, name: editForm.name, price_per_kwh_local: editForm.price_per_kwh_local,
      price_per_kwh_grid: editForm.price_per_kwh_grid, base_fee_monthly: editForm.base_fee_monthly,
      location_id: editForm.location_id, valid_from: editForm.valid_from, valid_until: editForm.valid_until || null,
    }, { onSuccess: () => setEditOpen(false) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{T(t, "te.tariffManagement")}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{T(t, "te.createTariff")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{T(t, "te.newTariff")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{T(t, "te.tariffName")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>{t("common.location" as any)}</Label>
                <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectLocation" as any)} /></SelectTrigger>
                  <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>{T(t, "te.localElectricity")}</Label><Input type="number" step="0.01" value={form.price_per_kwh_local} onChange={(e) => setForm({ ...form, price_per_kwh_local: Number(e.target.value) })} /></div>
                <div><Label>{T(t, "te.gridElectricity")}</Label><Input type="number" step="0.01" value={form.price_per_kwh_grid} onChange={(e) => setForm({ ...form, price_per_kwh_grid: Number(e.target.value) })} /></div>
                <div><Label>{T(t, "te.baseFeeMonthly")}</Label><Input type="number" step="0.5" value={form.base_fee_monthly} onChange={(e) => setForm({ ...form, base_fee_monthly: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{T(t, "te.validFrom")}</Label><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
                <div><Label>{T(t, "te.validUntilOpt")}</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
              </div>
              <Button onClick={handleCreate} disabled={!form.name || !form.location_id || createTariff.isPending} className="w-full">{t("common.save" as any)}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T(t, "te.editTariff")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{T(t, "te.tariffName")}</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><Label>{t("common.location" as any)}</Label>
              <Select value={editForm.location_id} onValueChange={(v) => setEditForm({ ...editForm, location_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("common.selectLocation" as any)} /></SelectTrigger>
                <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>{T(t, "te.localElectricity")}</Label><Input type="number" step="0.01" value={editForm.price_per_kwh_local} onChange={(e) => setEditForm({ ...editForm, price_per_kwh_local: Number(e.target.value) })} /></div>
              <div><Label>{T(t, "te.gridElectricity")}</Label><Input type="number" step="0.01" value={editForm.price_per_kwh_grid} onChange={(e) => setEditForm({ ...editForm, price_per_kwh_grid: Number(e.target.value) })} /></div>
              <div><Label>{T(t, "te.baseFeeMonthly")}</Label><Input type="number" step="0.5" value={editForm.base_fee_monthly} onChange={(e) => setEditForm({ ...editForm, base_fee_monthly: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{T(t, "te.validFrom")}</Label><Input type="date" value={editForm.valid_from} onChange={(e) => setEditForm({ ...editForm, valid_from: e.target.value })} /></div>
              <div><Label>{T(t, "te.validUntilOpt")}</Label><Input type="date" value={editForm.valid_until} onChange={(e) => setEditForm({ ...editForm, valid_until: e.target.value })} /></div>
            </div>
            <Button onClick={handleUpdate} disabled={!editForm.name || !editForm.location_id || updateTariff.isPending} className="w-full">{T(t, "te.saveChanges")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground"><Sun className="inline h-4 w-4 mr-1" />{T(t, "te.mieterstromHint")}</p>
      </Card>

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name" as any)}</TableHead><TableHead>{t("common.location" as any)}</TableHead><TableHead>{T(t, "te.local")}</TableHead><TableHead>{T(t, "te.grid")}</TableHead><TableHead>{T(t, "te.baseFee")}</TableHead><TableHead>{T(t, "te.validFrom")}</TableHead><TableHead>{T(t, "te.validUntilOpt")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {tariffs.map((tariff: any) => (
            <TableRow key={tariff.id}>
              <TableCell className="font-medium"><button className="hover:underline text-left cursor-pointer text-primary" onClick={() => openEdit(tariff)}>{tariff.name}</button></TableCell>
              <TableCell>{tariff.locations?.name || "–"}</TableCell>
              <TableCell>{Number(tariff.price_per_kwh_local).toFixed(2)}</TableCell>
              <TableCell>{Number(tariff.price_per_kwh_grid).toFixed(2)}</TableCell>
              <TableCell>{Number(tariff.base_fee_monthly).toFixed(2)} €</TableCell>
              <TableCell>{format(new Date(tariff.valid_from), "dd.MM.yyyy")}</TableCell>
              <TableCell>{tariff.valid_until ? format(new Date(tariff.valid_until), "dd.MM.yyyy") : T(t, "te.unlimited")}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => deleteTariff.mutate(tariff.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {tariffs.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{T(t, "te.noTariffsYet")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Invoices Tab ──
function InvoicesTab() {
  const { t } = useTranslation();
  const { invoices, createInvoice, updateInvoice } = useTenantElectricityInvoices();
  const { activeTenants } = useTenantElectricityTenants();
  const { tariffs, getActiveTariffForLocation } = useTenantElectricityTariffs();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tenant_electricity_tenant_id: "", period_start: "", period_end: "",
    local_kwh: 0, grid_kwh: 0,
  });

  const selectedTenant = activeTenants.find((te) => te.id === form.tenant_electricity_tenant_id);
  const activeTariff = selectedTenant?.location_id ? getActiveTariffForLocation(selectedTenant.location_id) : undefined;
  const totalKwh = form.local_kwh + form.grid_kwh;
  const localAmount = activeTariff ? form.local_kwh * Number(activeTariff.price_per_kwh_local) : 0;
  const gridAmount = activeTariff ? form.grid_kwh * Number(activeTariff.price_per_kwh_grid) : 0;
  const baseFee = activeTariff ? Number(activeTariff.base_fee_monthly) : 0;
  const totalAmount = localAmount + gridAmount + baseFee;

  const handleCreate = () => {
    if (!activeTariff || !form.tenant_electricity_tenant_id) return;
    createInvoice.mutate({
      tenant_electricity_tenant_id: form.tenant_electricity_tenant_id,
      tariff_id: activeTariff.id, period_start: form.period_start, period_end: form.period_end,
      local_kwh: form.local_kwh, grid_kwh: form.grid_kwh, total_kwh: totalKwh,
      local_amount: localAmount, grid_amount: gridAmount, base_fee: baseFee, total_amount: totalAmount,
    }, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{T(t, "te.invoices")}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{T(t, "te.createInvoice")}</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{T(t, "te.newInvoice")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{T(t, "te.tenant")}</Label>
                <Select value={form.tenant_electricity_tenant_id} onValueChange={(v) => setForm({ ...form, tenant_electricity_tenant_id: v })}>
                  <SelectTrigger><SelectValue placeholder={T(t, "te.selectTenant")} /></SelectTrigger>
                  <SelectContent>{activeTenants.map((te) => <SelectItem key={te.id} value={te.id}>{te.name} {te.unit_label ? `(${te.unit_label})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{T(t, "te.periodFrom")}</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                <div><Label>{T(t, "te.periodTo")}</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label><Sun className="inline h-3 w-3 mr-1" />{T(t, "te.localKwh")}</Label><Input type="number" value={form.local_kwh} onChange={(e) => setForm({ ...form, local_kwh: Number(e.target.value) })} /></div>
                <div><Label><Plug2 className="inline h-3 w-3 mr-1" />{T(t, "te.gridKwh")}</Label><Input type="number" value={form.grid_kwh} onChange={(e) => setForm({ ...form, grid_kwh: Number(e.target.value) })} /></div>
              </div>
              {activeTariff && (
                <Card className="p-3 bg-muted/50">
                  <p className="text-sm font-medium mb-1">{T(t, "te.preview").replace("{name}", activeTariff.name)}</p>
                  <div className="text-xs space-y-1">
                    <p>{T(t, "te.localCalc")}: {form.local_kwh} kWh × {Number(activeTariff.price_per_kwh_local).toFixed(2)} € = {localAmount.toFixed(2)} €</p>
                    <p>{T(t, "te.gridCalc")}: {form.grid_kwh} kWh × {Number(activeTariff.price_per_kwh_grid).toFixed(2)} € = {gridAmount.toFixed(2)} €</p>
                    <p>{T(t, "te.baseFee")}: {baseFee.toFixed(2)} €</p>
                    <p className="font-bold pt-1 border-t">{T(t, "te.total")}: {totalAmount.toFixed(2)} €</p>
                  </div>
                </Card>
              )}
              <Button onClick={handleCreate} disabled={!form.tenant_electricity_tenant_id || !activeTariff || createInvoice.isPending} className="w-full">{T(t, "te.createInvoice")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>{T(t, "te.tenant")}</TableHead><TableHead>{T(t, "te.period")}</TableHead><TableHead>{T(t, "te.localCalc")}</TableHead><TableHead>{T(t, "te.gridCalc")}</TableHead><TableHead>{T(t, "te.total")}</TableHead><TableHead>{T(t, "te.amount")}</TableHead><TableHead>{t("common.status" as any)}</TableHead></TableRow></TableHeader>
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
                  {inv.status === "draft" ? T(t, "te.statusDraft") : inv.status === "issued" ? T(t, "te.statusIssued") : inv.status === "paid" ? T(t, "te.statusPaid") : inv.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {invoices.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{T(t, "te.noInvoicesYet")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Settings Tab ──
function SettingsTab() {
  const { t } = useTranslation();
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

  useState(() => {
    if (settings) setForm({
      location_id: settings.location_id || "", pv_meter_id: settings.pv_meter_id || "",
      grid_meter_id: settings.grid_meter_id || "", allocation_method: settings.allocation_method || "proportional",
      billing_period: settings.billing_period || "monthly",
    });
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">{T(t, "te.settingsTitle")}</h2>
      <div className="space-y-4">
        <div><Label>{t("common.location" as any)}</Label>
          <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
            <SelectTrigger><SelectValue placeholder={t("common.selectLocation" as any)} /></SelectTrigger>
            <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label><Sun className="inline h-3 w-3 mr-1" />{T(t, "te.pvMeter")}</Label>
            <Select value={form.pv_meter_id} onValueChange={(v) => setForm({ ...form, pv_meter_id: v })}>
              <SelectTrigger><SelectValue placeholder={T(t, "te.selectMeter")} /></SelectTrigger>
              <SelectContent>
                {meters
                  .filter((m) => m.location_id === form.location_id && m.meter_function === "generation")
                  .map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label><Plug2 className="inline h-3 w-3 mr-1" />{T(t, "te.gridMeter")}</Label>
            <Select value={form.grid_meter_id} onValueChange={(v) => setForm({ ...form, grid_meter_id: v })}>
              <SelectTrigger><SelectValue placeholder={T(t, "te.selectMeter")} /></SelectTrigger>
              <SelectContent>
                {meters
                  .filter((m) => m.location_id === form.location_id && m.is_main_meter)
                  .map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>{T(t, "te.allocationMethod")}</Label>
            <Select value={form.allocation_method} onValueChange={(v) => setForm({ ...form, allocation_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proportional">{T(t, "te.proportional")}</SelectItem>
                <SelectItem value="metered">{T(t, "te.metered")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{T(t, "te.billingPeriod")}</Label>
            <Select value={form.billing_period} onValueChange={(v) => setForm({ ...form, billing_period: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{T(t, "te.monthly")}</SelectItem>
                <SelectItem value="quarterly">{T(t, "te.quarterly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => upsertSettings.mutate(form)} disabled={upsertSettings.isPending}>{T(t, "te.saveSettings")}</Button>
      </div>
    </div>
  );
}

// ── Mein Strom App Tab ──
const APP_URL_TE = `${window.location.origin}/te`;

function MeinStromAppTab() {
  const { t } = useTranslation();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, APP_URL_TE, { width: 180, margin: 2 });
    }
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="space-y-4 lg:w-72 shrink-0">
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><Link className="h-4 w-4" /> {T(t, "te.appLink")}</h3>
            <div className="flex items-center gap-2">
              <Input value={APP_URL_TE} readOnly className="text-xs font-mono" />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(APP_URL_TE);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full gap-1.5">
              <a href="/te" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                {T(t, "te.openInNewTab")}
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><QrCode className="h-4 w-4" /> {T(t, "te.qrCode")}</h3>
            <div className="flex justify-center">
              <canvas ref={qrCanvasRef} />
            </div>
            <p className="text-xs text-muted-foreground text-center">{T(t, "te.scanToOpen")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="relative" style={{ width: 375, height: 740 }}>
          <div className="absolute inset-0 rounded-[2.5rem] border-[8px] border-foreground/80 bg-background shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/80 rounded-b-2xl z-10" />
            <iframe
              src="/te"
              className="w-full h-full border-0"
              title={T(t, "te.appPreview")}
              style={{ borderRadius: "1.8rem" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TenantElectricity;
