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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Cpu, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CompatibilityEditor } from "@/components/super-admin/CompatibilityEditor";
import { ClassBadge } from "@/components/sales/ClassBadge";

const DEVICE_CLASSES = [
  { value: "meter", label: "Zähler" },
  { value: "gateway", label: "Gateway" },
  { value: "power_supply", label: "Netzteil" },
  { value: "network_switch", label: "Switch" },
  { value: "router", label: "Router" },
  { value: "addon_module", label: "Addon-Modul" },
  { value: "cable", label: "Kabel" },
  { value: "accessory", label: "Zubehör" },
  { value: "misc", label: "Sonstige" },
];

const EINHEITEN = ["Stück", "Meter", "Pauschal"];

interface DeviceCatalog {
  id: string;
  hersteller: string;
  modell: string;
  ek_preis: number;
  vk_preis: number;
  installations_pauschale: number;
  beschreibung: string | null;
  datasheet_url: string | null;
  bild_url: string | null;
  is_active: boolean;
  kompatibilitaet: any;
  geraete_klasse: string;
  einheit: string;
}

interface FormData {
  hersteller: string;
  modell: string;
  ek_preis: string;
  vk_preis: string;
  installations_pauschale: string;
  beschreibung: string;
  datasheet_url: string;
  bild_url: string;
  is_active: boolean;
  geraete_klasse: string;
  einheit: string;
  phasen: string;
  max_strom_a: string;
  montage: string;
  gateway_typ: string;
}

const emptyForm: FormData = {
  hersteller: "",
  modell: "",
  ek_preis: "0",
  vk_preis: "0",
  installations_pauschale: "0",
  beschreibung: "",
  datasheet_url: "",
  bild_url: "",
  is_active: true,
  geraete_klasse: "meter",
  einheit: "Stück",
  phasen: "3",
  max_strom_a: "63",
  montage: "Hutschiene",
  gateway_typ: "",
};

export default function SuperAdminSalesCatalog() {
  const [items, setItems] = useState<DeviceCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("device_catalog")
      .select("*")
      .order("geraete_klasse")
      .order("hersteller")
      .order("modell");
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setItems((data || []) as DeviceCatalog[]);
    }
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

  const openEdit = (item: DeviceCatalog) => {
    setEditingId(item.id);
    const k = item.kompatibilitaet || {};
    setForm({
      hersteller: item.hersteller,
      modell: item.modell,
      ek_preis: String(item.ek_preis),
      vk_preis: String(item.vk_preis),
      installations_pauschale: String(item.installations_pauschale),
      beschreibung: item.beschreibung || "",
      datasheet_url: item.datasheet_url || "",
      bild_url: item.bild_url || "",
      is_active: item.is_active,
      geraete_klasse: item.geraete_klasse || "meter",
      einheit: item.einheit || "Stück",
      phasen: Array.isArray(k.phasen) ? k.phasen.join(",") : (k.phasen ? String(k.phasen) : ""),
      max_strom_a: k.max_strom_a ? String(k.max_strom_a) : "",
      montage: k.montage || "",
      gateway_typ: k.gateway_typ || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.hersteller.trim() || !form.modell.trim()) {
      toast({ title: "Pflichtfelder fehlen", description: "Hersteller und Modell sind erforderlich.", variant: "destructive" });
      return;
    }
    const phasenArr = form.phasen
      .split(",")
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => !isNaN(n));
    const kompatibilitaet: Record<string, any> = {};
    if (phasenArr.length) kompatibilitaet.phasen = phasenArr;
    if (form.max_strom_a) kompatibilitaet.max_strom_a = parseFloat(form.max_strom_a);
    if (form.montage) kompatibilitaet.montage = form.montage;
    if (form.gateway_typ) kompatibilitaet.gateway_typ = form.gateway_typ;

    const payload = {
      hersteller: form.hersteller.trim(),
      modell: form.modell.trim(),
      ek_preis: parseFloat(form.ek_preis) || 0,
      vk_preis: parseFloat(form.vk_preis) || 0,
      installations_pauschale: parseFloat(form.installations_pauschale) || 0,
      beschreibung: form.beschreibung.trim() || null,
      datasheet_url: form.datasheet_url.trim() || null,
      bild_url: form.bild_url.trim() || null,
      is_active: form.is_active,
      geraete_klasse: form.geraete_klasse as any,
      einheit: form.einheit || "Stück",
      kompatibilitaet,
    };

    if (editingId) {
      const { error } = await supabase.from("device_catalog").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Fehler", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Aktualisiert" });
      load();
    } else {
      const { data, error } = await supabase.from("device_catalog").insert(payload).select("id").single();
      if (error) {
        toast({ title: "Fehler", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Angelegt" });
      setEditingId(data.id);
      load();
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("device_catalog").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Gelöscht" });
    }
    setDeleteId(null);
    load();
  };

  const filtered = classFilter === "all" ? items : items.filter((i) => i.geraete_klasse === classFilter);
  const classCounts = DEVICE_CLASSES.map((c) => ({
    ...c,
    count: items.filter((i) => i.geraete_klasse === c.value).length,
  }));

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className="h-7 w-7 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold">Sales – Geräte-Katalog</h1>
                <p className="text-sm text-muted-foreground">
                  Globaler Hardware-Katalog für AICONO Sales Scout
                </p>
              </div>
            </div>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Gerät hinzufügen
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={classFilter === "all" ? "default" : "outline"}
              onClick={() => setClassFilter("all")}
            >
              Alle ({items.length})
            </Button>
            {classCounts.filter((c) => c.count > 0).map((c) => (
              <Button
                key={c.value}
                size="sm"
                variant={classFilter === c.value ? "default" : "outline"}
                onClick={() => setClassFilter(c.value)}
              >
                {c.label} ({c.count})
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Geräte ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-muted-foreground">Lade …</div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  Keine Geräte in dieser Klasse.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Klasse</TableHead>
                      <TableHead>Hersteller / Modell</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead className="text-right">EK €</TableHead>
                      <TableHead className="text-right">VK €</TableHead>
                      <TableHead className="text-right">Installation €</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell><ClassBadge klasse={it.geraete_klasse} /></TableCell>
                        <TableCell>
                          <div className="font-medium">{it.hersteller}</div>
                          <div className="text-xs text-muted-foreground">{it.modell}</div>
                        </TableCell>
                        <TableCell><span className="text-xs">{it.einheit}</span></TableCell>
                        <TableCell className="text-right">{Number(it.ek_preis).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{Number(it.vk_preis).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{Number(it.installations_pauschale).toFixed(2)}</TableCell>
                        <TableCell>
                          {it.is_active ? <Badge>aktiv</Badge> : <Badge variant="outline">inaktiv</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(it)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(it.id)}>
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
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Gerät bearbeiten" : "Neues Gerät"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basis">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basis">Basis & Preise</TabsTrigger>
              <TabsTrigger value="compat" disabled={!editingId}>
                <Link2 className="h-3.5 w-3.5 mr-1" /> Kompatibilität
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basis" className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Geräteklasse *</Label>
                  <Select value={form.geraete_klasse} onValueChange={(v) => setForm({ ...form, geraete_klasse: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_CLASSES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Einheit</Label>
                  <Select value={form.einheit} onValueChange={(v) => setForm({ ...form, einheit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EINHEITEN.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hersteller *</Label>
                  <Input value={form.hersteller} onChange={(e) => setForm({ ...form, hersteller: e.target.value })} placeholder="z. B. Shelly" />
                </div>
                <div>
                  <Label>Modell *</Label>
                  <Input value={form.modell} onChange={(e) => setForm({ ...form, modell: e.target.value })} placeholder="z. B. Pro 3EM" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>EK-Preis €</Label>
                  <Input type="number" step="0.01" value={form.ek_preis} onChange={(e) => setForm({ ...form, ek_preis: e.target.value })} />
                </div>
                <div>
                  <Label>VK-Preis €</Label>
                  <Input type="number" step="0.01" value={form.vk_preis} onChange={(e) => setForm({ ...form, vk_preis: e.target.value })} />
                </div>
                <div>
                  <Label>Installation €</Label>
                  <Input type="number" step="0.01" value={form.installations_pauschale} onChange={(e) => setForm({ ...form, installations_pauschale: e.target.value })} />
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium">Tech-Specs (für Auswahl-Regeln)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Phasen (Komma)</Label>
                    <Input value={form.phasen} onChange={(e) => setForm({ ...form, phasen: e.target.value })} placeholder="1,3" />
                  </div>
                  <div>
                    <Label>Max. Strom (A)</Label>
                    <Input type="number" value={form.max_strom_a} onChange={(e) => setForm({ ...form, max_strom_a: e.target.value })} />
                  </div>
                  <div>
                    <Label>Montage</Label>
                    <Input value={form.montage} onChange={(e) => setForm({ ...form, montage: e.target.value })} placeholder="Hutschiene / Aufputz" />
                  </div>
                  <div>
                    <Label>Gateway-Typ</Label>
                    <Input value={form.gateway_typ} onChange={(e) => setForm({ ...form, gateway_typ: e.target.value })} placeholder="Loxone / Shelly / …" />
                  </div>
                </div>
              </div>

              <div>
                <Label>Beschreibung</Label>
                <Textarea value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Datasheet URL</Label>
                  <Input value={form.datasheet_url} onChange={(e) => setForm({ ...form, datasheet_url: e.target.value })} />
                </div>
                <div>
                  <Label>Bild URL</Label>
                  <Input value={form.bild_url} onChange={(e) => setForm({ ...form, bild_url: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Aktiv (in Vorschlägen verwenden)</Label>
              </div>
            </TabsContent>

            <TabsContent value="compat" className="py-2">
              {editingId ? (
                <CompatibilityEditor sourceDeviceId={editingId} />
              ) : (
                <div className="text-sm text-muted-foreground">Erst speichern, dann Kompatibilität pflegen.</div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Schließen</Button>
            <Button onClick={save}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerät löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Bestehende Empfehlungen, die dieses Gerät referenzieren, werden ebenfalls entfernt.
            </AlertDialogDescription>
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
