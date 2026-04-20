import { useEffect, useState } from "react";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ListChecks } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Rule {
  id: string;
  name: string;
  beschreibung: string | null;
  bedingung: any;
  device_catalog_id: string;
  prio: number;
  is_active: boolean;
}

interface Device {
  id: string;
  hersteller: string;
  modell: string;
}

interface FormData {
  name: string;
  beschreibung: string;
  device_catalog_id: string;
  prio: string;
  is_active: boolean;
  // Bedingung (flat)
  phasen: string;
  min_strom_a: string;
  max_strom_a: string;
  montage: string;
  gateway_typ: string;
  anwendungsfall: string;
}

const emptyForm: FormData = {
  name: "",
  beschreibung: "",
  device_catalog_id: "",
  prio: "100",
  is_active: true,
  phasen: "",
  min_strom_a: "",
  max_strom_a: "",
  montage: "",
  gateway_typ: "",
  anwendungsfall: "",
};

export default function SuperAdminSalesRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [rulesRes, devicesRes] = await Promise.all([
      supabase.from("device_selection_rules").select("*").order("prio").order("name"),
      supabase.from("device_catalog").select("id,hersteller,modell").order("hersteller").order("modell"),
    ]);
    if (rulesRes.error) toast({ title: "Fehler", description: rulesRes.error.message, variant: "destructive" });
    else setRules((rulesRes.data || []) as Rule[]);
    if (devicesRes.error) toast({ title: "Fehler", description: devicesRes.error.message, variant: "destructive" });
    else setDevices((devicesRes.data || []) as Device[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditingId(r.id);
    const b = r.bedingung || {};
    setForm({
      name: r.name,
      beschreibung: r.beschreibung || "",
      device_catalog_id: r.device_catalog_id,
      prio: String(r.prio),
      is_active: r.is_active,
      phasen: Array.isArray(b.phasen) ? b.phasen.join(",") : (b.phasen ? String(b.phasen) : ""),
      min_strom_a: b.min_strom_a != null ? String(b.min_strom_a) : "",
      max_strom_a: b.max_strom_a != null ? String(b.max_strom_a) : "",
      montage: b.montage || "",
      gateway_typ: b.gateway_typ || "",
      anwendungsfall: b.anwendungsfall || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.device_catalog_id) {
      toast({ title: "Pflichtfelder fehlen", description: "Name und Gerät sind erforderlich.", variant: "destructive" });
      return;
    }
    const phasenArr = form.phasen
      .split(",")
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => !isNaN(n));
    const bedingung: Record<string, any> = {};
    if (phasenArr.length) bedingung.phasen = phasenArr;
    if (form.min_strom_a) bedingung.min_strom_a = parseFloat(form.min_strom_a);
    if (form.max_strom_a) bedingung.max_strom_a = parseFloat(form.max_strom_a);
    if (form.montage) bedingung.montage = form.montage;
    if (form.gateway_typ) bedingung.gateway_typ = form.gateway_typ;
    if (form.anwendungsfall) bedingung.anwendungsfall = form.anwendungsfall;

    const payload = {
      name: form.name.trim(),
      beschreibung: form.beschreibung.trim() || null,
      device_catalog_id: form.device_catalog_id,
      prio: parseInt(form.prio, 10) || 100,
      is_active: form.is_active,
      bedingung,
    };

    const { error } = editingId
      ? await supabase.from("device_selection_rules").update(payload).eq("id", editingId)
      : await supabase.from("device_selection_rules").insert(payload);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Aktualisiert" : "Angelegt" });
    setDialogOpen(false);
    load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("device_selection_rules").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Gelöscht" });
    }
    setDeleteId(null);
    load();
  };

  const deviceLabel = (id: string) => {
    const d = devices.find((x) => x.id === id);
    return d ? `${d.hersteller} ${d.modell}` : "—";
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ListChecks className="h-7 w-7 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold">Sales – Auswahl-Regeln</h1>
                <p className="text-sm text-muted-foreground">
                  Regelwerk für automatische Geräte-Empfehlungen (niedrigere Prio = wird zuerst geprüft)
                </p>
              </div>
            </div>
            <Button onClick={openNew} disabled={devices.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Regel hinzufügen
            </Button>
          </div>

          {devices.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                Bitte zuerst im Geräte-Katalog Geräte anlegen.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Regeln ({rules.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-muted-foreground">Lade …</div>
              ) : rules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  Noch keine Regeln angelegt.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Prio</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Bedingung</TableHead>
                      <TableHead>→ Gerät</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => {
                      const b = r.bedingung || {};
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-sm">{r.prio}</TableCell>
                          <TableCell>
                            <div className="font-medium">{r.name}</div>
                            {r.beschreibung && (
                              <div className="text-xs text-muted-foreground">{r.beschreibung}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {b.phasen && (
                                <Badge variant="outline">
                                  {Array.isArray(b.phasen) ? b.phasen.join("/") : b.phasen}-phasig
                                </Badge>
                              )}
                              {b.min_strom_a != null && <Badge variant="outline">≥ {b.min_strom_a} A</Badge>}
                              {b.max_strom_a != null && <Badge variant="outline">≤ {b.max_strom_a} A</Badge>}
                              {b.montage && <Badge variant="outline">{b.montage}</Badge>}
                              {b.gateway_typ && <Badge variant="secondary">{b.gateway_typ}</Badge>}
                              {b.anwendungsfall && <Badge variant="secondary">{b.anwendungsfall}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{deviceLabel(r.device_catalog_id)}</TableCell>
                          <TableCell>
                            {r.is_active ? <Badge>aktiv</Badge> : <Badge variant="outline">inaktiv</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Regel bearbeiten" : "Neue Regel"}</DialogTitle>
            <DialogDescription>
              Alle gesetzten Felder müssen auf den Messpunkt zutreffen, damit das Gerät vorgeschlagen wird. Leere Felder werden ignoriert.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. 3-phasig Standard ≤63A Hutschiene" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gerät *</Label>
                <Select value={form.device_catalog_id} onValueChange={(v) => setForm({ ...form, device_catalog_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Gerät wählen" /></SelectTrigger>
                  <SelectContent>
                    {devices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.hersteller} {d.modell}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priorität</Label>
                <Input type="number" value={form.prio} onChange={(e) => setForm({ ...form, prio: e.target.value })} />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-medium">Bedingung (Messpunkt-Eigenschaften)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phasen (Komma-getrennt)</Label>
                  <Input value={form.phasen} onChange={(e) => setForm({ ...form, phasen: e.target.value })} placeholder="z. B. 3 oder 1,3" />
                </div>
                <div>
                  <Label>Anwendungsfall</Label>
                  <Input value={form.anwendungsfall} onChange={(e) => setForm({ ...form, anwendungsfall: e.target.value })} placeholder="Hauptzähler / Abgang / Maschine" />
                </div>
                <div>
                  <Label>Min. Strom (A)</Label>
                  <Input type="number" value={form.min_strom_a} onChange={(e) => setForm({ ...form, min_strom_a: e.target.value })} />
                </div>
                <div>
                  <Label>Max. Strom (A)</Label>
                  <Input type="number" value={form.max_strom_a} onChange={(e) => setForm({ ...form, max_strom_a: e.target.value })} />
                </div>
                <div>
                  <Label>Montage</Label>
                  <Input value={form.montage} onChange={(e) => setForm({ ...form, montage: e.target.value })} placeholder="Hutschiene / Aufputz / Klemme" />
                </div>
                <div>
                  <Label>Gateway-Typ</Label>
                  <Input value={form.gateway_typ} onChange={(e) => setForm({ ...form, gateway_typ: e.target.value })} placeholder="Shelly / Loxone / Siemens / Unabhängig" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Aktiv</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={save}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regel löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
