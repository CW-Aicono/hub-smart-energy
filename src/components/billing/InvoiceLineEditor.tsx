import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { emptyInvoiceLine, type CustomInvoiceLine } from "@/lib/customInvoice";
export function InvoiceLineEditor({ lines, onChange }: { lines: CustomInvoiceLine[]; onChange: (lines: CustomInvoiceLine[]) => void }) {
  const { t } = useTranslation();
  const update = (index: number, field: keyof CustomInvoiceLine, value: string) => onChange(lines.map((l, i) => i === index ? { ...l, [field]: value } : l));
  return <div className="space-y-3"><Label>{t("license.customLines")}</Label>
    {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_1fr_2.5rem] sm:grid-cols-[minmax(0,1fr)_5rem_7rem_2.5rem] gap-2">
      <Input className="col-span-3 sm:col-span-1 min-w-0" aria-label={`${t("license.lineLabel")} ${index + 1}`} placeholder={t("license.lineLabel")} maxLength={200} value={line.label} onChange={e => update(index, "label", e.target.value)} />
      <Input className="min-w-0" aria-label={`${t("license.lineQty")} ${index + 1}`} placeholder={t("license.lineQty")} inputMode="numeric" value={line.quantity} onChange={e => update(index, "quantity", e.target.value)} />
      <Input className="min-w-0" aria-label={`${t("license.linePrice")} ${index + 1}`} placeholder={t("license.linePrice")} inputMode="decimal" value={line.unit_price} onChange={e => update(index, "unit_price", e.target.value)} />
      <Button title={t("license.removeLine")} aria-label={`${t("license.removeLine")} ${index + 1}`} variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
    </div>)}<Button variant="outline" size="sm" disabled={lines.length >= 50} onClick={() => onChange([...lines, emptyInvoiceLine()])}><Plus className="h-4 w-4 mr-1" />{t("license.addLine")}</Button></div>;
}