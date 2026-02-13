import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSATranslation } from "@/hooks/useSATranslation";
import { useChargerModels, ChargerModel } from "@/hooks/useChargerModels";
import { SuperAdminWrapper } from "@/components/super-admin/SuperAdminWrapper";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, PlugZap } from "lucide-react";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";

const PROTOCOLS = [
  { value: "ocpp1.6", label: "OCPP 1.6 JSON" },
  { value: "ocpp2.0.1", label: "OCPP 2.0.1" },
  { value: "proprietary", label: "Proprietär" },
];

const emptyForm = { vendor: "", model: "", protocol: "ocpp1.6", notes: "", is_active: true };

const SuperAdminOcppIntegrations = () => {
  const { user, loading } = useAuth();
  const { t } = useSATranslation();
  const { chargerModels, isLoading, addModel, updateModel, deleteModel } = useChargerModels();

  const [addOpen, setAddOpen] = useState(false);
  const [editModel, setEditModel] = useState<ChargerModel | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterVendor, setFilterVendor] = useState<string | null>(null);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const vendors = [...new Set(chargerModels.map(m => m.vendor))].sort();
  const filtered = filterVendor ? chargerModels.filter(m => m.vendor === filterVendor) : chargerModels;

  const resetForm = () => setForm(emptyForm);

  const handleAdd = () => {
    addModel.mutate({
      vendor: form.vendor.trim(),
      model: form.model.trim(),
      protocol: form.protocol,
      notes: form.notes || undefined,
    });
    setAddOpen(false);
    resetForm();
  };

  const handleEdit = () => {
    if (!editModel) return;
    updateModel.mutate({
      id: editModel.id,
      vendor: form.vendor.trim(),
      model: form.model.trim(),
      protocol: form.protocol,
      notes: form.notes || null,
      is_active: form.is_active,
    });
    setEditModel(null);
    resetForm();
  };

  const openEdit = (m: ChargerModel) => {
    setForm({
      vendor: m.vendor,
      model: m.model,
      protocol: m.protocol,
      notes: m.notes || "",
      is_active: m.is_active,
    });
    setEditModel(m);
  };

  const formFields = (isEdit: boolean) => (
    <div className="space-y-4">
      <div>
        <Label>Hersteller *</Label>
        <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="z.B. ABB, Alfen, Keba, Wallbe" />
      </div>
      <div>
        <Label>Modell *</Label>
        <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="z.B. Terra AC W22-T-RD-M-0" />
      </div>
      <div>
        <Label>Kommunikationsprotokoll</Label>
        <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROTOCOLS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Hinweise / Besonderheiten</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="z.B. Firmware-Besonderheiten, spezielle Konfiguration..."
          rows={3}
        />
      </div>
      {isEdit && (
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Aktiv (im Dropdown sichtbar)</Label>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: `hsl(var(--sa-background))`, color: `hsl(var(--sa-foreground))` }}>
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t("ocpp.integrations_title")}</h1>
              <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>{t("ocpp.integrations_subtitle")}</p>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} style={{ backgroundColor: `hsl(var(--sa-primary))`, color: `hsl(var(--sa-primary-foreground))` }}>
                  <Plus className="h-4 w-4 mr-2" />Modell hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Neues Ladestationsmodell</DialogTitle></DialogHeader>
                {formFields(false)}
                <Button onClick={handleAdd} disabled={!form.vendor.trim() || !form.model.trim()}>Erstellen</Button>
              </DialogContent>
            </Dialog>
          </div>

          {/* Vendor filter */}
          {vendors.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant={filterVendor === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterVendor(null)}
              >
                Alle ({chargerModels.length})
              </Badge>
              {vendors.map((v) => (
                <Badge
                  key={v}
                  variant={filterVendor === v ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setFilterVendor(filterVendor === v ? null : v)}
                >
                  {v} ({chargerModels.filter(m => m.vendor === v).length})
                </Badge>
              ))}
            </div>
          )}

          <Card style={{ backgroundColor: `hsl(var(--sa-card))`, borderColor: `hsl(var(--sa-border))` }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="h-5 w-5" />
                Ladestationsmodelle
              </CardTitle>
              <CardDescription>
                Hier hinterlegte Modelle stehen im User-Backend bei der Einrichtung von Ladepunkten als Dropdown zur Verfügung.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>Laden...</p>
              ) : filtered.length === 0 ? (
                <p style={{ color: `hsl(var(--sa-muted-foreground))` }}>Keine Modelle vorhanden.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hersteller</TableHead>
                      <TableHead>Modell</TableHead>
                      <TableHead>Protokoll</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hinweise</TableHead>
                      <TableHead className="w-24">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.vendor}</TableCell>
                        <TableCell>{m.model}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{PROTOCOLS.find(p => p.value === m.protocol)?.label || m.protocol}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.is_active ? "default" : "secondary"}>
                            {m.is_active ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={m.notes || ""}>
                          {m.notes || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteModel.mutate(m.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          <Dialog open={!!editModel} onOpenChange={(open) => { if (!open) setEditModel(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Modell bearbeiten</DialogTitle></DialogHeader>
              {formFields(true)}
              <Button onClick={handleEdit} disabled={!form.vendor.trim() || !form.model.trim()}>Speichern</Button>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminOcppIntegrations;
