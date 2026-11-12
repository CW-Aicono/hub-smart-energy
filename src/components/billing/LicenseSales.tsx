import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isPackageUnlocked, partnerCatalogRefresh, saleCatalogPartner } from "@/lib/partnerPortfolio";
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
import { Plus, Loader2, Square, Info, CalendarClock, CalendarIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { termEnd, termLabel } from "@/lib/licenseTerm";
import { toast } from "sonner";
import { licenseAmount, licensePeriodEnd, onceTermAmount, saleSchema, bookingPrice, discountWindowValid, discountPeriodAmount, type BillingCadence } from "@/lib/licenseBilling";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { de, enGB, es, nl } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { PackageCorrection } from "./PackageCorrection";
import { packageCadence, packageDiscount, type PackageOptions } from "@/lib/packageBookingOptions";
import { BookingDatePicker } from "./BookingDatePicker";
import { InvoiceLineEditor } from "./InvoiceLineEditor";
import { emptyInvoiceLine, parseCustomInvoiceLines, type CustomInvoiceLine } from "@/lib/customInvoice";
import { allocateBookingTotal, parseBookingTotal } from "@/lib/negotiatedBookingTotal";
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
  const { t, language } = useTranslation(); const T = (k: string) => t(`license.${k}` as any);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customLines, setCustomLines] = useState<CustomInvoiceLine[]>([emptyInvoiceLine()]);
  const parsedCustom = parseCustomInvoiceLines(customLines);
  const [tenant, setTenant] = useState(tenantId || ""), [products, setProducts] = useState<string[]>([]), [prices, setPrices] = useState<Record<string, string>>({}), [discount, setDiscount] = useState("0"), [reason, setReason] = useState(""), [cadence, setCadence] = useState<BillingCadence>("monthly"), [payment, setPayment] = useState("invoice"), [request, setRequest] = useState(crypto.randomUUID());
  const [term, setTerm] = useState(""), [autoRenew, setAutoRenew] = useState(true);
  const [negotiatedTotal, setNegotiatedTotal] = useState("");
  const [termSale, setTermSale] = useState<any>(null), [editTerm, setEditTerm] = useState(""), [editRenew, setEditRenew] = useState(true);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const [startsOn, setStartsOn] = useState(today);
  const [limitedDiscount, setLimitedDiscount] = useState(false);
  const [discountFrom, setDiscountFrom] = useState(today.slice(0, 8) + (Number(today.slice(8)) <= 1 ? "01" : "16"));
  const [discountTo, setDiscountTo] = useState(licensePeriodEnd(today, "monthly"));
  const [options, setOptions] = useState<Record<string, PackageOptions>>({});
  const updateOption = (key: string, patch: PackageOptions) => setOptions(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const billingStart = customMode ? today : startsOn;
  const calendarLocale = { de, en: enGB, es, nl }[language];
  const { data: sales = [], error: salesError } = useQuery({ queryKey: ["license-sales", partnerId, tenantId], queryFn: async () => { let q = db.from("license_sales").select("*, tenants(name,setup_status)").order("created_at", { ascending: false }); if (partnerId) q = q.eq("partner_id", partnerId); if (tenantId) q = q.eq("tenant_id", tenantId); const { data, error } = await q; if (error) throw error; return data || []; } });
  const { data: tenants = [] } = useQuery({ queryKey: ["license-sale-tenants", partnerId], enabled: open, queryFn: async () => { let q = db.from("tenants").select("id,name,partner_id,setup_status").is("deleted_at", null).order("name"); if (partnerId) q = q.eq("partner_id", partnerId); const { data, error } = await q; if (error) throw error; return data || []; } });
  const inSetup = (tenants as any[]).find((x: any) => x.id === tenant)?.setup_status === "setup";
  const catalogPartnerId = saleCatalogPartner(partnerId, tenants.find((x: any) => x.id === tenant));
  const { data: catalog = [], error: catalogError, isFetching: catalogFetching } = useQuery({ ...partnerCatalogRefresh, queryKey: ["license-sale-catalog", catalogPartnerId], enabled: open, queryFn: async () => {
    const results = await Promise.all([db.from("pricing_packages").select("code,name,uvp,ek,always_active,requires_package,requires_any_other").eq("active", true).order("sort"), db.from("pricing_unit_prices").select("code,name,uvp,ek,new_sale_uvp,partner_available")]);
    for (const r of results) if (r.error) throw r.error;
    const defs = results[0].data ?? [];
    let portfolio: string[] | null = null, links: any[] = [];
    if (catalogPartnerId) {
      const [pm, ln] = await Promise.all([db.from("partner_modules").select("module_code").eq("partner_id", catalogPartnerId), db.from("pricing_package_modules").select("package_code,module_code")]);
      if (pm.error) throw pm.error; if (ln.error) throw ln.error;
      portfolio = (pm.data ?? []).map((r: any) => r.module_code); links = ln.data ?? [];
    }
    return packageSaleCatalog(defs, results[1].data ?? [], !!catalogPartnerId).map(p => ({ ...p, def: defs.find((d: any) => d.code === p.code), locked: !!portfolio && (p.kind === "package" ? !isPackageUnlocked(p.code, links, portfolio) : p.code === "charge_point" ? !isPackageUnlocked("p4_charging", links, portfolio) : p.code === "extra_location" ? !portfolio.includes("locations") : false) }));
  } });
  const { data: usageUnits = [] } = useQuery({ queryKey: ["license-usage-units"], enabled: open, queryFn: async () => { const { data, error } = await db.from("pricing_unit_prices").select("code,name,unit,uvp,ek,new_sale_uvp").in("code", ["charge_point", "extra_location", "charging_session"]); if (error) throw error; return data ?? []; } });
  // Bestand des gewählten Kunden für die Voraussetzungsprüfung
  const { data: state, error: stateError, isFetching: stateFetching } = useQuery({ queryKey: ["license-sale-state", tenant], enabled: open && !!tenant, queryFn: async () => {
    const [s, b, l, c] = await Promise.all([
      db.from("license_sales").select("product_code,ended_on,term_months,auto_renew,starts_on").eq("tenant_id", tenant).eq("product_kind", "package").or(`ended_on.is.null,ended_on.gte.${today}`),
      db.from("tenant_package_bookings").select("package_code").eq("tenant_id", tenant).is("cancelled_at", null),
      db.from("locations").select("id", { count: "exact", head: true }).eq("tenant_id", tenant),
      db.from("charge_points").select("id", { count: "exact", head: true }).eq("tenant_id", tenant),
    ]);
    for (const result of [s,b,l,c]) if (result.error) throw result.error;
    return { packages: [...(s.data ?? []).map((x: any) => x.product_code), ...(b.data ?? []).map((x: any) => x.package_code)] as string[], locations: l.count ?? 0, chargePoints: c.count ?? 0 };
  } });
  const selectedItems: any[] = catalog.filter((p: any) => !p.locked && products.includes(`${p.kind}:${p.code}`));
  const hasPartner = !!(tenants.find((x: any) => x.id === tenant)?.partner_id ?? partnerId);
  const keyOf = (p: any) => `${p.kind}:${p.code}`;
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const quantityFor = (p: any) => p.quantityEnabled ? Number(quantities[keyOf(p)] ?? "1") : 1;
  const quantityValid = selectedItems.every(p => Number.isInteger(quantityFor(p)) && quantityFor(p) >= 1 && quantityFor(p) <= 100000);
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, string>>({});
  const discountFor = (p: any) => itemDiscounts[keyOf(p)] ?? discount;
  const optionFor = (p: any): PackageOptions => options[keyOf(p)] ?? {};
  const windowFor = (p: any) => { const o = optionFor(p); return { limited: o.limited ?? limitedDiscount, from: o.from ?? discountFrom, to: o.to ?? discountTo, after: o.after ?? "continue" }; };
  const windowValid = selectedItems.every(p => { const w = windowFor(p); return !w.limited || discountWindowValid(w.from, w.to, startsOn); });
  const quoteFor = (p: any) => packageDiscount(listPrice(p, hasPartner), optionFor(p).value ?? discountFor(p), optionFor(p).mode ?? "percent", prices[keyOf(p)]);
  const priceFor = (p: any) => quoteFor(p).amount;
  const isIndividual = (p: any) => hasPartner ? quoteFor(p).individual : prices[keyOf(p)] !== undefined && prices[keyOf(p)] !== "" && isIndividualPrice(priceFor(p), listPrice(p, false));
  const changeDiscount = (value: string, key?: string) => {
    if (key) {
      setItemDiscounts(prev => ({ ...prev, [key]: value }));
      setPrices(prev => { const next = { ...prev }; delete next[key]; return next; });
    } else { setDiscount(value); setItemDiscounts({}); setPrices({}); setOptions(prev => Object.fromEntries(Object.entries(prev).map(([key, o]) => [key, { ...o, value: undefined, mode: "percent" }]))); }
  };
  const anyIndividual = selectedItems.some(isIndividual);
  const onceSelected = selectedItems.some((p: any) => p.onceOnly);
  const recurringSelected = selectedItems.some((p: any) => !p.onceOnly);
  useEffect(() => { if (onceSelected && !recurringSelected) setCadence("once"); }, [onceSelected, recurringSelected]);
  const itemCadence = (p: any): BillingCadence => packageCadence(p, optionFor(p).cadence ?? cadence);
  const owned = state?.packages ?? [];
  const allOnce = selectedItems.length > 0 && selectedItems.every(p => itemCadence(p) === "once");
  const pickedPackages = selectedItems.filter((p: any) => p.kind === "package").map((p: any) => p.code);
  const prereqFor = (p: any) => p.kind === "package" && p.def
    ? (p.def.requires_package === P1 && !owned.includes(P1) && !pickedPackages.includes(P1) ? `${p.name}: ${T("needsP1")}` : p.def.requires_any_other && owned.length === 0 && (state?.chargePoints ?? 0) === 0 && !selectedItems.some(p => p.code === "charge_point") && !pickedPackages.some((c: string) => c !== p.code) ? `${p.name}: ${T("needsOther")}` : null)
    : null;
  const prereqs = selectedItems.map(prereqFor).filter(Boolean) as string[];
  if (selectedItems.some(p => p.code === "extra_location") && [...owned, ...pickedPackages].includes("p6_enterprise")) prereqs.push(T("enterpriseIncluded"));
  const showP6Hint = !!state && enterpriseHint(state.locations, [...owned, ...pickedPackages]);
  const togglePick = (key: string, on: boolean) => setProducts(prev => on ? [...new Set([...prev, key])] : prev.filter(k => k !== key));
  const onceNeedsTerm = selectedItems.some((p: any) => itemCadence(p) === "once" && p.code !== "setup") && !(term && Number(term) >= 1);
  const totalEligible = selectedItems.length > 0 && selectedItems.every(p => itemCadence(p) === "once" && p.code !== "setup" && !windowFor(p).limited);
  const hasTotal = negotiatedTotal.trim() !== "";
  const totalAmount = parseBookingTotal(negotiatedTotal);
  const totalValid = !hasTotal || (totalEligible && Number.isFinite(totalAmount) && totalAmount <= 100000000 && Number(term) >= 1 && reason.trim().length >= 5);
  const totalParts = hasTotal && totalValid ? allocateBookingTotal(totalAmount, selectedItems.map(p => listPrice(p, hasPartner) * quantityFor(p))) : [];
  const draftTotal = selectedItems.reduce((sum: number, p: any) => { const w = windowFor(p); if (itemCadence(p) === "once" && p.code !== "setup") return sum + (term && Number(term) >= 1 ? onceTermAmount(priceFor(p), listPrice(p, hasPartner), quantityFor(p), billingStart, Number(term), w.limited ? w.from : undefined, w.limited ? w.to : undefined) : 0); const end = w.limited && w.after === "end" ? (w.to < licensePeriodEnd(billingStart, itemCadence(p)) ? w.to : licensePeriodEnd(billingStart, itemCadence(p))) : licensePeriodEnd(billingStart, itemCadence(p)); return sum + discountPeriodAmount(priceFor(p), listPrice(p, hasPartner), quantityFor(p), billingStart, end, itemCadence(p), w.limited ? w.from : undefined, w.limited ? w.to : undefined); }, 0);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["license-sales"] }); qc.invalidateQueries({ queryKey: ["license-sale-state"] }); qc.invalidateQueries({ queryKey: ["partner-customer-invoices"] }); qc.invalidateQueries({ queryKey: ["super-admin-invoices"] }); qc.invalidateQueries({ queryKey: ["partner-purchase-invoices"] }); qc.invalidateQueries({ queryKey: ["tenant-modules"] }); qc.invalidateQueries({ queryKey: ["partner-tenant-modules"] }); };
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
    if (stateError || stateFetching) return toast.error(stateError ? (stateError as Error).message : T("invalid"));
    if (!windowValid) return toast.error(T("discountWindowInvalid"));
    if (!totalValid) return toast.error(T("totalInvalid"));
    if (!tenant || !selectedItems.length) return toast.error(T("invalid"));
    for (const p of selectedItems) if (!saleSchema.safeParse({ tenant, kind: p.kind, code: p.code, quantity: quantityFor(p), cadence: itemCadence(p), price: priceFor(p), payment }).success) return toast.error(`${p.name}: ${T("invalid")}`);
    if ((anyIndividual || hasTotal) && reason.trim().length < 5) return toast.error(T("reason"));
    setBusy(true);
    // Paket 1 zuerst buchen, damit abhängige Pakete ihre Voraussetzung finden
    const ordered = [...selectedItems].sort((x: any, y: any) => ((x.code === P1 ? 0 : x.quantityEnabled ? 1 : 2) - (y.code === P1 ? 0 : y.quantityEnabled ? 1 : 2)));
    const done: string[] = [];
    try {
      for (const p of ordered) {
        const fixedTotal = hasTotal ? totalParts[selectedItems.indexOf(p)] : undefined;
        const { data, error } = await supabase.functions.invoke("license-sale", { body: { tenant_id: tenant, product_kind: p.kind, product_code: p.code, quantity: quantityFor(p), cadence: itemCadence(p), sale_price: fixedTotal !== undefined ? Math.round(fixedTotal / Number(term) / quantityFor(p) * 100) / 100 : priceFor(p), negotiated_once_total: fixedTotal, starts_on: startsOn, payment_method: payment, request_id: `${request.slice(0, 24)}${String(catalog.indexOf(p)).padStart(12, "0")}`, price_reason: isIndividual(p) || hasTotal ? reason.trim() : undefined, term_months: term ? Number(term) : null, auto_renew: autoRenew, customer_discount_pct: hasTotal ? 0 : quoteFor(p).pct, discount_starts_on: windowFor(p).limited ? windowFor(p).from : null, discount_ends_on: windowFor(p).limited ? windowFor(p).to : null, discount_after: windowFor(p).limited ? windowFor(p).after : "continue" } });
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
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">{T("contracts")}</h2>{canEdit && <Button variant="outline" onClick={() => { setRequest(crypto.randomUUID()); setNegotiatedTotal(""); setProducts([]); setOptions({}); setQuantities({}); setPrices({}); setDiscount("0"); setItemDiscounts({}); setStartsOn(today); setLimitedDiscount(false); setDiscountFrom(today.slice(0, 8) + (Number(today.slice(8)) <= 1 ? "01" : "16")); setDiscountTo(licensePeriodEnd(today, "monthly")); setReason(""); setTerm(""); setAutoRenew(true); setCustomMode(false); setCustomLines([emptyInvoiceLine()]); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />{T("sell")}</Button>}</div>
    {salesError && <p className="text-destructive">{(salesError as Error).message}</p>}
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{T("customer")}</TableHead><TableHead>{T("product")}</TableHead><TableHead>{T("quantity")}</TableHead><TableHead>{T("cadence")}</TableHead><TableHead>{T("price")}</TableHead><TableHead>EK AICONO</TableHead><TableHead>{T("term")}</TableHead><TableHead>{T("next")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {sales.map((s: any) => <TableRow key={s.id}><TableCell>{s.tenants?.name}</TableCell><TableCell>{s.label}</TableCell><TableCell>{s.quantity.toLocaleString("de-DE")}</TableCell><TableCell>{T(s.cadence)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-1">{eur(Number(s.sale_price))}{s.price_individual && <Badge variant="outline" title={s.price_reason ?? ""}>{T("individual")}</Badge>}</div>{(Number(s.customer_discount_pct) > 0 || (s.list_sale_price != null && Number(s.list_sale_price) !== Number(s.sale_price))) && <div className="text-xs text-muted-foreground">VK {eur(Number(s.list_sale_price ?? s.sale_price))}{Number(s.customer_discount_pct) > 0 ? ` − ${Number(s.customer_discount_pct).toLocaleString("de-DE")} %` : ""}</div>}{s.discount_starts_on && <div className="text-xs text-muted-foreground">{new Date(s.discount_starts_on + "T00:00:00").toLocaleDateString("de-DE")} – {new Date(s.discount_ends_on + "T00:00:00").toLocaleDateString("de-DE")}<div>{s.discount_after === "end" ? T("stopKeepData") : `${T("discountAfter")}: ${eur(Number(s.list_sale_price))}`}</div></div>}</TableCell><TableCell className="whitespace-nowrap">{s.partner_id ? <>{eur(Number(s.purchase_price))}<div className="text-xs text-muted-foreground">{T("margin")} {eur(Number(s.sale_price) - Number(s.purchase_price))}</div></> : "—"}</TableCell><TableCell className="text-xs whitespace-nowrap">{termLabel(s.term_months, s.auto_renew, s.starts_on, T)}</TableCell><TableCell>{s.ended_on && s.ended_on < today ? T("ended") : s.ended_on ? `${T("endsOn")} ${new Date(s.ended_on + "T00:00:00").toLocaleDateString("de-DE")}` : s.tenants?.setup_status === "setup" ? T("billingPendingHandover") : s.next_period ? new Date(s.next_period + "T00:00:00").toLocaleDateString("de-DE") : "—"}</TableCell><TableCell className="whitespace-nowrap">{canEdit && ["package","unit"].includes(s.product_kind) && !(s.ended_on && s.ended_on < today) && <PackageCorrection sale={s} onSaved={refresh} />}{canEdit && !(s.ended_on && s.ended_on < today) && <Button variant="ghost" size="icon" title={T("termEdit")} onClick={() => { setTermSale(s); setEditTerm(s.term_months ? String(s.term_months) : ""); setEditRenew(s.auto_renew !== false); }}><CalendarClock className="h-4 w-4" /></Button>}{canEdit && !s.ended_on && <Button variant="ghost" size="icon" title={T("end")} onClick={() => endSale(s.id)}><Square className="h-4 w-4" /></Button>}</TableCell></TableRow>)}
      {!sales.length && !salesError && <TableRow><TableCell colSpan={9} className="text-muted-foreground">{T("empty")}</TableCell></TableRow>}
    </TableBody></Table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{T(customMode ? "customBilling" : "sell")}</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 space-y-1"><Label>{T("customer")}</Label><Select value={tenant} onValueChange={setTenant} disabled={!!tenantId}><SelectTrigger><SelectValue placeholder={T("choose")} /></SelectTrigger><SelectContent>{tenants.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2 space-y-1"><Label>{T("product")}</Label>
        {!customMode && <div className="rounded-md border divide-y max-h-64 overflow-y-auto">{catalog.map((p: any) => { const key = keyOf(p); const on = !p.locked && products.includes(key); return <label key={key} className={`flex items-center gap-3 px-3 py-2 text-sm ${p.locked ? "opacity-50" : "cursor-pointer"}`}><Checkbox checked={on} disabled={p.locked || catalogFetching} onCheckedChange={(v) => togglePick(key, !!v)} /><span className="flex-1">{p.name}</span><span className="text-muted-foreground whitespace-nowrap">{p.locked ? "Freischaltung bei AICONO anfragen" : `VK ${eur(listPrice(p, hasPartner))}${hasPartner ? ` · EK ${eur(p.ek)}` : ""}`}</span></label>; })}</div>}
        {!customMode && catalogError && <p className="text-destructive">{(catalogError as Error).message}</p>}
        <div className="flex items-center gap-2 pt-3 pb-2"><Switch id="custom-invoice-mode" checked={customMode} onCheckedChange={setCustomMode} /><Label htmlFor="custom-invoice-mode">{T("customBilling")}</Label></div>
        {!customMode && <>
        <p className="text-xs text-muted-foreground flex gap-1"><Info className="h-3 w-3 mt-0.5 shrink-0" />{T("autoCounted")}</p>
        {stateError && <p className="text-sm text-destructive">{(stateError as Error).message}</p>}
        {prereqs.map(m => <p key={m} className="text-sm text-destructive">{m}</p>)}
        {showP6Hint && <p className="text-sm text-muted-foreground">{T("p6Cheaper")}</p>}
        </>}
      </div>
      {customMode ? <div className="sm:col-span-2"><InvoiceLineEditor lines={customLines} onChange={setCustomLines} /></div> : <>
      {<div className="space-y-1"><Label htmlFor="booking-discount">{T("customerDiscount")}</Label><Input inputMode="decimal" value={discount} id="booking-discount" aria-label={T("customerDiscount")} onChange={e => changeDiscount(e.target.value)} /><p className="text-xs text-muted-foreground">{T("customerDiscountHint")}</p></div>}
      <div className="space-y-1"><Label htmlFor="limited-discount">{T("discountDuration")}</Label><div className="flex items-center gap-2 h-10"><Switch id="limited-discount" checked={limitedDiscount} onCheckedChange={setLimitedDiscount} /><span className="text-sm">{T(limitedDiscount ? "discountLimited" : "discountPermanent")}</span></div></div>
      {limitedDiscount && <><BookingDatePicker label={T("discountFrom")} value={discountFrom} onChange={setDiscountFrom} disabledDate={date => ![1, 16].includes(date.getDate()) || format(date, "yyyy-MM-dd") < startsOn} /><BookingDatePicker label={T("discountTo")} value={discountTo} onChange={setDiscountTo} disabledDate={date => (date.getDate() !== 15 && date.getDate() !== new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) || format(date, "yyyy-MM-dd") < discountFrom} /><p className="sm:col-span-2 text-xs text-muted-foreground">{T("discountWindowHint")}</p>{!windowValid && <p className="sm:col-span-2 text-sm text-destructive">{T("discountWindowInvalid")}</p>}</>}
      {selectedItems.length > 0 && <div className="sm:col-span-2 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{T("product")}</TableHead><TableHead>{T("quantity")}</TableHead><TableHead className="text-right">VK</TableHead><TableHead className="text-right">{T("discountShort")}</TableHead><TableHead className="text-right">{T("customerPrice")}</TableHead>{hasPartner && <><TableHead className="text-right">EK AICONO</TableHead><TableHead className="text-right">{T("margin")}</TableHead></>}</TableRow></TableHeader><TableBody>
        {selectedItems.map((p: any) => { const vk = listPrice(p, hasPartner), cp = priceFor(p); return <TableRow key={keyOf(p)}><TableCell className="text-sm">{p.name}{isIndividual(p) && <Badge variant="outline" className="ml-1">{T("individual")}</Badge>}<div className="mt-2"><Select value={itemCadence(p)} disabled={p.onceOnly} onValueChange={v => updateOption(keyOf(p), { cadence: v as BillingCadence })}><SelectTrigger className="h-8" aria-label={`${T("cadence")} – ${p.name}`}><SelectValue /></SelectTrigger><SelectContent>{(["once","monthly","quarterly","halfyearly","yearly"] as const).map(c => <SelectItem key={c} value={c} disabled={p.quantityEnabled && c === "once"}>{T(c)}</SelectItem>)}</SelectContent></Select></div></TableCell><TableCell>{p.quantityEnabled ? <Input type="number" min={1} max={100000} step={1} className="h-8 w-20" aria-label={`${T("quantity")} – ${p.name}`} value={quantities[keyOf(p)] ?? "1"} onChange={e => setQuantities(prev => ({ ...prev, [keyOf(p)]: e.target.value }))} /> : "1"}</TableCell><TableCell className="text-right whitespace-nowrap">{eur(vk)}</TableCell>{<TableCell className="text-right whitespace-nowrap"><Select value={optionFor(p).mode ?? "percent"} onValueChange={v => { updateOption(keyOf(p), { mode: v as "percent" | "absolute", value: "0" }); changeDiscount("0", keyOf(p)); }}><SelectTrigger className="h-8 w-20 ml-auto mb-1" aria-label={`${T("discountMode")} – ${p.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="absolute">€</SelectItem></SelectContent></Select><Input className="h-8 w-20 ml-auto text-right" inputMode="decimal" aria-label={`${T("discountShort")} (${optionFor(p).mode === "absolute" ? "€" : "%"}) – ${p.name}`} value={optionFor(p).value ?? (prices[keyOf(p)] !== undefined && prices[keyOf(p)] !== "" ? String(quoteFor(p).pct).replace(".", ",") : discountFor(p))} onChange={e => { updateOption(keyOf(p), { value: e.target.value }); changeDiscount(e.target.value, keyOf(p)); }} /></TableCell>}<TableCell className="text-right"><Input className="h-8 w-24 ml-auto text-right" inputMode="decimal" aria-label={`${T("customerPrice")} – ${p.name}`} value={prices[keyOf(p)] ?? String(priceFor(p)).replace(".", ",")} onChange={e => setPrices(prev => ({ ...prev, [keyOf(p)]: e.target.value }))} /></TableCell>{hasPartner && <><TableCell className="text-right whitespace-nowrap">{eur(p.ek)}</TableCell><TableCell className={`text-right whitespace-nowrap ${cp - p.ek < 0 ? "text-destructive" : ""}`}>{eur((cp - p.ek) * quantityFor(p))}</TableCell></>}</TableRow>; })}
      </TableBody></Table><p className="text-xs text-muted-foreground mt-1">{hasPartner ? T("partnerPriceHint") : T("directPriceHint")}</p></div>}
      {selectedItems.map((p: any) => { const w = windowFor(p); return <div key={`options:${keyOf(p)}`} className="sm:col-span-2 border-t pt-3 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><Label>{p.name} · {T("discountDuration")}</Label><div className="flex items-center gap-2"><Switch aria-label={`${T("discountLimited")} – ${p.name}`} checked={w.limited} onCheckedChange={v => updateOption(keyOf(p), { limited: v })} /><span className="text-sm">{T(w.limited ? "discountLimited" : "discountPermanent")}</span></div></div>{w.limited && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><BookingDatePicker label={`${T("discountFrom")} – ${p.name}`} value={w.from} onChange={v => updateOption(keyOf(p), { from: v })} /><BookingDatePicker label={`${T("discountTo")} – ${p.name}`} value={w.to} onChange={v => updateOption(keyOf(p), { to: v })} /><div className="sm:col-span-2"><Label>{T("afterDiscount")}</Label><Select value={w.after} onValueChange={v => updateOption(keyOf(p), { after: v as "continue" | "end" })}><SelectTrigger aria-label={`${T("afterDiscount")} – ${p.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="continue">{T("keepPaid")}</SelectItem><SelectItem value="end">{T("stopKeepData")}</SelectItem></SelectContent></Select></div></div>}</div>; })}
      {usageUnits.some((u: any) => u.code === "charging_session") && <div className="sm:col-span-2 border-t pt-2 text-sm"><p className="font-medium">{T("meteredEvents")}</p><p>{usageUnits.filter((u: any) => u.code === "charging_session").map((u: any) => <span key={u.code}>{T("chargingSession")} · VK {eur(Number(u.new_sale_uvp ?? u.uvp))}{hasPartner ? ` · EK ${eur(Number(u.ek))}` : ""}</span>)}</p></div>}
      {(anyIndividual || hasTotal) && <div className="sm:col-span-2 space-y-1"><Label>{T("reason")}</Label><Textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>}
      </>}
      {inSetup && <p className="sm:col-span-2 rounded-md border p-2 text-sm text-muted-foreground">{T("billingAtHandover")}</p>}{!customMode && !inSetup && <div className="space-y-1 sm:col-span-2"><Label htmlFor="package-start">{T("startDate")}</Label><Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}><PopoverTrigger asChild><Button id="package-start" variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{new Date(startsOn + "T00:00:00").toLocaleDateString("de-DE")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" locale={calendarLocale} selected={new Date(startsOn + "T00:00:00")} defaultMonth={new Date(startsOn + "T00:00:00")} onSelect={date => { if (date) { setStartsOn(format(date, "yyyy-MM-dd")); setStartPickerOpen(false); } }} initialFocus className="pointer-events-auto p-3" /></PopoverContent></Popover></div>}
      <div className="space-y-1"><Label>{T("cadence")}</Label><Select value={cadence} onValueChange={v => setCadence(v as BillingCadence)} disabled={!customMode && onceSelected && !recurringSelected}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["once","monthly","quarterly","halfyearly","yearly"] as const).map(v => <SelectItem key={v} value={v}>{T(v)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{T("payment")}</Label><Select value={payment} onValueChange={setPayment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice">{T("invoice")}</SelectItem><SelectItem value="sepa">SEPA</SelectItem></SelectContent></Select></div>
      {!customMode && <><div className="space-y-1"><Label>{T("termMonths")}</Label><Input inputMode="numeric" placeholder={T("unlimited")} value={term} onChange={e => setTerm(e.target.value.replace(/\D/g, ""))} />{term && !termValid(term) && <p className="text-xs text-destructive">{T("termInvalid")}</p>}{onceNeedsTerm && <p className="text-xs text-destructive">{T("onceNeedsTerm")}</p>}</div>
      {(totalEligible || hasTotal) && <div className="space-y-1"><Label htmlFor="booking-total">{T("negotiatedTotal")}</Label><Input id="booking-total" inputMode="decimal" value={negotiatedTotal} onChange={e => setNegotiatedTotal(e.target.value)} />{!totalValid && <p className="text-xs text-destructive">{T("totalInvalid")}</p>}</div>}
      <div className="space-y-1"><Label>{T("afterTerm")}</Label><div className="flex items-center gap-2 h-10"><Switch checked={allOnce ? false : autoRenew} disabled={!term || allOnce} onCheckedChange={setAutoRenew} /><span className="text-sm">{autoRenew && !allOnce ? T("renews") : T("endsAuto")}</span></div></div>
      </>}
      <div className="sm:col-span-2 text-sm border-t pt-3 space-y-1"><p>{T("start")}: {new Date(billingStart + "T00:00:00").toLocaleDateString("de-DE")} – {new Date((allOnce && term && termValid(term) ? termEnd(billingStart, Number(term)) : licensePeriodEnd(billingStart,cadence)) + "T00:00:00").toLocaleDateString("de-DE")}</p>{!customMode && term && termValid(term) && <p>{autoRenew && !allOnce ? T("minTermUntil") : T("endsOn")}: {new Date(termEnd(billingStart, Number(term)) + "T00:00:00").toLocaleDateString("de-DE")}</p>}<p>{T("draft")}: {eur(customMode ? (parsedCustom.success ? parsedCustom.data.reduce((sum, line) => sum + licenseAmount(line.unit_price, line.quantity, today, licensePeriodEnd(today,cadence),cadence), 0) : 0) : hasTotal && totalValid ? totalAmount : draftTotal)}</p><p className="text-xs text-muted-foreground">{T("halfMonthHint")}</p></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{T("cancel")}</Button><Button disabled={busy || !tenant || (customMode ? !parsedCustom.success : catalogFetching || !!catalogError || stateFetching || !!stateError || !selectedItems.length || !windowValid || !totalValid || !quantityValid || !termValid(term) || onceNeedsTerm || prereqs.length > 0 || (anyIndividual && reason.trim().length < 5))} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{T("confirm")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!termSale} onOpenChange={(v) => !v && setTermSale(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{T("termEdit")}{termSale ? ` – ${termSale.label}` : ""}</DialogTitle></DialogHeader><div className="space-y-3">
      <p className="text-sm text-muted-foreground">{T("start")}: {termSale ? new Date(termSale.starts_on + "T00:00:00").toLocaleDateString("de-DE") : ""}</p>
      <div className="space-y-1"><Label>{T("termMonths")}</Label><Input inputMode="numeric" placeholder={T("unlimited")} value={editTerm} onChange={e => setEditTerm(e.target.value.replace(/\D/g, ""))} /></div>
      <div className="flex items-center gap-2"><Switch checked={editRenew} disabled={!editTerm} onCheckedChange={setEditRenew} /><span className="text-sm">{editRenew ? T("renews") : T("endsAuto")}</span></div>
      {termSale && editTerm && termValid(editTerm) && <p className="text-sm">{editRenew ? T("minTermUntil") : T("endsOn")}: {new Date(termEnd(termSale.starts_on, Number(editTerm)) + "T00:00:00").toLocaleDateString("de-DE")}</p>}
    </div><DialogFooter><Button variant="outline" onClick={() => setTermSale(null)}>{T("cancel")}</Button><Button disabled={!termValid(editTerm)} onClick={saveTerm}>{T("termSave")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
