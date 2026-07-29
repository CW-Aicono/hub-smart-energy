import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAdhocSessions, useAdhocSessionEvents } from "@/hooks/useAdhocPayment";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CreditCard, Download, RotateCcw, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";
import { getActiveSupportTenantId } from "@/lib/supportView";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import * as XLSX from "@e965/xlsx";

const STATE_LABEL: Record<string, string> = {
  created: "Angelegt",
  preauth_pending: "Preauth läuft",
  preauth_ok: "Preauth OK",
  preauth_failed: "Preauth fehlgeschlagen",
  charging: "Lädt",
  capture_pending: "Capture läuft",
  captured: "Bezahlt",
  partially_refunded: "Teilerstattet",
  refunded: "Erstattet",
  cancelled: "Abgebrochen",
  failed: "Fehler",
};

const STATE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  captured: "default",
  charging: "secondary",
  preauth_ok: "secondary",
  refunded: "outline",
  partially_refunded: "outline",
  failed: "destructive",
  preauth_failed: "destructive",
  cancelled: "outline",
};

const fmtEur = (cents: number, currency = "EUR") =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency });

const fmtDe = (n?: number | null, digits = 2) =>
  n == null ? "—" : n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function AdHocTransactionsContent({ embedded = false }: { embedded?: boolean } = {}) {
  const { tenant } = useTenant();
  const [state, setState] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");

  const { data: sessions = [], isLoading, refetch } = useAdhocSessions({
    state: state === "all" ? undefined : state,
  });

  const filtered = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s: any) =>
      [s.invoice_number, s.psp_reference, s.charge_point?.name, s.terminal?.terminal_serial, s.customer_email]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q))
    );
  }, [sessions, search]);

  const totals = useMemo(() => {
    return sessions.reduce(
      (acc: any, s: any) => {
        acc.count += 1;
        if (s.state === "captured" || s.state === "partially_refunded") {
          acc.gross += s.captured_amount_cents;
          acc.refunded += s.refunded_amount_cents ?? 0;
          acc.kwh += Number(s.energy_kwh || 0);
        }
        return acc;
      },
      { count: 0, gross: 0, refunded: 0, kwh: 0 }
    );
  }, [sessions]);

  const selected = sessions.find((s: any) => s.id === selectedId) ?? null;
  const { data: events = [] } = useAdhocSessionEvents(selectedId);

  const callOrchestrator = async (action: string, payload: Record<string, any>) => {
    const tenantId = tenant?.id ?? getActiveSupportTenantId();
    const { data, error } = await supabase.functions.invoke("adhoc-charge-orchestrator", {
      body: { action, ...payload, ...(tenantId ? { tenant_id: tenantId } : {}) },
    });
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return null;
    }
    if ((data as any)?.error) {
      toast({ title: "Fehler", description: (data as any).error, variant: "destructive" });
      return null;
    }
    return data;
  };

  const startMockSession = async () => {
    const result = await callOrchestrator("mock_full_cycle", {});
    if (result) {
      toast({ title: "Mock-Session erstellt", description: `Rechnung: ${(result as any).invoice_number ?? "—"}` });
      refetch();
    }
  };

  const runRefund = async () => {
    if (!selected) return;
    const amountCents = Math.round(parseFloat(refundAmount.replace(",", ".") || "0") * 100);
    if (amountCents <= 0 || amountCents > (selected.captured_amount_cents - (selected.refunded_amount_cents ?? 0))) {
      toast({ title: "Ungültiger Betrag", variant: "destructive" });
      return;
    }
    const result = await callOrchestrator("refund", { session_id: selected.id, amount_cents: amountCents });
    if (result) {
      toast({ title: "Refund ausgelöst" });
      setRefundAmount("");
      refetch();
    }
  };

  const exportXlsx = () => {
    const rows = filtered.map((s: any) => ({
      Datum: format(new Date(s.started_at), "dd.MM.yyyy HH:mm", { locale: de }),
      "Rechnung": s.invoice_number ?? "—",
      "PSP-Ref": s.psp_reference ?? "—",
      Ladepunkt: s.charge_point?.name ?? "—",
      Terminal: s.terminal?.terminal_serial ?? "—",
      Status: STATE_LABEL[s.state] ?? s.state,
      "Preauth (€)": fmtDe(s.preauth_amount_cents / 100),
      "Bezahlt (€)": fmtDe(s.captured_amount_cents / 100),
      "Erstattet (€)": fmtDe((s.refunded_amount_cents ?? 0) / 100),
      "kWh": fmtDe(s.energy_kwh),
      "Karte": [s.card_brand, s.card_last4].filter(Boolean).join(" •••• "),
      "E-Mail": s.customer_email ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ad-Hoc Transaktionen");
    XLSX.writeFile(wb, `adhoc-transaktionen-${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const body = (
    <>
      <div className="p-4 md:p-8 space-y-6 max-w-full overflow-x-hidden">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {!embedded && (
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Ad-Hoc Transaktionen
              </h1>
            )}
            <p className="text-muted-foreground text-sm mt-0.5">
              Kartenzahlungen an Ladepunkten inkl. Preauth, Capture, Refund und Belege.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startMockSession}>
              <PlayCircle className="h-4 w-4 mr-1" /> Mock-Session
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Transaktionen</p>
            <p className="text-2xl font-bold">{totals.count.toLocaleString("de-DE")}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Umsatz brutto</p>
            <p className="text-2xl font-bold">{fmtEur(totals.gross)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Erstattet</p>
            <p className="text-2xl font-bold">{fmtEur(totals.refunded)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Energie</p>
            <p className="text-2xl font-bold">{fmtDe(totals.kwh)} kWh</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Suche Rechnung, Ladepunkt, E-Mail…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  {Object.entries(STATE_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Lade…</p>
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                Keine Transaktionen. Nutzen Sie „Mock-Session" für einen Test-Durchlauf.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Rechnung</TableHead>
                    <TableHead>Ladepunkt</TableHead>
                    <TableHead>Terminal</TableHead>
                    <TableHead className="text-right">kWh</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Karte</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s: any) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelectedId(s.id)}>
                      <TableCell className="text-xs">{format(new Date(s.started_at), "dd.MM.yyyy HH:mm", { locale: de })}</TableCell>
                      <TableCell className="font-mono text-xs">{s.invoice_number ?? "—"}</TableCell>
                      <TableCell>{s.charge_point?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{s.terminal?.terminal_serial ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtDe(s.energy_kwh)}</TableCell>
                      <TableCell className="text-right">{fmtEur(s.captured_amount_cents || s.preauth_amount_cents, s.currency)}</TableCell>
                      <TableCell className="text-xs">{s.card_brand ? `${s.card_brand} •••• ${s.card_last4 ?? ""}` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATE_VARIANT[s.state] ?? "outline"}>{STATE_LABEL[s.state] ?? s.state}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle>Ad-Hoc Transaktion</SheetTitle>
                  <SheetDescription>{selected.invoice_number ?? selected.id.slice(0, 8)}</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <span className="text-muted-foreground">Status</span>
                    <span><Badge variant={STATE_VARIANT[selected.state] ?? "outline"}>{STATE_LABEL[selected.state] ?? selected.state}</Badge></span>
                    <span className="text-muted-foreground">Ladepunkt</span><span>{selected.charge_point?.name ?? "—"}</span>
                    <span className="text-muted-foreground">Terminal</span><span className="font-mono text-xs">{selected.terminal?.terminal_serial ?? "—"}</span>
                    <span className="text-muted-foreground">PSP-Referenz</span><span className="font-mono text-xs">{selected.psp_reference ?? "—"}</span>
                    <span className="text-muted-foreground">Karte</span><span>{selected.card_brand ? `${selected.card_brand} •••• ${selected.card_last4}` : "—"}</span>
                    <span className="text-muted-foreground">Energie</span><span>{fmtDe(selected.energy_kwh)} kWh</span>
                    <span className="text-muted-foreground">Preauth</span><span>{fmtEur(selected.preauth_amount_cents, selected.currency)}</span>
                    <span className="text-muted-foreground">Bezahlt</span><span>{fmtEur(selected.captured_amount_cents, selected.currency)}</span>
                    <span className="text-muted-foreground">Erstattet</span><span>{fmtEur(selected.refunded_amount_cents ?? 0, selected.currency)}</span>
                    <span className="text-muted-foreground">Kunde</span><span>{selected.customer_email ?? "—"}</span>
                  </div>

                  {(selected.state === "captured" || selected.state === "partially_refunded") && (
                    <div className="rounded-md border p-3 space-y-2">
                      <p className="text-sm font-medium">Erstattung</p>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number" step="0.01" placeholder="Betrag €"
                          value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                        />
                        <Button size="sm" onClick={runRefund}>
                          <RotateCcw className="h-4 w-4 mr-1" /> Erstatten
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Rest: {fmtEur(selected.captured_amount_cents - (selected.refunded_amount_cents ?? 0), selected.currency)}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium mb-2">Ereignis-Timeline</p>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {events.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Keine Ereignisse.</p>
                      ) : events.map((e: any) => (
                        <div key={e.id} className="text-xs border-l-2 border-primary/40 pl-2">
                          <span className="font-mono">{format(new Date(e.created_at), "dd.MM. HH:mm:ss")}</span>{" · "}
                          <Badge variant="outline" className="text-[10px]">{e.direction}</Badge>{" "}
                          <span className="font-medium">{e.event_type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );

  if (embedded) return body;
  return <AppLayout>{body}</AppLayout>;
}

export default function ChargingAdHocTransactions() {
  return <AdHocTransactionsContent />;
}

