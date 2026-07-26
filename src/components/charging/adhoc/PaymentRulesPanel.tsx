import { useState } from "react";
import { useAdhocRules } from "@/hooks/useAdhocPayment";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";

const currencySymbol = (c?: string) => ({ EUR: "€", CHF: "CHF", GBP: "£", USD: "$" } as Record<string, string>)[c ?? "EUR"] ?? c ?? "€";


const SCOPE_LABEL: Record<string, string> = {
  tenant: "Mandant (Basis)",
  group: "Ladepunkt-Gruppe",
  charge_point: "Einzelner Ladepunkt",
};

export default function PaymentRulesPanel() {
  const { tenant } = useTenant();
  const { data: rules = [], isLoading, upsert, remove } = useAdhocRules();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: tariffs = [] } = useQuery({
    queryKey: ["charging-tariffs", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_tariffs").select("id, name, price_per_kwh, currency, is_active").eq("tenant_id", tenant!.id).eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["cp-groups-list", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("charge_point_groups").select("id, name").eq("tenant_id", tenant!.id).order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: chargePoints = [] } = useQuery({
    queryKey: ["cp-list-rules", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("charge_points").select("id, name, ocpp_id").eq("tenant_id", tenant!.id).order("name");
      if (error) throw error;
      return data;
    },
  });

  const tariffCurrency = (id?: string | null) => tariffs.find((t: any) => t.id === id)?.currency ?? "EUR";

  const openNew = () => {
    const firstTariff = tariffs[0];
    setEditing({
      scope: "tenant",
      scope_id: null,
      name: "Ad-Hoc Standard",
      enabled: true,
      tariff_id: firstTariff?.id ?? null,
      preauth_amount_cents: 5000,
      preauth_expiry_minutes: 30,
      max_kwh: null,
      max_minutes: 240,
      min_amount_cents: 50,
      currency: firstTariff?.currency ?? "EUR",
      rounding_step_cents: 1,
      priority: 0,
    });
    setOpen(true);
  };

  const onTariffChange = (v: string) => {
    setEditing({ ...editing, tariff_id: v, currency: tariffCurrency(v) });
  };

  const save = async () => {
    const payload = { ...editing, currency: tariffCurrency(editing.tariff_id) };
    if (payload.scope === "tenant") payload.scope_id = null;
    await upsert.mutateAsync(payload);
    setOpen(false);
  };

  const scopeName = (r: any) => {
    if (r.scope === "tenant") return "Alle Ladepunkte (Basis)";
    if (r.scope === "group") return groups.find((g: any) => g.id === r.scope_id)?.name ?? "Gruppe";
    return chargePoints.find((c: any) => c.id === r.scope_id)?.name ?? "Ladepunkt";
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Zahlungsregeln</h3>
            <p className="text-sm text-muted-foreground">
              Preauth-Betrag, Tarif und Limits — pro Mandant, Ladepunkt-Gruppe oder einzelnem Ladepunkt.
              Die spezifischste Regel gewinnt (Ladepunkt {'>'} Gruppe {'>'} Mandant).
            </p>
          </div>
          <Button onClick={openNew} size="sm" disabled={tariffs.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Neue Regel
          </Button>
        </div>

        {tariffs.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Bitte zunächst einen Ladetarif anlegen.
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rules.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Noch keine Zahlungsregel angelegt.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Geltungsbereich</TableHead>
                <TableHead>Tarif</TableHead>
                <TableHead className="text-right">Preauth</TableHead>
                <TableHead className="text-right">Max kWh</TableHead>
                <TableHead className="text-right">Max Min</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <Badge variant="outline" className="w-fit">{SCOPE_LABEL[r.scope]}</Badge>
                      <span className="text-xs text-muted-foreground mt-1">{scopeName(r)}</span>
                    </div>
                  </TableCell>
                  <TableCell>{r.tariff?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{(r.preauth_amount_cents / 100).toLocaleString("de-DE", { style: "currency", currency: r.tariff?.currency ?? r.currency ?? "EUR" })}</TableCell>
                  <TableCell className="text-right">{r.max_kwh ? r.max_kwh.toLocaleString("de-DE") : "—"}</TableCell>
                  <TableCell className="text-right">{r.max_minutes ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.enabled ? "default" : "outline"}>{r.enabled ? "Ja" : "Nein"}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing({ ...r }); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Regel löschen?") && remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Regel bearbeiten" : "Neue Zahlungsregel"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Name</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Geltungsbereich</Label>
                    <Select value={editing.scope} onValueChange={(v) => setEditing({ ...editing, scope: v, scope_id: null })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant">Mandant (Basis)</SelectItem>
                        <SelectItem value="group">Ladepunkt-Gruppe</SelectItem>
                        <SelectItem value="charge_point">Einzelner Ladepunkt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editing.scope !== "tenant" && (
                    <div className="grid gap-1.5">
                      <Label>{editing.scope === "group" ? "Gruppe" : "Ladepunkt"}</Label>
                      <Select value={editing.scope_id ?? ""} onValueChange={(v) => setEditing({ ...editing, scope_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        <SelectContent>
                          {(editing.scope === "group" ? groups : chargePoints).map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label>Tarif</Label>
                  <Select value={editing.tariff_id ?? ""} onValueChange={onTariffChange}>
                    <SelectTrigger><SelectValue placeholder="Tarif wählen…" /></SelectTrigger>
                    <SelectContent>
                      {tariffs.map((t: any) => (<SelectItem key={t.id} value={t.id}>{t.name} ({t.price_per_kwh} {currencySymbol(t.currency)}/kWh)</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Die Währung wird automatisch aus dem gewählten Tarif übernommen ({currencySymbol(tariffCurrency(editing.tariff_id))}).</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Preauth-Betrag ({currencySymbol(tariffCurrency(editing.tariff_id))})</Label>
                    <Input type="number" step="0.01" value={editing.preauth_amount_cents / 100} onChange={(e) => setEditing({ ...editing, preauth_amount_cents: Math.round(parseFloat(e.target.value || "0") * 100) })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Preauth-Ablauf (Min)</Label>
                    <Input type="number" value={editing.preauth_expiry_minutes} onChange={(e) => setEditing({ ...editing, preauth_expiry_minutes: parseInt(e.target.value || "30") })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Min-Betrag ({currencySymbol(tariffCurrency(editing.tariff_id))})</Label>
                    <Input type="number" step="0.01" value={editing.min_amount_cents / 100} onChange={(e) => setEditing({ ...editing, min_amount_cents: Math.round(parseFloat(e.target.value || "0") * 100) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Max. kWh (optional)</Label>
                    <Input type="number" value={editing.max_kwh ?? ""} onChange={(e) => setEditing({ ...editing, max_kwh: e.target.value ? parseFloat(e.target.value) : null })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Max. Dauer (Min)</Label>
                    <Input type="number" value={editing.max_minutes ?? ""} onChange={(e) => setEditing({ ...editing, max_minutes: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
                  <Label>Aktiv</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button onClick={save} disabled={upsert.isPending || !editing?.name || (editing?.scope !== "tenant" && !editing?.scope_id)}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
