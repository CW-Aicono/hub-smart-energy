import { useEffect, useRef, useState } from "react";
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
import { BadgePercent, Trash2, CircleStop, Plus, CornerDownRight } from "lucide-react";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { useModulePrices } from "@/hooks/useModulePrices";
import { useActiveChargePoints } from "@/hooks/useActiveChargePoints";
import {
  TenantModuleDiscount, applyBestDiscount, discountStatus, fmtEur, addMonths, BundleModuleMap,
  prepaidCover, bundleDiscountAmount, describeDiscount, durationMonths, PAYMENT_MODE_LABEL, PaymentMode,
} from "@/lib/billingDiscounts";

export interface TenantModuleRow {
  id?: string;
  module_code: string;
  is_enabled: boolean;
  price_override?: number | null;
  charge_point_price_override?: number | null;
}

const moduleLabel = (code: string) => ALL_MODULES.find((m) => m.code === code)?.label ?? code;
const PRESET_EVENT = "aicono:discount-preset";

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

export interface TenantBundleInfo { id: string; name: string; modules: string[] }

/** Gebuchte Bundles eines Mandanten inkl. enthaltener Module. */
export function useTenantBundles(tenantId?: string) {
  const { data = [] } = useQuery({
    queryKey: ["tenant-bundles-detail", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: tb, error } = await supabase.from("tenant_bundles").select("bundle_id").eq("tenant_id", tenantId!);
      if (error) throw error;
      const ids = (tb ?? []).map((r: any) => r.bundle_id as string);
      if (ids.length === 0) return [] as TenantBundleInfo[];
      const [{ data: bundles }, { data: items }] = await Promise.all([
        supabase.from("module_bundles").select("id, name").in("id", ids),
        supabase.from("module_bundle_items").select("bundle_id, module_code").in("bundle_id", ids),
      ]);
      return (bundles ?? []).map((b: any) => ({
        id: b.id, name: b.name,
        modules: (items ?? []).filter((i: any) => i.bundle_id === b.id).map((i: any) => i.module_code as string),
      })) as TenantBundleInfo[];
    },
  });
  const map: BundleModuleMap = Object.fromEntries(data.map((b) => [b.id, b.modules]));
  return { bundles: data, map };
}

/** Monatliche Kosten: Pauschale (+ bei Ladeinfrastruktur aktive Ladepunkte × Preis) − Rabatt; Bundle-Rabatte auf die Bundle-Summe. */
export function useTenantModuleCost(opts: {
  tenantId?: string; modules: TenantModuleRow[]; isKommune: boolean; isMember: boolean;
}) {
  const { prices } = useModulePrices();
  const { byTenant } = useActiveChargePoints();
  const { data: discounts = [] } = useTenantDiscounts(opts.tenantId);
  const { bundles, map: bundleMap } = useTenantBundles(opts.tenantId);
  const activeCp = opts.tenantId ? byTenant[opts.tenantId] ?? 0 : 0;

  const breakdown = (code: string) => {
    const p = prices.find((x) => x.module_code === code) as any;
    const row = opts.modules.find((m) => m.module_code === code);
    const globalFlat = p ? Number(opts.isKommune
      ? (opts.isMember ? p.price_monthly : p.standard_price)
      : (opts.isMember ? p.industry_price_monthly : p.industry_standard_price)) : 0;
    const globalCp = p && code === "ev_charging" ? Number(opts.isKommune
      ? (opts.isMember ? p.charge_point_price_monthly : p.standard_charge_point_price_monthly)
      : (opts.isMember ? p.industry_charge_point_price_monthly : p.industry_standard_charge_point_price_monthly)) || 0 : 0;
    const flat = row?.price_override != null ? Number(row.price_override) : globalFlat;
    const cpPrice = code !== "ev_charging" ? 0 : row?.charge_point_price_override != null ? Number(row.charge_point_price_override) : globalCp;
    const cpAmount = cpPrice > 0 ? cpPrice * activeCp : 0;
    const gross = flat + cpAmount;
    const prepaid = prepaidCover(code, discounts, bundleMap);
    if (prepaid) return { flat, globalCp, cpPrice, cpOverride: row?.charge_point_price_override ?? null, cpAmount, gross, net: 0, discount: null, prepaid };
    const { net, discount } = applyBestDiscount(gross, code, discounts);
    return { flat, globalCp, cpPrice, cpOverride: row?.charge_point_price_override ?? null, cpAmount, gross, net, discount, prepaid: null };
  };

  /** Aktive monatliche Bundle-Rabatte für die eingeschalteten Module. */
  const bundleDiscounts = (enabledCodes: string[]) =>
    discounts
      .filter((d) => d.bundle_id && (d.payment_mode ?? "monthly") === "monthly" && discountStatus(d) === "active")
      .map((d) => {
        const codes = (bundleMap[d.bundle_id!] ?? []).filter((c) => enabledCodes.includes(c));
        const base = codes.reduce((s, c) => s + breakdown(c).net, 0);
        return { d, name: bundles.find((b) => b.id === d.bundle_id)?.name ?? "Bundle", amount: bundleDiscountAmount(d, base) };
      })
      .filter((x) => x.amount > 0);

  return { breakdown, bundleDiscounts, activeCp, discounts, bundles, bundleMap };
}

interface SubProps {
  tenantId: string;
  modules: TenantModuleRow[];
  isKommune: boolean;
  isMember: boolean;
  canEdit?: boolean;
}

/** Unterpunkt „je aktivem Ladepunkt“ unter Ladeinfrastruktur. */
export function ChargePointSubLine({ tenantId, modules, isKommune, isMember, canEdit = false }: SubProps) {
  const qc = useQueryClient();
  const { breakdown, activeCp } = useTenantModuleCost({ tenantId, modules, isKommune, isMember });
  const row = modules.find((m) => m.module_code === "ev_charging");
  if (!row?.is_enabled) return null;
  const b = breakdown("ev_charging");

  const saveOverride = async (value: number | null) => {
    if (!row.id) return;
    const { error } = await supabase.from("tenant_modules").update({ charge_point_price_override: value }).eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tenant-modules", tenantId] });
    toast.success("Ladepunktpreis gespeichert");
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pl-4 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CornerDownRight className="h-3.5 w-3.5" />
        je aktivem Ladepunkt / Monat · aktuell <strong className="text-foreground">{activeCp.toLocaleString("de-DE")}</strong> aktiv
      </span>
      <span className="flex items-center gap-2">
        {canEdit ? (
          <>
            <Input
              key={`cp-${b.cpOverride}`}
              type="number" min={0} step={0.01}
              placeholder={b.globalCp.toLocaleString("de-DE")}
              defaultValue={b.cpOverride ?? ""}
              title="Sonderpreis je Ladepunkt (leer = Standard)"
              className="w-24 h-8 text-right text-sm"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === "") { if (b.cpOverride != null) saveOverride(null); }
                else { const n = parseFloat(v); if (!isNaN(n) && n !== b.cpOverride) saveOverride(n); }
              }}
            />
            <span className="text-xs text-muted-foreground">€/LP</span>
          </>
        ) : <span>{fmtEur(b.cpPrice)} / LP</span>}
        <span className="font-medium w-28 text-right">
          {b.cpPrice > 0 ? `${activeCp} × ${fmtEur(b.cpPrice)} = ${fmtEur(b.cpAmount)}` : "nicht berechnet"}
        </span>
      </span>
    </div>
  );
}

/** Rabatt-Hinweis + „+ Rabatt“-Knopf je Modul. */
export function ModuleDiscountCell({ tenantId, code, canEdit = true, modules, isKommune, isMember }: SubProps & { code: string }) {
  const { breakdown } = useTenantModuleCost({ tenantId, modules, isKommune, isMember });
  const b = breakdown(code);
  const hint = b.prepaid
    ? `${PAYMENT_MODE_LABEL[(b.prepaid.payment_mode ?? "prepaid") as PaymentMode]} bis ${new Date(b.prepaid.valid_until!).toLocaleDateString("de-DE")}`
    : b.discount
      ? `${describeDiscount(b.discount.discount)}${b.discount.discount.valid_until ? ` bis ${new Date(b.discount.discount.valid_until).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}` : ""}`
      : null;
  return (
    <div className="flex items-center justify-end gap-1">
      {hint && <Badge variant="secondary" className="whitespace-nowrap">{hint}</Badge>}
      {canEdit && (
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => window.dispatchEvent(new CustomEvent(PRESET_EVENT, { detail: `m:${code}` }))}>
          <Plus className="h-3.5 w-3.5 mr-0.5" />Rabatt
        </Button>
      )}
    </div>
  );
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

const STATUS_LABEL = { active: "aktiv", planned: "geplant", expired: "abgelaufen" } as const;

export function TenantDiscountsCard({ tenantId, mode, allowedModules, canEdit = true }: Props) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const { data: discounts = [] } = useTenantDiscounts(tenantId);
  const { bundles } = useTenantBundles(tenantId);
  const today = new Date().toISOString().slice(0, 10);
  const [target, setTarget] = useState<string>(mode === "super" ? "__all" : "");
  const [type, setType] = useState<"percent" | "absolute">("percent");
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(today);
  const [durValue, setDurValue] = useState("");
  const [durUnit, setDurUnit] = useState<"month" | "year">("month");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("monthly");
  const [oneTime, setOneTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: Event) => {
      setTarget((e as CustomEvent<string>).detail);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(PRESET_EVENT, h);
    return () => window.removeEventListener(PRESET_EVENT, h);
  }, []);

  const moduleOptions = ALL_MODULES.filter((m) => !("alwaysOn" in m) && (mode === "super" || allowedModules?.includes(m.code)));
  const bundleOptions = bundles.filter((b) => mode === "super" || b.modules.every((c) => allowedModules?.includes(c)));
  const dv = parseInt(durValue, 10);
  const until = dv > 0 ? addMonths(from, durationMonths(dv, durUnit)) : "";
  const refresh = () => qc.invalidateQueries({ queryKey: ["tenant-discounts", tenantId] });

  const callPartner = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("partner-set-tenant-discount", { body: { tenantId, ...body } });
    if (error || !data?.success) throw new Error(data?.error ?? error?.message ?? "Fehler");
  };

  const targetLabel = (d: TenantModuleDiscount) =>
    d.module_code ? moduleLabel(d.module_code)
      : d.bundle_id ? `Bundle: ${bundles.find((b) => b.id === d.bundle_id)?.name ?? "–"}`
        : "Alle Module";

  const create = async () => {
    if (!target) return toast.error("Bitte Modul oder Bundle wählen");
    const isOneTime = paymentMode === "one_time";
    const v = isOneTime ? 1 : parseFloat(value.replace(",", "."));
    const ot = isOneTime ? parseFloat(oneTime.replace(",", ".")) : null;
    if (!isOneTime && (!(v > 0) || (type === "percent" && v > 100))) return toast.error(type === "percent" ? "Prozent zwischen 0 und 100 eingeben" : "Betrag größer 0 eingeben");
    if (isOneTime && !(ot! > 0)) return toast.error("Gesamtbetrag der Einmalzahlung eingeben");
    if (paymentMode !== "monthly" && !(dv > 0)) return toast.error("Für Vorkasse/Einmalzahlung bitte eine Laufzeit angeben");
    setBusy(true);
    try {
      const moduleCode = target.startsWith("m:") ? target.slice(2) : null;
      const bundleId = target.startsWith("b:") ? target.slice(2) : null;
      const payload = {
        module_code: moduleCode, bundle_id: bundleId,
        discount_type: isOneTime ? "absolute" : type, value: v, valid_from: from, valid_until: until || null,
        duration_value: dv > 0 ? dv : null, duration_unit: dv > 0 ? durUnit : null,
        payment_mode: paymentMode, one_time_amount: ot, note: note.trim() || null,
      };
      if (mode === "partner") {
        await callPartner({
          action: "create", moduleCode, bundleId, discountType: payload.discount_type, value: v, validFrom: from,
          durationValue: payload.duration_value, durationUnit: payload.duration_unit, paymentMode, oneTimeAmount: ot, note: payload.note,
        });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("tenant_module_discounts").insert({ tenant_id: tenantId, ...payload, created_by: user?.id, updated_by: user?.id } as any);
        if (error) throw error;
      }
      toast.success("Rabatt gespeichert");
      setValue(""); setNote(""); setDurValue(""); setOneTime("");
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
    <Card ref={ref} className="scroll-mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BadgePercent className="h-4 w-4" /> Rabatte (Module & Bundles)</CardTitle>
        <CardDescription>
          Prozent oder Betrag, dauerhaft oder mit Laufzeit in Monaten/Jahren. Monatlich verrechnet, per Vorkasse für die ganze Laufzeit oder als Einmalzahlung.
          Gelten mehrere Modul-Rabatte, zählt der günstigste; Bundle-Rabatte gelten auf die Summe der Bundle-Module. Nach Ablauf gilt automatisch wieder der normale Preis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="grid gap-3 md:grid-cols-6 items-end rounded-lg border p-3">
            <div className="md:col-span-2 space-y-1">
              <Label>Modul / Bundle</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  {mode === "super" && <SelectItem value="__all">Alle Module</SelectItem>}
                  {bundleOptions.map((b) => <SelectItem key={b.id} value={`b:${b.id}`}>Bundle: {b.name}</SelectItem>)}
                  {moduleOptions.map((m) => <SelectItem key={m.code} value={`m:${m.code}`}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Zahlungsart</Label>
              <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["monthly", "prepaid", "one_time"] as PaymentMode[]).map((p) => <SelectItem key={p} value={p}>{PAYMENT_MODE_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {paymentMode === "one_time" ? (
              <div className="md:col-span-2 space-y-1">
                <Label>Gesamtbetrag für die Laufzeit (€)</Label>
                <Input inputMode="decimal" value={oneTime} onChange={(e) => setOneTime(e.target.value)} placeholder="z. B. 990,00" />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Art</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Prozent (%)</SelectItem>
                      <SelectItem value="absolute">Betrag (€ / Monat)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Wert</Label>
                  <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percent" ? "z. B. 50" : "z. B. 20,00"} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Gültig ab</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Laufzeit {paymentMode === "monthly" && "(leer = dauerhaft)"}</Label>
              <div className="flex gap-2">
                <Input type="number" min={1} value={durValue} onChange={(e) => setDurValue(e.target.value)} className="w-24" placeholder="z. B. 3" />
                <Select value={durUnit} onValueChange={(v) => setDurUnit(v as any)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monate</SelectItem>
                    <SelectItem value="year">Jahre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="md:col-span-2 text-sm text-muted-foreground">
              {until ? <>Endet am <strong className="text-foreground">{new Date(until).toLocaleDateString("de-DE")}</strong></> : "Dauerhaft"}
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
              <TableHead>Modul / Bundle</TableHead>
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
              const bundle = d.bundle_id ? bundles.find((b) => b.id === d.bundle_id) : null;
              const partnerLocked = mode === "partner" && (
                d.module_code ? !allowedModules?.includes(d.module_code)
                  : d.bundle_id ? !bundle || !bundle.modules.every((c) => allowedModules?.includes(c))
                    : true);
              return (
                <TableRow key={d.id}>
                  <TableCell>{targetLabel(d)}</TableCell>
                  <TableCell>
                    {describeDiscount(d)}
                    {d.payment_mode && d.payment_mode !== "monthly" && d.invoiced_at && <span className="text-xs text-muted-foreground"> · berechnet</span>}
                  </TableCell>
                  <TableCell>
                    {new Date(d.valid_from).toLocaleDateString("de-DE")} – {d.valid_until ? new Date(d.valid_until).toLocaleDateString("de-DE") : "dauerhaft"}
                    {d.duration_value && <span className="text-xs text-muted-foreground"> ({d.duration_value} {d.duration_unit === "year" ? (d.duration_value === 1 ? "Jahr" : "Jahre") : (d.duration_value === 1 ? "Monat" : "Monate")})</span>}
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
