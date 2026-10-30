import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { packageSaleCatalog } from "@/lib/packageSaleCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { licenseAmount, licensePeriodEnd, saleSchema, type BillingCadence } from "@/lib/licenseBilling";
import { useTranslation } from "@/hooks/useTranslation";
const db = supabase as any;
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
export function LicenseSales({ partnerId, tenantId, canEdit = true }: { partnerId?: string; tenantId?: string; canEdit?: boolean }) {
  const { t } = useTranslation(); const T = (k: string) => t(`license.${k}` as any);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState(tenantId || ""), [product, setProduct] = useState(""), [quantity, setQuantity] = useState("1"), [price, setPrice] = useState(""), [cadence, setCadence] = useState<BillingCadence>("monthly"), [payment, setPayment] = useState("invoice"), [request, setRequest] = useState(crypto.randomUUID());
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const { data: sales = [], error: salesError } = useQuery({ queryKey: ["license-sales", partnerId, tenantId], queryFn: async () => { let q = db.from("license_sales").select("*, tenants(name)").order("created_at", { ascending: false }); if (partnerId) q = q.eq("partner_id", partnerId); if (tenantId) q = q.eq("tenant_id", tenantId); const { data, error } = await q; if (error) throw error; return data || []; } });
  const { data: tenants = [] } = useQuery({ queryKey: ["license-sale-tenants", partnerId], enabled: open, queryFn: async () => { let q = db.from("tenants").select("id,name,partner_id").is("deleted_at", null).order("name"); if (partnerId) q = q.eq("partner_id", partnerId); const { data, error } = await q; if (error) throw error; return data || []; } });
  const { data: catalog = [], error: catalogError } = useQuery({ queryKey: ["license-sale-catalog", partnerId], enabled: open, queryFn: async () => {
    const results = await Promise.all([db.from("pricing_packages").select("code,name,uvp,ek,always_active").eq("active", true).order("sort"), db.from("pricing_unit_prices").select("code,name,uvp,ek,new_sale_uvp,partner_available")]);
    for (const r of results) if (r.error) throw r.error;
    return packageSaleCatalog(results[0].data ?? [], results[1].data ?? [], !!partnerId);
  } });
  const selected = catalog.find((p: any) => `${p.kind}:${p.code}` === product);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["license-sales"] }); qc.invalidateQueries({ queryKey: ["partner-customer-invoices"] }); qc.invalidateQueries({ queryKey: ["super-admin-invoices"] }); qc.invalidateQueries({ queryKey: ["partner-purchase-invoices"] }); };
  const save = async () => {
    const parsed = saleSchema.safeParse({ tenant, kind: selected?.kind, code: selected?.code, quantity: Number(quantity), cadence, price: Number(price.replace(",", ".")), payment });
    if (!parsed.success) return toast.error(T("invalid"));
    setBusy(true);
    try {
      // Grants always use the existing server-authorized module path. Packages retain dependency checks.
      const { data, error } = await supabase.functions.invoke("license-sale", { body: { tenant_id: tenant, product_kind: parsed.data.kind, product_code: parsed.data.code, quantity: parsed.data.quantity, cadence, sale_price: parsed.data.price, starts_on: today, payment_method: payment, request_id: request } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(T("created")); refresh(); setOpen(false);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return <section className="space-y-3 min-w-0">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">{T("contracts")}</h2>{canEdit && <Button variant="outline" onClick={() => { setRequest(crypto.randomUUID()); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />{T("sell")}</Button>}</div>
    {salesError && <p className="text-destructive">{(salesError as Error).message}</p>}
    <Table><TableHeader><TableRow><TableHead>{T("customer")}</TableHead><TableHead>{T("product")}</TableHead><TableHead>{T("quantity")}</TableHead><TableHead>{T("cadence")}</TableHead><TableHead>{T("price")}</TableHead><TableHead>{T("next")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {sales.map((s: any) => <TableRow key={s.id}><TableCell>{s.tenants?.name}</TableCell><TableCell>{s.label}</TableCell><TableCell>{s.quantity.toLocaleString("de-DE")}</TableCell><TableCell>{T(s.cadence)}</TableCell><TableCell>{eur(Number(s.sale_price))}</TableCell><TableCell>{s.ended_on ? T("ended") : s.next_period ? new Date(s.next_period + "T00:00:00").toLocaleDateString("de-DE") : "—"}</TableCell><TableCell>{canEdit && !s.ended_on && <Button variant="ghost" size="icon" title={T("end")} onClick={async () => { if (!window.confirm(T("endConfirm"))) return; const { error } = await db.rpc("end_license_sale", { p_sale: s.id }); if (error) toast.error(error.message); else refresh(); }}><Square className="h-4 w-4" /></Button>}</TableCell></TableRow>)}
      {!sales.length && !salesError && <TableRow><TableCell colSpan={7} className="text-muted-foreground">{T("empty")}</TableCell></TableRow>}
    </TableBody></Table>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{T("sell")}</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 space-y-1"><Label>{T("customer")}</Label><Select value={tenant} onValueChange={setTenant} disabled={!!tenantId}><SelectTrigger><SelectValue placeholder={T("choose")} /></SelectTrigger><SelectContent>{tenants.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2 space-y-1"><Label>{T("product")}</Label><Select value={product} onValueChange={v => { setProduct(v); const p = catalog.find((x: any) => `${x.kind}:${x.code}` === v); if (p) { setPrice(String(p.uvp)); setQuantity("1"); } }}><SelectTrigger><SelectValue placeholder={T("choose")} /></SelectTrigger><SelectContent>{catalog.map((p: any) => <SelectItem key={`${p.kind}:${p.code}`} value={`${p.kind}:${p.code}`}>{p.name} · {eur(p.uvp)}</SelectItem>)}</SelectContent></Select>{catalogError && <p className="text-destructive">{(catalogError as Error).message}</p>}</div>
      <div className="space-y-1"><Label>{T("quantity")}</Label><Input type="number" min={1} disabled={selected?.kind === "package"} value={quantity} onChange={e => setQuantity(e.target.value)} /></div><div className="space-y-1"><Label>{T("price")}</Label><Input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
      <div className="space-y-1"><Label>{T("cadence")}</Label><Select value={cadence} onValueChange={v => setCadence(v as BillingCadence)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["once","monthly","quarterly","halfyearly"] as const).map(v => <SelectItem key={v} value={v}>{T(v)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{T("payment")}</Label><Select value={payment} onValueChange={setPayment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice">{T("invoice")}</SelectItem><SelectItem value="sepa">SEPA</SelectItem></SelectContent></Select></div>
      <div className="sm:col-span-2 text-sm border-t pt-3 space-y-1"><p>{T("start")}: {new Date(today + "T00:00:00").toLocaleDateString("de-DE")} – {new Date(licensePeriodEnd(today,cadence) + "T00:00:00").toLocaleDateString("de-DE")}</p><p>{T("draft")}: {eur(licenseAmount(Number(price.replace(",", ".")) || 0, Number(quantity) || 1, today, licensePeriodEnd(today,cadence),cadence))}</p></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{T("cancel")}</Button><Button disabled={busy || !selected || !tenant} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{T("confirm")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}