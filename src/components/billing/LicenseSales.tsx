import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isPackageUnlocked } from "@/lib/partnerPortfolio";
import { packageSaleCatalog, listPrice, isIndividualPrice } from "@/lib/packageSaleCatalog";
import { enterpriseHint } from "@/lib/packageSuggestion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, Loader2, Square, Info } from "lucide-react";
import { toast } from "sonner";
import { licenseAmount, licensePeriodEnd, saleSchema, type BillingCadence } from "@/lib/licenseBilling";
import { useTranslation } from "@/hooks/useTranslation";
const db = supabase as any;
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const P1 = "p1_monitoring";
async function invokeError(error: any, data: any) {
  if (data?.error) return data.error;
  if (!error) return null;
  const ctx = await error.context?.json?.().catch(() => null);
  return ctx?.error ?? error.message;
}
export function LicenseSales({ partnerId, tenantId, canEdit = true }: { partnerId?: string; tenantId?: string; canEdit?: boolean }) {
  const { t } = useTranslation(); const T = (k: string) => t(`license.${k}` as any);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState(tenantId || ""), [product, setProduct] = useState(""), [quantity, setQuantity] = useState("1"), [price, setPrice] = useState(""), [reason, setReason] = useState(""), [cadence, setCadence] = useState<BillingCadence>("monthly"), [payment, setPayment] = useState("invoice"), [request, setRequest] = useState(crypto.randomUUID());
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const { data: sales = [], error: salesError } = useQuery({ queryKey: ["license-sales", partnerId, tenantId], queryFn: async () => { let q = db.from("license_sales").select("*, tenants(name)").order("created_at", { ascending: false }); if (partnerId) q = q.eq("partner_id", partnerId); if (tenantId) q = q.eq("tenant_id", tenantId); const { data, error } = await q; if (error) throw error; return data || []; } });
  const { data: tenants = [] } = useQuery({ queryKey: ["license-sale-tenants", partnerId], enabled: open, queryFn: async () => { let q = db.from("tenants").select("id,name,partner_id").is("deleted_at", null).order("name"); if (partnerId) q = q.eq("partner_id", partnerId); const { data, error } = await q; if (error) throw error; return data || []; } });
  const { data: catalog = [], error: catalogError } = useQuery({ queryKey: ["license-sale-catalog", partnerId], enabled: open, queryFn: async () => {
    const results = await Promise.all([db.from("pricing_packages").select("code,name,uvp,ek,always_active,requires_package,requires_any_other").eq("active", true).order("sort"), db.from("pricing_unit_prices").select("code,name,uvp,ek,new_sale_uvp,partner_available")]);
    for (const r of results) if (r.error) throw r.error;
    const defs = results[0].data ?? [];
    let portfolio: string[] | null = null, links: any[] = [];
    if (partnerId) {
      const [pm, ln] = await Promise.all([db.from("partner_modules").select("module_code").eq("partner_id", partnerId), db.from("pricing_package_modules").select("package_code,module_code")]);
      if (pm.error) throw pm.error; if (ln.error) throw ln.error;
      portfolio = (pm.data ?? []).map((r: any) => r.module_code); links = ln.data ?? [];
    }
    return packageSaleCatalog(defs, results[1].data ?? [], !!partnerId).map(p => ({ ...p, def: defs.find((d: any) => d.code === p.code), locked: !!portfolio && p.kind === "package" && !isPackageUnlocked(p.code, links, portfolio) }));
  } });
  // Bestand des gewählten Kunden für die Voraussetzungsprüfung
  const { data: state } = useQuery({ queryKey: ["license-sale-state", tenant], enabled: open && !!tenant, queryFn: async () => {
    const [s, b, l, c] = await Promise.all([
      db.from("license_sales").select("product_code").eq("tenant_id", tenant).eq("product_kind", "package").is("ended_on", null),
      db.from("tenant_package_bookings").select("package_code").eq("tenant_id", tenant).is("cancelled_at", null),
      db.from("locations").select("id", { count: "exact", head: true }).eq("tenant_id", tenant),
      db.from("charge_points").select("id", { count: "exact", head: true }).eq("tenant_id", tenant),
    ]);
    return { packages: [...(s.data ?? []).map((x: any) => x.product_code), ...(b.data ?? []).map((x: any) => x.package_code)] as string[], locations: l.count ?? 0, chargePoints: c.count ?? 0 };
  } });
  const selected: any = catalog.find((p: any) => `${p.kind}:${p.code}` === product);
  const hasPartner = !!(tenants.find((x: any) => x.id === tenant)?.partner_id ?? partnerId);
  const list = selected ? listPrice(selected, hasPartner) : 0;
  const numericPrice = Number(price.replace(",", ".")) || 0;
  const individual = !!selected && price !== "" && isIndividualPrice(numericPrice, list);
  useEffect(() => { if (selected) setPrice(String(listPrice(selected, hasPartner))); }, [product, hasPartner]); // eslint-disable-line react-hooks/exhaustive-deps
  const owned = state?.packages ?? [];
  const prereq = selected?.kind === "package" && selected.def
    ? (selected.def.requires_package === P1 && !owned.includes(P1) ? T("needsP1") : selected.def.requires_any_other && owned.length === 0 && (state?.chargePoints ?? 0) === 0 ? T("needsOther") : null)
    : null;
  const showP6Hint = !!state && enterpriseHint(state.locations, owned);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["license-sales"] }); qc.invalidateQueries({ queryKey: ["license-sale-state"] }); qc.invalidateQueries({ queryKey: ["partner-customer-invoices"] }); qc.invalidateQueries({ queryKey: ["super-admin-invoices"] }); qc.invalidateQueries({ queryKey: ["partner-purchase-invoices"] }); qc.invalidateQueries({ queryKey: ["tenant-modules"] }); };
  const save = async () => {
    const parsed = saleSchema.safeParse({ tenant, kind: selected?.kind, code: selected?.code, quantity: Number(quantity), cadence, price: numericPrice, payment });
    if (!parsed.success) return toast.error(T("invalid"));
    if (individual && reason.trim().length < 5) return toast.error(T("reason"));
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("license-sale", { body: { tenant_id: tenant, product_kind: parsed.data.kind, product_code: parsed.data.code, quantity: parsed.data.quantity, cadence, sale_price: parsed.data.price, starts_on: today, payment_method: payment, request_id: request, price_reason: individual ? reason.trim() : undefined } });
      const msg = await invokeError(error, data); if (msg) throw new Error(msg);
      toast.success(T("created")); refresh(); setOpen(false);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const endSale = async (id: string) => {
    if (!window.confirm(T("endConfirm"))) return;
    const { data, error } = await supabase.functions.invoke("license-sale", { body: { action: "end", sale_id: id } });
    const msg = await invokeError(error, data); if (msg) return toast.error(msg);
    if (data?.disabled?.length) toast.success(`${T("modulesOff")}: ${data.disabled.join(", ")}`);
    refresh();
  };
  return <section className="space-y-3 min-w-0">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">{T("contracts")}</h2>{canEdit && <Button variant="outline" onClick={() => { setRequest(crypto.randomUUID()); setProduct(""); setReason(""); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />{T("sell")}</Button>}</div>
    {salesError && <p className="text-destructive">{(salesError as Error).message}</p>}
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{T("customer")}</TableHead><TableHead>{T("product")}</TableHead><TableHead>{T("quantity")}</TableHead><TableHead>{T("cadence")}</TableHead><TableHead>{T("price")}</TableHead><TableHead>{T("next")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {sales.map((s: any) => <TableRow key={s.id}><TableCell>{s.tenants?.name}</TableCell><TableCell>{s.label}</TableCell><TableCell>{s.quantity.toLocaleString("de-DE")}</TableCell><TableCell>{T(s.cadence)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-1">{eur(Number(s.sale_price))}{s.price_individual && <Badge variant="outline" title={s.price_reason ?? ""}>{T("individual")}</Badge>}</div></TableCell><TableCell>{s.ended_on ? T("ended") : s.next_period ? new Date(s.next_period + "T00:00:00").toLocaleDateString("de-DE") : "—"}</TableCell><TableCell>{canEdit && !s.ended_on && <Button variant="ghost" size="icon" title={T("end")} onClick={() => endSale(s.id)}><Square className="h-4 w-4" /></Button>}</TableCell></TableRow>)}
      {!sales.length && !salesError && <TableRow><TableCell colSpan={7} className="text-muted-foreground">{T("empty")}</TableCell></TableRow>}
    </TableBody></Table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{T("sell")}</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 space-y-1"><Label>{T("customer")}</Label><Select value={tenant} onValueChange={setTenant} disabled={!!tenantId}><SelectTrigger><SelectValue placeholder={T("choose")} /></SelectTrigger><SelectContent>{tenants.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2 space-y-1"><Label>{T("product")}</Label><Select value={product} onValueChange={v => { setProduct(v); const p: any = catalog.find((x: any) => `${x.kind}:${x.code}` === v); setQuantity("1"); if (p?.onceOnly) setCadence("once"); }}><SelectTrigger><SelectValue placeholder={T("choose")} /></SelectTrigger><SelectContent>{catalog.map((p: any) => <SelectItem key={`${p.kind}:${p.code}`} value={`${p.kind}:${p.code}`} disabled={p.locked}>{p.name} · {p.locked ? "Nicht in deinem Partner-Portfolio – Freischaltung bei AICONO anfragen" : eur(listPrice(p, hasPartner))}</SelectItem>)}</SelectContent></Select>{catalogError && <p className="text-destructive">{(catalogError as Error).message}</p>}
        <p className="text-xs text-muted-foreground flex gap-1"><Info className="h-3 w-3 mt-0.5 shrink-0" />{T("autoCounted")}</p>
        {prereq && <p className="text-sm text-destructive">{prereq}</p>}
        {showP6Hint && <p className="text-sm text-muted-foreground">{T("p6Cheaper")}</p>}
      </div>
      <div className="space-y-1"><Label>{T("quantity")}</Label><Input type="number" min={1} disabled value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
      <div className="space-y-1"><Label className="flex items-center gap-2">{T("price")}{individual && <Badge variant="outline">{T("individual")}</Badge>}</Label><Input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />{selected && <p className="text-xs text-muted-foreground">{T("listPrice")}: {eur(list)}</p>}</div>
      {individual && <div className="sm:col-span-2 space-y-1"><Label>{T("reason")}</Label><Textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>}
      <div className="space-y-1"><Label>{T("cadence")}</Label><Select value={cadence} onValueChange={v => setCadence(v as BillingCadence)} disabled={!!selected?.onceOnly}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["once","monthly","quarterly","halfyearly"] as const).map(v => <SelectItem key={v} value={v}>{T(v)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{T("payment")}</Label><Select value={payment} onValueChange={setPayment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice">{T("invoice")}</SelectItem><SelectItem value="sepa">SEPA</SelectItem></SelectContent></Select></div>
      <div className="sm:col-span-2 text-sm border-t pt-3 space-y-1"><p>{T("start")}: {new Date(today + "T00:00:00").toLocaleDateString("de-DE")} – {new Date(licensePeriodEnd(today,cadence) + "T00:00:00").toLocaleDateString("de-DE")}</p><p>{T("draft")}: {eur(licenseAmount(numericPrice, Number(quantity) || 1, today, licensePeriodEnd(today,cadence),cadence))}</p></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{T("cancel")}</Button><Button disabled={busy || !selected || !tenant || !!prereq || (individual && reason.trim().length < 5)} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{T("confirm")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
