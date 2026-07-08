import { useEffect, useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Cpu, Link2, Globe2, Save, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CompatibilityEditor } from "@/components/super-admin/CompatibilityEditor";
import { ClassBadge } from "@/components/sales/ClassBadge";
import { CatalogImportDialog } from "@/components/sales/CatalogImportDialog";
import { parseDeNumber, formatEur2, round2 } from "@/lib/salesNumberFormat";

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
  { value: "none", label: "Ohne" },
];
// Sentinel für "keine Geräteklasse" im Select (leere Strings sind in Radix Select verboten)
const NO_CLASS = "none";

const EINHEITEN = ["Stück", "Meter", "Pauschal"];

interface DeviceCatalog {
  id: string;
  hersteller: string;
  modell: string;
  artikelnummer: string | null;
  ean: string | null;
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
  owner_scope: "global" | "partner";
  partner_id: string | null;
}

interface PriceOverride {
  id: string;
  device_catalog_id: string;
  ek_preis: number | null;
  vk_preis: number | null;
  installations_pauschale: number | null;
}

interface FormData {
  hersteller: string;
  modell: string;
  artikelnummer: string;
  ean: string;
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
  artikelnummer: "",
  ean: "",
  ek_preis: "0",
  vk_preis: "0",
  installations_pauschale: "0",
  beschreibung: "",
  datasheet_url: "",
  bild_url: "",
  is_active: true,
  geraete_klasse: NO_CLASS,
  einheit: "Stück",
  phasen: "3",
  max_strom_a: "63",
  montage: "Hutschiene",
  gateway_typ: "",
};

export interface SalesCatalogManagerProps {
  /** 'global' = Super-Admin, 'partner' = Partner-Portal */
  scope: "global" | "partner";
  /** Pflicht im Partner-Modus: eigene Partner-ID. */
  partnerId?: string | null;
  /** Wenn false → komplett read-only (keine Bearbeitung erlaubt). */
  canManage?: boolean;
}

export function SalesCatalogManager({ scope, partnerId, canManage = true }: SalesCatalogManagerProps) {
  const [items, setItems] = useState<DeviceCatalog[]>([]);
  const [overrides, setOverrides] = useState<Record<string, PriceOverride>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");
  // Partner: Tab zwischen eigenen Artikeln und globalen Artikeln mit Override
  const [tab, setTab] = useState<"own" | "global">("own");
  const [importOpen, setImportOpen] = useState(false);

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

    if (scope === "partner" && partnerId) {
      const { data: ov } = await supabase
        .from("device_catalog_partner_pricing")
        .select("*")
        .eq("partner_id", partnerId);
      const map: Record<string, PriceOverride> = {};
      (ov || []).forEach((o: any) => { map[o.device_catalog_id] = o; });
      setOverrides(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, partnerId]);

  // Sicherheitsnetz: Partner-Modus erfordert partnerId
  if (scope === "partner" && !partnerId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Kein Partner-Kontext gefunden.
        </CardContent>
      </Card>
    );
  }

  // Filter: im Partner-Modus splitten in own vs. global; Super-Admin sieht alles
  const ownItems = items.filter((i) => i.owner_scope === "partner" && i.partner_id === partnerId);
  const globalItems = items.filter((i) => i.owner_scope === "global");
  const baseList = scope === "partner" ? (tab === "own" ? ownItems : globalItems) : items;
  const filtered =
    classFilter === "all"
      ? baseList
      : classFilter === NO_CLASS
        ? baseList.filter((i) => !i.geraete_klasse)
        : baseList.filter((i) => i.geraete_klasse === classFilter);
  const classCounts = DEVICE_CLASSES.map((c) => ({
    ...c,
    count:
      c.value === NO_CLASS
        ? baseList.filter((i) => !i.geraete_klasse).length
        : baseList.filter((i) => i.geraete_klasse === c.value).length,
  }));

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
      artikelnummer: item.artikelnummer ?? "",
      ean: item.ean ?? "",
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

    const payload: any = {
      hersteller: form.hersteller.trim(),
      modell: form.modell.trim(),
      artikelnummer: form.artikelnummer.trim() || null,
      ean: form.ean.trim() || null,
      ek_preis: round2(parseDeNumber(form.ek_preis) || 0),
      vk_preis: round2(parseDeNumber(form.vk_preis) || 0),
      installations_pauschale: round2(parseDeNumber(form.installations_pauschale) || 0),
      beschreibung: form.beschreibung.trim() || null,
      datasheet_url: form.datasheet_url.trim() || null,
      bild_url: form.bild_url.trim() || null,
      is_active: form.is_active,
      geraete_klasse: form.geraete_klasse as any,
      einheit: form.einheit || "Stück",
      kompatibilitaet,
    };
    if (scope === "partner") {
      payload.owner_scope = "partner";
      payload.partner_id = partnerId;
    }

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

  const saveOverride = async (deviceId: string, patch: Partial<PriceOverride>) => {
    if (!partnerId) return;
    const existing = overrides[deviceId];
    // Use property-presence semantics: `undefined` in patch = keep existing value,
    // an explicit `null` in patch = user cleared the field, so we drop back to the default.
    const pick = (key: keyof PriceOverride): number | null => {
      if (key in patch) return (patch as any)[key] ?? null;
      return (existing?.[key] as number | null | undefined) ?? null;
    };
    const ek = pick("ek_preis");
    const vk = pick("vk_preis");
    const inst = pick("installations_pauschale");

    // Wenn kein Override mehr gesetzt ist: Zeile ganz entfernen, damit der globale Default gilt.
    if (ek === null && vk === null && inst === null) {
      if (existing) {
        const { error } = await supabase
          .from("device_catalog_partner_pricing")
          .delete()
          .eq("device_catalog_id", deviceId)
          .eq("partner_id", partnerId);
        if (error) {
          toast({ title: "Fehler", description: error.message, variant: "destructive" });
          return;
        }
      }
      toast({ title: "Eigener Preis zurückgesetzt" });
      load();
      return;
    }

    const payload = {
      device_catalog_id: deviceId,
      partner_id: partnerId,
      ek_preis: ek,
      vk_preis: vk,
      installations_pauschale: inst,
    };
    const { error } = await supabase
      .from("device_catalog_partner_pricing")
      .upsert(payload, { onConflict: "device_catalog_id,partner_id" });
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eigener Preis gespeichert" });
      load();
    }
  };

  const headerTitle = scope === "partner"
    ? "Sales – Eigener Geräte-Katalog"
    : "Sales – Geräte-Katalog";
  const headerSub = scope === "partner"
    ? "Eigene Artikel & Preis-Overrides auf globale Artikel"
    : "Globaler Hardware-Katalog für AICONO Sales Scout";

  const showGlobalOverrideUI = scope === "partner" && tab === "global";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">{headerTitle}</h1>
            <p className="text-sm text-muted-foreground">{headerSub}</p>
          </div>
        </div>
        {canManage && (scope === "global" || tab === "own") && (
          <div className="flex gap-2">
            {scope === "partner" && tab === "own" && partnerId && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                CSV / Excel importieren
              </Button>
            )}
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Gerät hinzufügen
            </Button>
          </div>
        )}
      </div>

      {scope === "partner" && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "own" | "global")}>
          <TabsList>
            <TabsTrigger value="own">Eigene Artikel ({ownItems.length})</TabsTrigger>
            <TabsTrigger value="global">
              <Globe2 className="h-3.5 w-3.5 mr-1" /> Globale Artikel ({globalItems.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={classFilter === "all" ? "default" : "outline"}
          onClick={() => setClassFilter("all")}
        >
          Alle ({baseList.length})
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
          <CardTitle>
            {showGlobalOverrideUI
              ? `Globale Artikel mit eigenem Preis (${filtered.length})`
              : `Geräte (${filtered.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Lade …</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Keine Geräte in dieser Klasse.
            </div>
          ) : showGlobalOverrideUI ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Klasse</TableHead>
                  <TableHead>Hersteller / Modell</TableHead>
                  <TableHead className="text-right">VK € (global)</TableHead>
                  <TableHead className="text-right">Eigener VK €</TableHead>
                  <TableHead className="text-right">Eigene Installation €</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((it) => (
                  <OverrideRow
                    key={it.id}
                    item={it}
                    override={overrides[it.id]}
                    canManage={canManage}
                    onSave={(patch) => saveOverride(it.id, patch)}
                  />
                ))}
              </TableBody>
            </Table>
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
                      {(it.artikelnummer || it.ean) && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {it.artikelnummer && <span>Art.-Nr. {it.artikelnummer}</span>}
                          {it.artikelnummer && it.ean && <span> · </span>}
                          {it.ean && <span>EAN {it.ean}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><span className="text-xs">{it.einheit}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur2(it.ek_preis)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur2(it.vk_preis)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur2(it.installations_pauschale)}</TableCell>
                    <TableCell>
                      {it.is_active ? <Badge>aktiv</Badge> : <Badge variant="outline">inaktiv</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(it)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(it.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Artikelnummer (optional)</Label>
                  <Input
                    value={form.artikelnummer}
                    onChange={(e) => setForm({ ...form, artikelnummer: e.target.value })}
                    placeholder="z. B. SH-PRO-3EM"
                  />
                </div>
                <div>
                  <Label>EAN / GTIN (optional)</Label>
                  <Input
                    value={form.ean}
                    onChange={(e) => setForm({ ...form, ean: e.target.value })}
                    placeholder="z. B. 3800235268421"
                  />
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

      {scope === "partner" && partnerId && (
        <CatalogImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          partnerId={partnerId}
          onImported={() => load()}
        />
      )}
    </div>
  );
}


function OverrideRow({
  item,
  override,
  canManage,
  onSave,
}: {
  item: DeviceCatalog;
  override?: PriceOverride;
  canManage: boolean;
  onSave: (patch: Partial<PriceOverride>) => void;
}) {
  const initialVk =
    override?.vk_preis != null ? formatEur2(override.vk_preis) : "";
  const initialInst =
    override?.installations_pauschale != null ? formatEur2(override.installations_pauschale) : "";
  const [vk, setVk] = useState<string>(initialVk);
  const [inst, setInst] = useState<string>(initialInst);

  const dirty = useMemo(() => {
    return vk !== initialVk || inst !== initialInst;
  }, [vk, inst, initialVk, initialInst]);

  const toPayload = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = parseDeNumber(raw);
    return Number.isFinite(n) ? round2(n) : null;
  };

  return (
    <TableRow>
      <TableCell><ClassBadge klasse={item.geraete_klasse} /></TableCell>
      <TableCell>
        <div className="font-medium">{item.hersteller}</div>
        <div className="text-xs text-muted-foreground">{item.modell}</div>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {formatEur2(item.vk_preis)}
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="text"
          inputMode="decimal"
          value={vk}
          disabled={!canManage}
          onChange={(e) => setVk(e.target.value)}
          onBlur={() => {
            const n = parseDeNumber(vk);
            if (Number.isFinite(n)) setVk(formatEur2(n));
          }}
          placeholder={formatEur2(item.vk_preis)}
          className="h-8 text-right ml-auto w-28 tabular-nums"
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="text"
          inputMode="decimal"
          value={inst}
          disabled={!canManage}
          onChange={(e) => setInst(e.target.value)}
          onBlur={() => {
            const n = parseDeNumber(inst);
            if (Number.isFinite(n)) setInst(formatEur2(n));
          }}
          placeholder={formatEur2(item.installations_pauschale)}
          className="h-8 text-right ml-auto w-28 tabular-nums"
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="icon"
          variant="ghost"
          disabled={!canManage || !dirty}
          onClick={() =>
            onSave({
              vk_preis: toPayload(vk),
              installations_pauschale: toPayload(inst),
            })
          }
          aria-label="Speichern"
        >
          <Save className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
