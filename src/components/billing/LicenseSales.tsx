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
import { Plus, Loader2, Square, Info, CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { termEnd, termLabel } from "@/lib/licenseTerm";
import { toast } from "sonner";
import { licenseAmount, licensePeriodEnd, saleSchema, discountedPrice, type BillingCadence } from "@/lib/licenseBilling";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { InvoiceLineEditor } from "./InvoiceLineEditor";
import { emptyInvoiceLine, parseCustomInvoiceLines, type CustomInvoiceLine } from "@/lib/customInvoice";
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
  const [customMode, setCustomMode] = useState(false);
  const [customLines, setCustomLines] = useState<CustomInvoiceLine[]>([emptyInvoiceLine()]);
  const parsedCustom = parseCustomInvoiceLines(customLines);
  const [tenant, setTenant] = useState(tenantId || ""), [products, setProducts] = useState<string[]>([]), [prices, setPrices] = useState<Record<string, string>>({}), [discount, setDiscount] = useState("0"), [reason, setReason] = useState(""), [cadence, setCadence] = useState<BillingCadence>("monthly"), [payment, setPayment] = useState("invoice"), [request, setRequest] = useState(crypto.randomUUID());
  const [term, setTerm] = useState(""), [autoRenew, setAutoRenew] = useState(true);
  const [termSale, setTermSale] = useState<any>(null), [editTerm, setEditTerm] = useState(""), [editRenew, setEditRenew] = useState(true);
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
  const { data: usageUnits = [] } = useQuery({ queryKey: ["license-usage-units"], enabled: open, queryFn: async () => { const { data, error } = await db.from("pricing_unit_prices").select("code,name,unit,uvp,ek,new_sale_uvp").in("code", ["charge_point", "extra_location", "charging_session"]); if (error) throw error; return data ?? []; } });
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
  const selectedItems: any[] = catalog.filter((p: any) => products.includes(`${p.kind}:${p.code}`));
  const hasPartner = !!(tenants.find((x: any) => x.id === tenant)?.partner_id ?? partnerId);
  const pct = hasPartner ? Math.min(100, Math.max(0, Number(discount.replace(",", ".")) || 0)) : 0;
  const keyOf = (p: any) => `${p.kind}:${p.code}`;
  const listFor = (p: any) => discountedPrice(listPrice(p, hasPartner), pct);
  const priceFor = (p: any) => { const v = prices[keyOf(p)]; return v === undefined || v === "" ? listFor(p) : (Number(v.replace(",", ".")) || 0); };
  const isIndividual = (p: any) => prices[keyOf(p)] !== undefined && prices[keyOf(p)] !== "" && isIndividualPrice(priceFor(p), listFor(p));
  const anyIndividual = selectedItems.some(isIndividual);
  const onceSelected = selectedItems.some((p: any) => p.onceOnly);
  const recurringSelected = selectedItems.some((p: any) => !p.onceOnly);
  useEffect(() => { if (onceSelected && !recurringSelected) setCadence("once"); }, [onceSelected, recurringSelected]);
  const itemCadence = (p: any): BillingCadence => p.onceOnly ? "once" : cadence;
  const owned = state?.packages ?? [];
  const pickedPackages = selectedItems.filter((p: any) => p.kind === "package").map((p: any) => p.code);
  const prereqFor = (p: any) => p.kind === "package" && p.def
    ? (p.def.requires_package === P1 && !owned.includes(P1) && !pickedPackages.includes(P1) ? `${p.name}: ${T("needsP1")}` : p.def.requires_any_other && owned.length === 0 && (state?.chargePoints ?? 0) === 0 && !pickedPackages.some((c: string) => c !== p.code) ? `${p.name}: ${T("needsOther")}` : null)
    : null;
  const prereqs = selectedItems.map(prereqFor).filter(Boolean) as string[];
  const showP6Hint = !!state && enterpriseHint(state.locations, [...owned, ...pickedPackages]);
  const togglePick = (key: string, on: boolean) => setProducts(prev => on ? [...prev, key] : prev.filter(k => k !== key));
  const draftTotal = selectedItems.reduce((sum: number, p: any) => sum + licenseAmount(priceFor(p), 1, today, licensePeriodEnd(today, itemCadence(p)), itemCadence(p)), 0);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["license-sales"] }); qc.invalidateQueries({ queryKey: ["license-sale-state"] }); qc.invalidateQueries({ queryKey: ["partner-customer-invoices"] }); qc.invalidateQueries({ queryKey: ["super-admin-invoices"] }); qc.invalidateQueries({ queryKey: ["partner-purchase-invoices"] }); qc.invalidateQueries({ queryKey: ["tenant-modules"] }); };
  const save = async () => {
    if (customMode) {
      if (!parsedCustom.success || !tenant) return toast.error(T("invalid"));
      setBusy(true);
      try {
        const { error } = await db.rpc("create_custom_invoice_sale", { p_tenant: tenant, p_lines: parsedCustom.data, p_cadence: cadence, p_payment: payment, p_request: request, p_start: today });
        if (error) throw error;
        toast.success(T("created")); refresh(); setOpen(false);
      } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
      return;
    }
    if (!tenant || !selectedItems.length) return toast.error(T("invalid"));
    for (const p of selectedItems) if (!saleSchema.safeParse({ tenant, kind: p.kind, code: p.code, quantity: 1, cadence: itemCadence(p), price: priceFor(p), payment }).success) return toast.error(`${p.name}: ${T("invalid")}`);
    if (anyIndividual && reason.trim().length < 5) return toast.error(T("reason"));
    setBusy(true);
    // Paket 1 zuerst buchen, damit abhängige Pakete ihre Voraussetzung finden
    const ordered = [...selectedItems].sort((x: any, y: any) => (x.code === P1 ? -1 : y.code === P1 ? 1 : 0));
    const done: string[] = [];
    try {
      for (const p of ordered) {
        const { data, error } = await supabase.functions.invoke("license-sale", { body: { tenant_id: tenant, product_kind: p.kind, product_code: p.code, quantity: 1, cadence: itemCadence(p), sale_price: priceFor(p), starts_on: today, payment_method: payment, request_id: `${request.slice(0, 24)}${String(catalog.indexOf(p)).padStart(12, "0")}`, price_reason: isIndividual(p) ? reason.trim() : undefined, term_months: term ? Number(term) : null, auto_renew: autoRenew, customer_discount_pct: pct } });
        const msg = await invokeError(error, data); if (msg) throw new Error(`${p.name}: ${msg}`);
        if (data?.warning) toast.warning(data.warning);
        done.push(p.name);
      }
      toast.success(T("created")); refresh(); setOpen(false);
    } catch (e: any) { toast.error(done.length ? `${e.message} (bereits gebucht: ${done.join(", ")})` : e.message); refresh(); } finally { setBusy(false); }
  };
  const endSale = async (id: string) => {
    if (!window.confirm(T("endConfirm"))) return;
    const { data, error } = await supabase.functions.invoke("license-sale", { body: { action: "end", sale_id: id } });
    const msg = await invokeError(error, data); if (msg) return toast.error(msg);
    if (data?.disabled?.length) toast.success(`${T("modulesOff")}: ${data.disabled.join(", ")}`);
    refresh();
  };
  const termValid = (v: string) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 240);
  const saveTerm = async () => {
    if (!termValid(editTerm)) return toast.error(T("termInvalid"));
    const { error } = await db.rpc("set_license_sale_term", { p_sale: termSale.id, p_term_months: editTerm ? Number(editTerm) : null, p_auto_renew: editRenew });
    if (error) return toast.error(error.message);
    toast.success(T("termSaved")); setTermSale(null); refresh();
  };
  return <section className="space-y-3 min-w-0">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">{T("contracts")}</h2>{canEdit && <Button variant="outline" onClick={() => { setRequest(crypto.randomUUID()); setProducts([]); setPrices({}); setDiscount("0"); setReason(""); setTerm(""); setAutoRenew(true); setCustomMode(false); setCustomLines([emptyInvoiceLine()]); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />{T("sell")}</Button>}</div>
    {salesError && <p className="text-destructive">{(salesError as Error).message}</p>}
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{T("customer")}</TableHead><TableHead>{T("product")}</TableHead><TableHead>{T("quantity")}</TableHead><TableHead>{T("cadence")}</TableHead><TableHead>{T("price")}</TableHead><TableHead>EK AICONO</TableHead><TableHead>{T("term")}</TableHead><TableHead>{T("next")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {sales.map((s: any) => <TableRow key={s.id}><TableCell>{s.tenants?.name}</TableCell><TableCell>{s.label}</TableCell><TableCell>{s.quantity.toLocaleString("de-DE")}</TableCell><TableCell>{T(s.cadence)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-1">{eur(Number(s.sale_price))}{s.price_individual && <Badge variant="outline" title={s.price_reason ?? ""}>{T("individual")}</Badge>}</div>{(Number(s.customer_discount_pct) > 0 || (s.list_sale_price != null && Number(s.list_sale_price) !== Number(s.sale_price))) && <div className="text-xs text-muted-foreground">VK {eur(Number(s.list_sale_price ?? s.sale_price))}{Number(s.customer_discount_pct) > 0 ? ` − ${Number(s.customer_discount_pct).toLocaleString("de-DE")} %` : ""}</div>}</TableCell><TableCell className="whitespace-nowrap">{s.partner_id ? <>{eur(Number(s.purchase_price))}<div className="text-xs text-muted-foreground">{T("margin")} {eur(Number(s.sale_price) - Number(s.purchase_price))}</div></> : "—"}</TableCell><TableCell className="text-xs whitespace-nowrap">{termLabel(s.term_months, s.auto_renew, s.starts_on, T)}</TableCell><TableCell>{s.ended_on && s.ended_on < today ? T("ended") : s.ended_on ? `${T("endsOn")} ${new Date(s.ended_on + "T00:00:00").toLocaleDateString("de-DE")}` : s.next_period ? new Date(s.next_period + "T00:00:00").toLocaleDateString("de-DE") : "—"}</TableCell><TableCell className="whitespace-nowrap">{canEdit && !(s.ended_on && s.ended_on < today) && <Button variant="ghost" size="icon" title={T("termEdit")} onClick={() => { setTermSale(s); setEditTerm(s.term_months ? String(s.term_months) : ""); setEditRenew(s.auto_renew !== false); }}><CalendarClock className="h-4 w-4" /></Button>}{canEdit && !s.ended_on && <Button variant="ghost" size="icon" title={T("end")} onClick={() => endSale(s.id)}><Square className="h-4 w-4" /></Button>}</TableCell></TableRow>)}
      {!sales.length && !salesError && <TableRow><TableCell colSpan={9} className="text-muted-foreground">{T("empty")}</TableCell></TableRow>}
    </TableBody></Table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{T(customMode ? "customBilling" : "sell")}</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 space-y-1"><Label>{T("customer")}</Label><Select value={tenant} onValueChange={setTenant} disabled={!!tenantId}><SelectTrigger><SelectValue placeholder={T("choose")} /></SelectTrigger><SelectContent>{tenants.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2 space-y-1"><Label>{T("product")}</Label>
        {!customMode && <div className="rounded-md border divide-y max-h-64 overflow-y-auto">{catalog.map((p: any) => { const key = keyOf(p); const on = products.includes(key); return <label key={key} className={`flex items-center gap-3 px-3 py-2 text-sm ${p.locked ? "opacity-50" : "cursor-pointer"}`}><Checkbox checked={on} disabled={p.locked} onCheckedChange={(v) => togglePick(key, !!v)} /><span className="flex-1">{p.name}</span><span className="text-muted-foreground whitespace-nowrap">{p.locked ? "Freischaltung bei AICONO anfragen" : `VK ${eur(listPrice(p, hasPartner))}${hasPartner ? ` · EK ${eur(p.ek)}` : ""}`}</span></label>; })}</div>}
        {!customMode && catalogError && <p className="text-destructive">{(catalogError as Error).message}</p>}
        <div className="flex items-center gap-2 pt-3 pb-2"><Switch id="custom-invoice-mode" checked={customMode} onCheckedChange={setCustomMode} /><Label htmlFor="custom-invoice-mode">{T("customBilling")}</Label></div>
        {!customMode && <>
        <p className="text-xs text-muted-foreground flex gap-1"><Info className="h-3 w-3 mt-0.5 shrink-0" />{T("autoCounted")}</p>
        {prereqs.map(m => <p key={m} className="text-sm text-destructive">{m}</p>)}
        {showP6Hint && <p className="text-sm text-muted-foreground">{T("p6Cheaper")}</p>}
        </>}
      </div>
      {customMode ? <div className="sm:col-span-2"><InvoiceLineEditor lines={customLines} onChange={setCustomLines} /></div> : <>
      {hasPartner && <div className="space-y-1"><Label>{T("customerDiscount")}</Label><Input inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} /><p className="text-xs text-muted-foreground">{T("customerDiscountHint")}</p></div>}
      {selectedItems.length > 0 && <div className="sm:col-span-2 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{T("product")}</TableHead><TableHead className="text-right">VK</TableHead>{hasPartner && <TableHead className="text-right">{T("discountShort")}</TableHead>}<TableHead className="text-right">{T("customerPrice")}</TableHead>{hasPartner && <><TableHead className="text-right">EK AICONO</TableHead><TableHead className="text-right">{T("margin")}</TableHead></>}</TableRow></TableHeader><TableBody>
        {selectedItems.map((p: any) => { const vk = listPrice(p, hasPartner), cp = priceFor(p); return <TableRow key={keyOf(p)}><TableCell className="text-sm">{p.name}{isIndividual(p) && <Badge variant="outline" className="ml-1">{T("individual")}</Badge>}<div className="text-xs text-muted-foreground">{T(itemCadence(p))}</div></TableCell><TableCell className="text-right whitespace-nowrap">{eur(vk)}</TableCell>{hasPartner && <TableCell className="text-right whitespace-nowrap">{pct.toLocaleString("de-DE")} %</TableCell>}<TableCell className="text-right"><Input className="h-8 w-24 ml-auto text-right" inputMode="decimal" value={prices[keyOf(p)] ?? String(listFor(p)).replace(".", ",")} onChange={e => setPrices(prev => ({ ...prev, [keyOf(p)]: e.target.value }))} /></TableCell>{hasPartner && <><TableCell className="text-right whitespace-nowrap">{eur(p.ek)}</TableCell><TableCell className={`text-right whitespace-nowrap ${cp - p.ek < 0 ? "text-destructive" : ""}`}>{eur(cp - p.ek)}</TableCell></>}</TableRow>; })}
      </TableBody></Table><p className="text-xs text-muted-foreground mt-1">{hasPartner ? T("partnerPriceHint") : T("directPriceHint")}</p></div>}
      {usageUnits.length > 0 && <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-sm"><p className="font-medium mb-1">Nutzungsabhängig (automatisch gezählt, nicht buchbar)</p><ul className="space-y-0.5">{["charge_point","extra_location","charging_session"].map(c => usageUnits.find((u: any) => u.code === c)).filter(Boolean).map((u: any) => { const vk = Number(u.new_sale_uvp ?? u.uvp); const unit = u.code === "charge_point" ? "Ladepunkt / Monat" : u.code === "extra_location" ? "Liegenschaft / Monat" : "Ladevorgang"; return <li key={u.code} className="flex justify-between gap-4"><span>{u.code === "charge_point" ? "Ladeinfrastruktur" : u.name}</span><span className="tabular-nums">{vk.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} / {unit}{hasPartner && <span className="text-muted-foreground"> · EK {Number(u.ek).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>}</span></li>; })}</ul></div>}
      {anyIndividual && <div className="sm:col-span-2 space-y-1"><Label>{T("reason")}</Label><Textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>}
      </>}
      <div className="space-y-1"><Label>{T("cadence")}</Label><Select value={cadence} onValueChange={v => setCadence(v as BillingCadence)} disabled={!customMode && onceSelected && !recurringSelected}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["once","monthly","quarterly","halfyearly"] as const).map(v => <SelectItem key={v} value={v}>{T(v)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{T("payment")}</Label><Select value={payment} onValueChange={setPayment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice">{T("invoice")}</SelectItem><SelectItem value="sepa">SEPA</SelectItem></SelectContent></Select></div>
      {!customMode && <><div className="space-y-1"><Label>{T("termMonths")}</Label><Input inputMode="numeric" placeholder={T("unlimited")} value={term} onChange={e => setTerm(e.target.value.replace(/\D/g, ""))} />{term && !termValid(term) && <p className="text-xs text-destructive">{T("termInvalid")}</p>}</div>
      <div className="space-y-1"><Label>{T("afterTerm")}</Label><div className="flex items-center gap-2 h-10"><Switch checked={autoRenew} disabled={!term} onCheckedChange={setAutoRenew} /><span className="text-sm">{autoRenew ? T("renews") : T("endsAuto")}</span></div></div>
      </>}
      <div className="sm:col-span-2 text-sm border-t pt-3 space-y-1"><p>{T("start")}: {new Date(today + "T00:00:00").toLocaleDateString("de-DE")} – {new Date(licensePeriodEnd(today,cadence) + "T00:00:00").toLocaleDateString("de-DE")}</p>{!customMode && term && termValid(term) && <p>{autoRenew ? T("minTermUntil") : T("endsOn")}: {new Date(termEnd(today, Number(term)) + "T00:00:00").toLocaleDateString("de-DE")}</p>}<p>{T("draft")}: {eur(customMode ? (parsedCustom.success ? parsedCustom.data.reduce((sum, line) => sum + licenseAmount(line.unit_price, line.quantity, today, licensePeriodEnd(today,cadence),cadence), 0) : 0) : draftTotal)}</p><p className="text-xs text-muted-foreground">{T("halfMonthHint")}</p></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{T("cancel")}</Button><Button disabled={busy || !tenant || (customMode ? !parsedCustom.success : !selectedItems.length || !termValid(term) || prereqs.length > 0 || (anyIndividual && reason.trim().length < 5))} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{T("confirm")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!termSale} onOpenChange={(v) => !v && setTermSale(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{T("termEdit")}{termSale ? ` – ${termSale.label}` : ""}</DialogTitle></DialogHeader><div className="space-y-3">
      <p className="text-sm text-muted-foreground">{T("start")}: {termSale ? new Date(termSale.starts_on + "T00:00:00").toLocaleDateString("de-DE") : ""}</p>
      <div className="space-y-1"><Label>{T("termMonths")}</Label><Input inputMode="numeric" placeholder={T("unlimited")} value={editTerm} onChange={e => setEditTerm(e.target.value.replace(/\D/g, ""))} /></div>
      <div className="flex items-center gap-2"><Switch checked={editRenew} disabled={!editTerm} onCheckedChange={setEditRenew} /><span className="text-sm">{editRenew ? T("renews") : T("endsAuto")}</span></div>
      {termSale && editTerm && termValid(editTerm) && <p className="text-sm">{editRenew ? T("minTermUntil") : T("endsOn")}: {new Date(termEnd(termSale.starts_on, Number(editTerm)) + "T00:00:00").toLocaleDateString("de-DE")}</p>}
    </div><DialogFooter><Button variant="outline" onClick={() => setTermSale(null)}>{T("cancel")}</Button><Button disabled={!termValid(editTerm)} onClick={saveTerm}>{T("termSave")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
