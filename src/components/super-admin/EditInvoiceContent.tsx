import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useSATranslation } from "@/hooks/useSATranslation";

interface LineItem {
  code: string;
  label: string;
  amount: number;
  type: string;
  quantity?: number;
}

interface Props {
  invoice: any;
  editStatus: string;
  setEditStatus: (s: string) => void;
  onSave: (updates: { line_items: LineItem[]; module_total: number; support_total: number; amount: number }) => void;
  onCancel: () => void;
  isPending: boolean;
}

export default function EditInvoiceContent({ invoice, editStatus, setEditStatus, onSave, onCancel, isPending }: Props) {
  const { t } = useSATranslation();
  const isLocked = !!invoice.lexware_invoice_id;

  const initialItems: LineItem[] = Array.isArray(invoice.line_items) ? invoice.line_items.map((item: any) => ({
    code: item.code ?? "",
    label: item.label ?? item.code ?? "",
    amount: Number(item.amount ?? 0),
    type: item.type ?? "module",
    quantity: item.quantity ?? 1,
  })) : [];

  const [items, setItems] = useState<LineItem[]>(initialItems);

  const totals = useMemo(() => {
    const moduleTot = items.filter(i => i.type === "module").reduce((s, i) => s + i.amount * (i.quantity ?? 1), 0);
    const supportTot = items.filter(i => i.type === "support").reduce((s, i) => s + i.amount * (i.quantity ?? 1), 0);
    return { module: moduleTot, support: supportTot, total: moduleTot + supportTot };
  }, [items]);

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const addItem = () => setItems(prev => [...prev, { code: "", label: "", amount: 0, type: "module", quantity: 1 }]);

  const handleSave = () => {
    onSave({
      line_items: items,
      module_total: totals.module,
      support_total: totals.support,
      amount: totals.total,
    });
  };

  return (
    <div className="space-y-4 py-2">
      {/* Status */}
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={editStatus} onValueChange={setEditStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Entwurf</SelectItem>
            <SelectItem value="sent">Gesendet</SelectItem>
            <SelectItem value="paid">Bezahlt</SelectItem>
            <SelectItem value="overdue">Überfällig</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lexware lock notice */}
      {isLocked && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-muted-foreground">
            Dieser Beleg wurde bereits an Lexware übermittelt. Änderungen an den Positionen müssen direkt in Lexware vorgenommen werden.
          </p>
        </div>
      )}

      {/* Line items */}
      <div className="space-y-2">
        <Label>Positionen</Label>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-center">
              <Input
                value={item.label}
                onChange={e => updateItem(idx, "label", e.target.value)}
                placeholder="Bezeichnung"
                disabled={isLocked}
                className="text-sm"
              />
              <Input
                type="number"
                value={item.quantity ?? 1}
                onChange={e => updateItem(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isLocked}
                className="text-sm text-right"
                min={1}
              />
              <Input
                type="number"
                step="0.01"
                value={item.amount}
                onChange={e => updateItem(idx, "amount", parseFloat(e.target.value) || 0)}
                disabled={isLocked}
                className="text-sm text-right"
              />
              <span className="text-sm text-muted-foreground text-right">
                {(item.amount * (item.quantity ?? 1)).toFixed(2)} €
              </span>
              {!isLocked && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
              {isLocked && <div className="w-8" />}
            </div>
          ))}
        </div>
        {/* Column labels */}
        {items.length > 0 && (
          <div className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 text-xs text-muted-foreground px-1">
            <span>Bezeichnung</span>
            <span className="text-right">Menge</span>
            <span className="text-right">Einzelpreis</span>
            <span className="text-right">Summe</span>
            <span />
          </div>
        )}
        {!isLocked && (
          <Button size="sm" variant="outline" onClick={addItem} className="mt-1">
            <Plus className="h-3.5 w-3.5 mr-1" /> Position hinzufügen
          </Button>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4 text-sm border-t pt-3">
        <div><span className="text-muted-foreground">Module:</span> <span className="font-medium">{totals.module.toFixed(2)} €</span></div>
        <div><span className="text-muted-foreground">Support:</span> <span className="font-medium">{totals.support.toFixed(2)} €</span></div>
        <div><span className="text-muted-foreground">Gesamt:</span> <span className="font-bold">{totals.total.toFixed(2)} €</span></div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button disabled={isPending} onClick={handleSave}>
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {t("common.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}
