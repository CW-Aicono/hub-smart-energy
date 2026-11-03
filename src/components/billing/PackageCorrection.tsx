import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { BookingDatePicker } from "./BookingDatePicker";
import { packageDiscount } from "@/lib/packageBookingOptions";
import { discountWindowValid, type BillingCadence } from "@/lib/licenseBilling";
export function PackageCorrection({ sale, onSaved }: { sale: any; onSaved: () => void }) {
  const { t } = useTranslation(); const T = (k: string) => t(`license.${k}` as any);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(String(sale.sale_price)), [quantity, setQuantity] = useState(String(sale.quantity)), [cadence, setCadence] = useState<BillingCadence>(sale.cadence);
  const [mode, setMode] = useState<"percent" | "absolute">("percent"), [discount, setDiscount] = useState(String(sale.customer_discount_pct ?? 0));
  const [limited, setLimited] = useState(!!sale.discount_starts_on), [from, setFrom] = useState(sale.discount_starts_on ?? sale.starts_on), [to, setTo] = useState(sale.discount_ends_on ?? sale.starts_on), [after, setAfter] = useState(sale.discount_after ?? "continue"), [reason, setReason] = useState("");
  const vk = Number(sale.list_sale_price ?? sale.sale_price);
  const valid = (!limited || discountWindowValid(from, to, sale.starts_on)) && Number.isInteger(Number(quantity)) && Number(quantity) >= 1 && Number(price.replace(",", ".")) >= 0 && reason.trim().length >= 5;
  const save = async () => {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("correct_license_sale", { p_sale: sale.id, p_price: Number(price.replace(",", ".")), p_quantity: Number(quantity), p_cadence: cadence, p_discount: packageDiscount(vk, "0", "percent", price).pct, p_from: limited ? from : null, p_to: limited ? to : null, p_after: limited ? after : "continue", p_reason: reason.trim() });
      if (error) throw error;
      toast.success(T(data === "future" ? "correctedFuture" : "correctedDraft")); setOpen(false); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const cancelMistake = async () => {
    if (reason.trim().length < 5 || !window.confirm(T("cancelMistakeConfirm"))) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("cancel_mistaken_license_sale", { p_sale: sale.id, p_reason: reason.trim() });
      if (error) throw error;
      toast.success(T("mistakeCancelled")); setOpen(false); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return <><Button variant="ghost" size="icon" title={T("correct")} aria-label={`${T("correct")} – ${sale.label}`} onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{T("correct")} – {sale.label}</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div><Label>{T("customerPrice")}</Label><Input aria-label={T("customerPrice")} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
    <div><Label>{T("quantity")}</Label><Input aria-label={T("quantity")} type="number" min={1} max={100000} disabled={!["charge_point", "extra_location"].includes(sale.product_code)} value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
    <div><Label>{T("cadence")}</Label><Select value={cadence} onValueChange={v => setCadence(v as BillingCadence)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["once","monthly","quarterly","halfyearly","yearly"] as const).map(c => <SelectItem key={c} value={c} disabled={(["charge_point","extra_location"].includes(sale.product_code) && c === "once") || (sale.product_code === "setup" && c !== "once")}>{T(c)}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>{T("discountShort")}</Label><div className="flex gap-2"><Select value={mode} onValueChange={v => { setMode(v as typeof mode); setDiscount("0"); }}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="absolute">€</SelectItem></SelectContent></Select><Input inputMode="decimal" value={discount} onChange={e => { setDiscount(e.target.value); setPrice(String(packageDiscount(vk, e.target.value, mode).amount)); }} /></div></div>
    <div className="flex items-center gap-2 sm:col-span-2"><Switch checked={limited} onCheckedChange={setLimited} /><Label>{T("discountLimited")}</Label></div>
    {limited && <><BookingDatePicker label={T("discountFrom")} value={from} onChange={setFrom} /><BookingDatePicker label={T("discountTo")} value={to} onChange={setTo} /><div className="sm:col-span-2"><Label>{T("afterDiscount")}</Label><Select value={after} onValueChange={setAfter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="continue">{T("keepPaid")}</SelectItem><SelectItem value="end">{T("stopKeepData")}</SelectItem></SelectContent></Select></div></>}
    <div className="sm:col-span-2"><Label>{T("reason")}</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></div>
    <p className="text-xs text-muted-foreground sm:col-span-2">{T("correctionHint")}</p>
    </div><DialogFooter className="flex-wrap gap-2"><Button variant="destructive" disabled={busy || reason.trim().length < 5} onClick={cancelMistake}><Undo2 className="h-4 w-4 mr-2" />{T("cancelMistake")}</Button><Button variant="outline" onClick={() => setOpen(false)}>{T("cancel")}</Button><Button disabled={busy || !valid} onClick={save}>{T("saveCorrection")}</Button></DialogFooter></DialogContent></Dialog></>;
}