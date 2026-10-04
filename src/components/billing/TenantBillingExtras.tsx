import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgePercent, PlugZap, Trash2, CircleStop } from "lucide-react";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { useModulePrices } from "@/hooks/useModulePrices";
import { useActiveChargePoints } from "@/hooks/useActiveChargePoints";
import {
  TenantModuleDiscount, applyBestDiscount, discountStatus, fmtEur, addMonths,
} from "@/lib/billingDiscounts";

export interface TenantModuleRow {
  id?: string;
  module_code: string;
  is_enabled: boolean;
  price_override?: number | null;
  charge_point_price_override?: number | null;
}

const moduleLabel = (code: string | null) =>
  code ? ALL_MODULES.find((m) => m.code === code)?.label ?? code : "Alle Module";

export function useTenantDiscounts(tenantId?: string) {
  return useQuery({
    queryKey: ["tenant-discounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_module_discounts").select("*").eq("tenant_id", tenantId!)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TenantModuleDiscount[];
    },
  });
}

/** Monatliche Kosten eines Moduls: Pauschale + aktive Ladepunkte × Ladepunktpreis − günstigster gültiger Rabatt. */
export function useTenantModuleCost(opts: {
  tenantId?: string; modules: TenantModuleRow[]; isKommune: boolean; isMember: boolean;
}) {
  const { prices } = useModulePrices();
  const { byTenant } = useActiveChargePoints();
  const { data: discounts = [] } = useTenantDiscounts(opts.tenantId);
  const activeCp = opts.tenantId ? byTenant[opts.tenantId] ?? 0 : 0;

  const breakdown = (code: string) => {
    const p = prices.find((x) => x.module_code === code) as any;
    const row = opts.modules.find((m) => m.module_code === code);
    const globalFlat = p ? Number(opts.isKommune
      ? (opts.isMember ? p.price_monthly : p.standard_price)
      : (opts.isMember ? p.industry_price_monthly : p.industry_standard_price)) : 0;
    const globalCp = p ? Number(opts.isKommune ? p.charge_point_price_monthly ?? 0 : p.industry_charge_point_price_monthly ?? 0) : 0;
    const flat = row?.price_override != null ? Number(row.price_override) : globalFlat;
    const cpPrice = row?.charge_point_price_override != null ? Number(row.charge_point_price_override) : globalCp;
    const cpAmount = cpPrice > 0 ? cpPrice * activeCp : 0;
    const gross = flat + cpAmount;
    const { net, discount } = applyBestDiscount(gross, code, discounts);
    return { flat, globalCp, cpPrice, cpOverride: row?.charge_point_price_override ?? null, cpAmount, gross, net, discount };
  };
  return { breakdown, activeCp, discounts };
}

interface Props {
  tenantId: string;
  modules: TenantModuleRow[];
  isKommune: boolean;
  isMember: boolean;
  mode: "super" | "partner";
  /** Partner: nur Module aus dem eigenen Portfolio */
  allowedModules?: string[];
  canEdit?: boolean;
}

export function TenantChargePointBillingCard({ tenantId, modules, isKommune, isMember, mode, canEdit = true }: Props) {
  const qc = useQueryClient();
  const { breakdown, activeCp } = useTenantModuleCost({ tenantId, modules, isKommune, isMember });
  const enabled = modules.filter((m) => m.is_enabled);
  const cpModules = enabled.filter((m) => breakdown(m.module_code).globalCp > 0 || m.charge_point_price_override != null || m.module_code === "ev_charging");
  if (cpModules.length === 0) return null;

  const saveOverride = async (row: TenantModuleRow, value: number | null) => {
    if (!row.id) return;
    const { error } = await supabase.from("tenant_modules").update({ charge_point_price_override: value }).eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tenant-modules", tenantId] });
    toast.success("Ladepunktpreis gespeichert");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4" /> Ladepunkt-Abrechnung</CardTitle>
        <CardDescription>
          Aktuell <strong>{activeCp.toLocaleString("de-DE")}</strong> aktive Ladepunkte (in den letzten 30 Tagen verbunden).
          Pauschale und Ladepunktpreis sind frei kombinierbar; 0 € = nicht berechnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modul</TableHead>
              <TableHead className="text-right">Pauschale</TableHead>
              <TableHead className="text-right">Preis je Ladepunkt</TableHead>
              <TableHead className="text-right">Vorschau / Monat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cpModules.map((row) => {
              const b = breakdown(row.module_code);
              return (
                <TableRow key={row.module_code}>
                  <TableCell className="font-medium">{moduleLabel(row.module_code)}</TableCell>
                  <TableCell className="text-right">{fmtEur(b.flat)}</TableCell>
                  <TableCell className="text-right">
                    {mode === "super" && canEdit ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          key={`${row.module_code}-${b.cpOverride}`}
                          type="number" min={0} step={0.01}
                          placeholder={b.globalCp.toLocaleString("de-DE")}
                          defaultValue={b.cpOverride ?? ""}
                          className="w-24 h-8 text-right text-sm"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === "") { if (b.cpOverride != null) saveOverride(row, null); }
                            else { const n = parseFloat(v); if (!isNaN(n) && n !== b.cpOverride) saveOverride(row, n); }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">€</span>
                      </div>
                    ) : fmtEur(b.cpPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-semibold">{fmtEur(b.net)}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtEur(b.flat)} + {activeCp.toLocaleString("de-DE")} × {fmtEur(b.cpPrice)}
                      {b.discount && <> − Rabatt {fmtEur(b.discount.amount)}</>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL = { active: "aktiv", planned: "geplant", expired: "abgelaufen" } as const;

export function TenantDiscountsCard({ tenantId, mode, allowedModules, canEdit = true }: Props) {
  const qc = useQueryClient();
  const { data: discounts = [] } = useTenantDiscounts(tenantId);
  const today = new Date().toISOString().slice(0, 10);
  const [moduleCode, setModuleCode] = useState<string>("__all");
  const [type, setType] = useState<"percent" | "absolute">("percent");
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const moduleOptions = ALL_MODULES.filter((m) => !("alwaysOn" in m) && (mode === "super" || allowedModules?.includes(m.code)));
  const refresh = () => qc.invalidateQueries({ queryKey: ["tenant-discounts", tenantId] });

  const callPartner = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("partner-set-tenant-discount", { body: { tenantId, ...body } });
    if (error || !data?.success) throw new Error(data?.error ?? error?.message ?? "Fehler");
  };

  const create = async () => {
    const v = parseFloat(value.replace(",", "."));
    if (!(v > 0) || (type === "percent" && v > 100)) return toast.error(type === "percent" ? "Prozent zwischen 0 und 100 eingeben" : "Betrag größer 0 eingeben");
    if (mode === "partner" && moduleCode === "__all") return toast.error("Bitte ein Modul wählen");
    if (until && until < from) return toast.error("„Gültig bis“ liegt vor „Gültig ab“");
    setBusy(true);
    try {
      const payload = {
        module_code: moduleCode === "__all" ? null : moduleCode,
        discount_type: type, value: v, valid_from: from, valid_until: until || null, note: note.trim() || null,
      };
      if (mode === "partner") {
        await callPartner({ action: "create", moduleCode: payload.module_code, discountType: type, value: v, validFrom: from, validUntil: payload.valid_until, note: payload.note });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("tenant_module_discounts").insert({ tenant_id: tenantId, ...payload, created_by: user?.id, updated_by: user?.id });
        if (error) throw error;
      }
      toast.success("Rabatt gespeichert");
      setValue(""); setNote(""); setUntil("");
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const end = async (d: TenantModuleDiscount) => {
    try {
      if (mode === "partner") await callPartner({ action: "end", discountId: d.id });
      else {
        const { data: { user } } = await supabase.auth.getUser();
        const endDate = d.valid_from > today ? d.valid_from : today;
        const { error } = await supabase.from("tenant_module_discounts").update({ valid_until: endDate, updated_by: user?.id, updated_at: new Date().toISOString() }).eq("id", d.id);
        if (error) throw error;
      }
      toast.success("Rabatt beendet"); refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (d: TenantModuleDiscount) => {
    if (!confirm("Rabatt wirklich löschen?")) return;
    try {
      if (mode === "partner") await callPartner({ action: "delete", discountId: d.id });
      else { const { error } = await supabase.from("tenant_module_discounts").delete().eq("id", d.id); if (error) throw error; }
      toast.success("Rabatt gelöscht"); refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BadgePercent className="h-4 w-4" /> Rabatte</CardTitle>
        <CardDescription>Prozentual oder als Betrag, dauerhaft (ohne Enddatum) oder befristet. Gelten mehrere, zählt der günstigste. Nach Ablauf gilt automatisch wieder der normale Preis.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="grid gap-3 md:grid-cols-6 items-end rounded-lg border p-3">
            <div className="md:col-span-2 space-y-1">
              <Label>Modul</Label>
              <Select value={moduleCode} onValueChange={setModuleCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mode === "super" && <SelectItem value="__all">Alle Module</SelectItem>}
                  {moduleOptions.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Art</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Prozent (%)</SelectItem>
                  <SelectItem value="absolute">Betrag (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Wert</Label>
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percent" ? "z. B. 50" : "z. B. 20,00"} />
            </div>
            <div className="space-y-1">
              <Label>Gültig ab</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Gültig bis (leer = dauerhaft)</Label>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
            <div className="md:col-span-4 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Schnellwahl:</span>
              {[1, 3, 6, 12].map((n) => (
                <Button key={n} type="button" size="sm" variant="outline" onClick={() => setUntil(addMonths(from, n))}>{n} {n === 1 ? "Monat" : "Monate"}</Button>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => setUntil("")}>dauerhaft</Button>
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz, z. B. Startangebot" maxLength={200} />
              <Button onClick={create} disabled={busy}>Hinzufügen</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modul</TableHead>
              <TableHead>Rabatt</TableHead>
              <TableHead>Zeitraum</TableHead>
              <TableHead>Notiz</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Keine Rabatte hinterlegt.</TableCell></TableRow>
            )}
            {discounts.map((d) => {
              const st = discountStatus(d);
              const partnerLocked = mode === "partner" && (!d.module_code || !allowedModules?.includes(d.module_code));
              return (
                <TableRow key={d.id}>
                  <TableCell>{moduleLabel(d.module_code)}</TableCell>
                  <TableCell>{d.discount_type === "percent" ? `${Number(d.value).toLocaleString("de-DE")} %` : fmtEur(Number(d.value))}</TableCell>
                  <TableCell>
                    {new Date(d.valid_from).toLocaleDateString("de-DE")} – {d.valid_until ? new Date(d.valid_until).toLocaleDateString("de-DE") : "dauerhaft"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.note ?? "–"}</TableCell>
                  <TableCell>
                    <Badge variant={st === "active" ? "default" : st === "planned" ? "secondary" : "outline"}>{STATUS_LABEL[st]}</Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right whitespace-nowrap">
                      {!partnerLocked && st !== "expired" && (
                        <Button size="icon" variant="ghost" title="Jetzt beenden" onClick={() => end(d)}><CircleStop className="h-4 w-4" /></Button>
                      )}
                      {!partnerLocked && (
                        <Button size="icon" variant="ghost" title="Löschen" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
