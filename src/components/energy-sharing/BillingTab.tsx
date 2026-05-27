import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Play, FileDown } from "lucide-react";
import { useMemberInvoices, useAllocationRuns } from "@/hooks/useCommunityOperations";
import { generateCommunityInvoicePdf } from "@/lib/energy-sharing/generateCommunityInvoicePdf";
import { useEnergyCommunities } from "@/hooks/useEnergyCommunities";
import { toast } from "@/hooks/use-toast";

function euro(ct: number) {
  return (ct / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function BillingTab({ communityId }: { communityId: string }) {
  const { invoices, runBilling, setStatus } = useMemberInvoices(communityId);
  const { runs, runAllocation } = useAllocationRuns(communityId);
  const { communities } = useEnergyCommunities();
  const community = communities.find((c) => c.id === communityId);
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const downloadPdf = (inv: any) => {
    try {
      const blob = generateCommunityInvoicePdf(
        {
          id: inv.id,
          invoice_number: inv.invoice_number,
          period_start: inv.period_start,
          period_end: inv.period_end,
          allocated_kwh: Number(inv.allocated_kwh ?? 0),
          feed_in_kwh: Number(inv.feed_in_kwh ?? 0),
          internal_amount_ct: Number(inv.internal_amount_ct ?? 0),
          feed_in_credit_ct: Number(inv.feed_in_credit_ct ?? 0),
          total_ct: Number(inv.total_ct ?? 0),
          currency: inv.currency,
          status: inv.status,
          line_items: inv.line_items,
        },
        {
          communityName: community?.name ?? "Energiegemeinschaft",
          memberName: inv.community_members?.display_name ?? "Mitglied",
          memberEmail: inv.community_members?.email,
        },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rechnung_${inv.invoice_number || inv.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF-Fehler", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Allokation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-end flex-wrap">
            <div><Label>Jahr</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" /></div>
            <div><Label>Monat</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" /></div>
            <Button onClick={() => {
              const ps = new Date(Date.UTC(year, month - 1, 1)).toISOString();
              const pe = new Date(Date.UTC(year, month, 1)).toISOString();
              runAllocation.mutate({ period_start: ps, period_end: pe });
            }}><Play className="h-4 w-4 mr-2" />Allokation für Monat berechnen</Button>
            <Button variant="secondary" onClick={() => runBilling.mutate({ year, month })}>
              <Calculator className="h-4 w-4 mr-2" />Abrechnung erzeugen
            </Button>
          </div>
          {runs.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Zeitraum</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Erzeugung kWh</TableHead>
                <TableHead className="text-right">Alloziert kWh</TableHead>
                <TableHead className="text-right">Überschuss kWh</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {runs.slice(0, 6).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.period_start).toLocaleDateString("de-DE")} – {new Date(r.period_end).toLocaleDateString("de-DE")}</TableCell>
                    <TableCell><Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">{Number(r.total_generated_kwh ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })}</TableCell>
                    <TableCell className="text-right">{Number(r.total_allocated_kwh ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })}</TableCell>
                    <TableCell className="text-right">{Number(r.total_surplus_kwh ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mitgliederrechnungen</CardTitle></CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Rechnungen.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Zeitraum</TableHead><TableHead>Mitglied</TableHead>
                <TableHead className="text-right">kWh</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">{new Date(inv.period_start).toLocaleDateString("de-DE")} – {new Date(inv.period_end).toLocaleDateString("de-DE")}</TableCell>
                    <TableCell>{inv.community_members?.display_name ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(inv.allocated_kwh).toLocaleString("de-DE", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{euro(inv.total_ct)}</TableCell>
                    <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "voided" ? "destructive" : "secondary"}>{inv.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Select value={inv.status} onValueChange={(v) => setStatus.mutate({ id: inv.id, status: v as any })}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Entwurf</SelectItem>
                          <SelectItem value="issued">Ausgestellt</SelectItem>
                          <SelectItem value="paid">Bezahlt</SelectItem>
                          <SelectItem value="voided">Storniert</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
