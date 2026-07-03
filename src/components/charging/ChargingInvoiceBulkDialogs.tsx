import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtCurrency } from "@/lib/formatCharging";
import { format } from "date-fns";
import { ChargingInvoice } from "@/hooks/useChargingInvoices";
import { CheckCircle2, Send } from "lucide-react";

interface CreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: ChargingInvoice[];
  isFinalizing: boolean;
  onFinalize: (ids: string[]) => Promise<void> | void;
}

/** Dialog A: shown right after invoice generation. Allows marking the freshly created drafts as "issued". */
export function CreatedInvoicesDialog({ open, onOpenChange, invoices, isFinalizing, onFinalize }: CreatedDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      // Preselect all drafts
      setSelected(new Set(invoices.filter(i => i.status === "draft").map(i => i.id)));
    }
  }, [open, invoices]);

  const drafts = invoices.filter(i => i.status === "draft");
  const allDraftsSelected = drafts.length > 0 && drafts.every(i => selected.has(i.id));
  const toggle = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (allDraftsSelected) setSelected(new Set());
    else setSelected(new Set(drafts.map(i => i.id)));
  };

  const handleFinalize = async () => {
    const ids = Array.from(selected).filter(id => drafts.some(d => d.id === id));
    if (ids.length === 0) return;
    await onFinalize(ids);
  };

  type InvSortKey = "number" | "customer" | "amount" | "status";
  const { sorted: sortedInvoices, sort, toggle } = useSortableData<any, InvSortKey>(invoices, (inv, k) => {
    switch (k) {
      case "number": return inv.invoice_number || "";
      case "customer": return inv.user_name || "";
      case "amount": return Number(inv.total_amount || 0);
      case "status": return inv.status || "";
      default: return null;
    }
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Erstellte Rechnungen</DialogTitle>
          <DialogDescription>
            {invoices.length} Rechnung(en) wurden im Entwurfsstatus erstellt. Markieren Sie hier alle Rechnungen, die als „Ausgestellt" finalisiert werden sollen. Nur ausgestellte Rechnungen können später per E-Mail versendet werden.
          </DialogDescription>
        </DialogHeader>

        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Keine neuen Rechnungen erstellt.</p>
        ) : (
          <ScrollArea className="max-h-[55vh] pr-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allDraftsSelected}
                      onCheckedChange={toggleAll}
                      disabled={drafts.length === 0}
                      aria-label="Alle Entwürfe auswählen"
                    />
                  </TableHead>
                  <TableHead><SortableHead label="Rechnungsnr." sortKey="number" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label="Kunde" sortKey="customer" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead className="text-right"><SortableHead label="Betrag" sortKey="amount" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedInvoices.map(inv => {
                  const isDraft = inv.status === "draft";
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(inv.id)}
                          onCheckedChange={() => isDraft && toggle(inv.id)}
                          disabled={!isDraft}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{inv.user_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{inv.user_email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmtCurrency(inv.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={inv.status === "issued" ? "secondary" : "outline"}>
                          {inv.status === "issued" ? "Ausgestellt" : "Entwurf"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          <Button
            onClick={handleFinalize}
            disabled={isFinalizing || drafts.length === 0 || Array.from(selected).filter(id => drafts.some(d => d.id === id)).length === 0}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {isFinalizing ? "Wird ausgestellt…" : "Ausgewählte als ausgestellt markieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: ChargingInvoice[]; // invoices in current period
  isFinalizing: boolean;
  isSending: boolean;
  onFinalize: (ids: string[]) => Promise<void> | void;
  onSend: (ids: string[], allowDraft?: boolean) => Promise<void> | void;
}

/** Dialog B: opened from "Per E-Mail senden". Lets the user finalize drafts before sending. */
export function SendInvoicesDialog({ open, onOpenChange, invoices, isFinalizing, isSending, onFinalize, onSend }: SendDialogProps) {
  const [includeResend, setIncludeResend] = useState(false);
  const [selectedToSend, setSelectedToSend] = useState<Set<string>>(new Set());
  const [selectedDrafts, setSelectedDrafts] = useState<Set<string>>(new Set());

  const drafts = invoices.filter(i => i.status === "draft");
  const readyToSend = invoices.filter(i => i.status === "issued" && !i.email_sent_at);
  const alreadySent = invoices.filter(i => !!i.email_sent_at);

  useEffect(() => {
    if (open) {
      setSelectedToSend(new Set(readyToSend.map(i => i.id)));
      setSelectedDrafts(new Set());
      setIncludeResend(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoices]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
  };

  const handleFinalizeSelected = async () => {
    const ids = Array.from(selectedDrafts);
    if (ids.length === 0) return;
    await onFinalize(ids);
    setSelectedDrafts(new Set());
  };

  const handleFinalizeAllDrafts = async () => {
    if (drafts.length === 0) return;
    await onFinalize(drafts.map(d => d.id));
    setSelectedDrafts(new Set());
  };

  const idsToSend = useMemo(() => {
    const list = Array.from(selectedToSend);
    if (includeResend) {
      for (const inv of alreadySent) if (!list.includes(inv.id)) list.push(inv.id);
    }
    return list;
  }, [selectedToSend, includeResend, alreadySent]);

  const handleSend = async () => {
    if (idsToSend.length === 0) return;
    await onSend(idsToSend, false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rechnungen per E-Mail versenden</DialogTitle>
          <DialogDescription>
            Es werden nur Rechnungen mit Status „Ausgestellt" versendet. Entwürfe können hier vorab finalisiert werden.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3 space-y-6">
          {/* Section 1: Ready to send */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Bereit zum Versand ({readyToSend.length})</h4>
            </div>
            {readyToSend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Keine versandbereiten Rechnungen.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={readyToSend.length > 0 && readyToSend.every(i => selectedToSend.has(i.id))}
                        onCheckedChange={() => {
                          if (readyToSend.every(i => selectedToSend.has(i.id))) setSelectedToSend(new Set());
                          else setSelectedToSend(new Set(readyToSend.map(i => i.id)));
                        }}
                      />
                    </TableHead>
                    <TableHead><SortableHead label="Rechnungsnr." sortKey="number" sort={sort} onToggle={toggle} /></TableHead>
                    <TableHead><SortableHead label="Kunde" sortKey="customer" sort={sort} onToggle={toggle} /></TableHead>
                    <TableHead className="text-right"><SortableHead label="Betrag" sortKey="amount" sort={sort} onToggle={toggle} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readyToSend.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedToSend.has(inv.id)}
                          onCheckedChange={() => toggle(selectedToSend, setSelectedToSend, inv.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{inv.user_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{inv.user_email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmtCurrency(inv.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Section 2: Drafts */}
          {drafts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <h4 className="text-sm font-semibold">Noch im Entwurf ({drafts.length})</h4>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleFinalizeSelected} disabled={isFinalizing || selectedDrafts.size === 0}>
                    Auswahl ausstellen
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleFinalizeAllDrafts} disabled={isFinalizing}>
                    Alle ausstellen
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={drafts.every(i => selectedDrafts.has(i.id))}
                        onCheckedChange={() => {
                          if (drafts.every(i => selectedDrafts.has(i.id))) setSelectedDrafts(new Set());
                          else setSelectedDrafts(new Set(drafts.map(i => i.id)));
                        }}
                      />
                    </TableHead>
                    <TableHead><SortableHead label="Rechnungsnr." sortKey="number" sort={sort} onToggle={toggle} /></TableHead>
                    <TableHead><SortableHead label="Kunde" sortKey="customer" sort={sort} onToggle={toggle} /></TableHead>
                    <TableHead className="text-right"><SortableHead label="Betrag" sortKey="amount" sort={sort} onToggle={toggle} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedDrafts.has(inv.id)}
                          onCheckedChange={() => toggle(selectedDrafts, setSelectedDrafts, inv.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{inv.user_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{inv.user_email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmtCurrency(inv.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Section 3: Already sent */}
          {alreadySent.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Bereits versendet ({alreadySent.length})</h4>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={includeResend} onCheckedChange={(v) => setIncludeResend(!!v)} />
                  Trotzdem erneut senden
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Diese Rechnungen werden standardmäßig übersprungen.
              </p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSend} disabled={isSending || idsToSend.length === 0}>
            <Send className="h-4 w-4 mr-2" />
            {isSending ? "Wird versendet…" : `${idsToSend.length} Rechnung(en) jetzt versenden`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
