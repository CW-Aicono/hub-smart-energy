import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number | null | undefined) => fmt(n) + " €";

const CONTRACT_STATUS: Record<string, string> = {
  draft: "Entwurf", active: "Aktiv", paused: "Pausiert", terminated: "Beendet",
};
const SETTLE_STATUS: Record<string, string> = {
  approved: "Freigegeben", invoiced: "Abgerechnet", paid: "Bezahlt", void: "Ungültig",
};

interface ContractRow {
  id: string;
  tenant_id: string;
  status: string;
  baseline_year: number;
  start_year: number;
  aicono_share_pct: number;
  partner_share_pct_of_aicono: number;
  tenants: { id: string; name: string | null; slug: string } | null;
}

interface SettlementRow {
  id: string;
  contract_id: string;
  period_year: number;
  status: string;
  total_savings_eur: number;
  aicono_amount_eur: number;
  partner_amount_eur: number;
  tenant_retained_eur: number;
  invoice_ref: string | null;
  approved_at: string | null;
}

export default function PartnerSavingsShare() {
  const query = useQuery({
    queryKey: ["partner-savings-share"],
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("tenant_savings_contracts" as any)
        .select("id, tenant_id, status, baseline_year, start_year, aicono_share_pct, partner_share_pct_of_aicono, tenants:tenant_id(id, name, slug)")
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;
      const list = (contracts ?? []) as unknown as ContractRow[];
      if (list.length === 0) return { contracts: [], settlements: [] as SettlementRow[] };
      const ids = list.map((c) => c.id);
      const { data: settlements, error: sErr } = await supabase
        .from("tenant_savings_settlements" as any)
        .select("id, contract_id, period_year, status, total_savings_eur, aicono_amount_eur, partner_amount_eur, tenant_retained_eur, invoice_ref, approved_at")
        .in("contract_id", ids)
        .order("period_year", { ascending: false });
      if (sErr) throw sErr;
      return { contracts: list, settlements: ((settlements ?? []) as unknown as SettlementRow[]) };
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }
  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription>{(query.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const contracts = query.data?.contracts ?? [];
  const settlements = query.data?.settlements ?? [];

  const totalPartner = settlements.reduce((s, r) => s + Number(r.partner_amount_eur ?? 0), 0);
  const totalAicono = settlements.reduce((s, r) => s + Number(r.aicono_amount_eur ?? 0), 0);
  const totalSavings = settlements.reduce((s, r) => s + Number(r.total_savings_eur ?? 0), 0);
  const contractsById = new Map(contracts.map((c) => [c.id, c] as const));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gain-Sharing</h1>
        <p className="text-sm text-muted-foreground">Einsparbeteiligungen Ihrer Tenants – zur Kontrolle Ihrer Abrechnung.</p>
      </div>

      {contracts.length === 0 ? (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>Keine Gain-Sharing-Verträge</AlertTitle>
          <AlertDescription>Für Ihre Tenants ist aktuell keine Einsparbeteiligung hinterlegt.</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Einsparungen gesamt</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{eur(totalSavings)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">AICONO-Anteil</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{eur(totalAicono)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ihr Partner-Anteil</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{eur(totalPartner)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Verträge</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tenant</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Baseline-Jahr</TableHead>
                  <TableHead className="text-right">Start</TableHead>
                  <TableHead className="text-right">AICONO %</TableHead>
                  <TableHead className="text-right">Partner-Anteil an AICONO %</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.tenants?.name ?? c.tenants?.slug ?? c.tenant_id}</TableCell>
                      <TableCell><Badge variant="outline">{CONTRACT_STATUS[c.status] ?? c.status}</Badge></TableCell>
                      <TableCell className="text-right">{c.baseline_year}</TableCell>
                      <TableCell className="text-right">{c.start_year}</TableCell>
                      <TableCell className="text-right">{fmt(c.aicono_share_pct)} %</TableCell>
                      <TableCell className="text-right">{fmt(c.partner_share_pct_of_aicono)} %</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/partner/tenants/${c.tenant_id}`}><ExternalLink className="h-4 w-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Abrechnungen</CardTitle></CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine freigegebenen Abrechnungen.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Jahr</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Einsparung</TableHead>
                    <TableHead className="text-right">AICONO-Anteil</TableHead>
                    <TableHead className="text-right">Ihr Anteil</TableHead>
                    <TableHead>Rechnung</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {settlements.map((s) => {
                      const c = contractsById.get(s.contract_id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{c?.tenants?.name ?? c?.tenants?.slug ?? "–"}</TableCell>
                          <TableCell>{s.period_year}</TableCell>
                          <TableCell><Badge variant="outline">{SETTLE_STATUS[s.status] ?? s.status}</Badge></TableCell>
                          <TableCell className="text-right">{eur(s.total_savings_eur)}</TableCell>
                          <TableCell className="text-right">{eur(s.aicono_amount_eur)}</TableCell>
                          <TableCell className="text-right font-semibold">{eur(s.partner_amount_eur)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.invoice_ref ?? "–"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
