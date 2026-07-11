import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileText } from "lucide-react";
import type { SavingsBaseline, SavingsContract } from "@/hooks/useTenantSavingsContract";
import type { SavingsSettlement } from "@/hooks/useTenantSavingsSettlements";

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtInt = (n: number | null | undefined) => n == null ? "–" : Math.round(Number(n)).toLocaleString("de-DE");
const eur = (n: number | null | undefined) => fmt(n) + " €";
const date = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("de-DE") : "–";

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf", active: "Aktiv", paused: "Pausiert", terminated: "Beendet",
  approved: "Freigegeben", invoiced: "Abgerechnet", paid: "Bezahlt", void: "Ungültig",
};
const QUALITY_LABEL: Record<string, string> = {
  complete: "vollständig", partial: "teilweise", none: "keine Daten", manual: "manuell", unknown: "unbekannt",
};

export default function SavingsShareReadOnly({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["savings-share-readonly", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: contract, error: cErr } = await supabase
        .from("tenant_savings_contracts" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!contract) return { contract: null, baselines: [], settlements: [] };

      const [{ data: baselines, error: bErr }, { data: settlements, error: sErr }] = await Promise.all([
        supabase.from("tenant_savings_baselines" as any).select("*").eq("contract_id", (contract as any).id).order("energy_type"),
        supabase.from("tenant_savings_settlements" as any).select("*").eq("contract_id", (contract as any).id).order("period_year", { ascending: false }),
      ]);
      if (bErr) throw bErr;
      if (sErr) throw sErr;
      return {
        contract: contract as unknown as SavingsContract,
        baselines: (baselines ?? []) as unknown as SavingsBaseline[],
        settlements: (settlements ?? []) as unknown as SavingsSettlement[],
      };
    },
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Lädt…</p>;
  if (!query.data?.contract) {
    return (
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>Noch kein Gain-Sharing-Vertrag</AlertTitle>
        <AlertDescription>Für diesen Tenant ist noch keine Einsparbeteiligung hinterlegt.</AlertDescription>
      </Alert>
    );
  }

  const { contract, baselines, settlements } = query.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Gain-Sharing-Vertrag</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="Status" value={STATUS_LABEL[contract.status] ?? contract.status} />
          <Field label="Baseline-Jahr" value={contract.baseline_year} />
          <Field label="Start Beteiligung" value={contract.start_year} />
          <Field label="AICONO-Anteil" value={`${fmt(contract.aicono_share_pct)} %`} />
          <Field label="Partner-Anteil" value={`${fmt(contract.partner_share_pct_of_aicono)} %`} />
          <Field label="Witterungsbereinigung" value={contract.weather_normalize ? "Ja" : "Nein"} />
          <Field label="Preisbasis" value={contract.price_basis === "contract_fixed" ? "Festpreis" : "Jahresmittel"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Baseline</CardTitle></CardHeader>
        <CardContent>
          {baselines.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine freigegebene Baseline vorhanden.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Energieart</TableHead><TableHead className="text-right">Baseline (kWh)</TableHead><TableHead>Datenqualität</TableHead><TableHead>Zeitraum</TableHead><TableHead>Quelle</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {baselines.map((b) => {
                  const details = b.calculation_details ?? {};
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.energy_type}</TableCell>
                      <TableCell className="text-right">{fmtInt(b.baseline_kwh_normalized)}</TableCell>
                      <TableCell><Badge variant="outline">{QUALITY_LABEL[b.data_quality ?? "unknown"] ?? b.data_quality}</Badge><div className="text-xs text-muted-foreground mt-1">{b.coverage_months ?? 0}/12 Monate</div></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{date(details.first_period)} – {date(details.last_period)}</TableCell>
                      <TableCell>{b.baseline_source === "manual_override" ? "Manuell" : b.baseline_source === "invoice_based" ? "Rechnung" : "Messwerte"}{b.override_reason && <div className="text-xs text-muted-foreground mt-1">{b.override_reason}</div>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Abrechnungen</CardTitle></CardHeader>
        <CardContent>
          {settlements.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine freigegebenen Abrechnungen.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Jahr</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Einsparung</TableHead><TableHead className="text-right">AICONO-Anteil</TableHead><TableHead className="text-right">Verbleibt beim Tenant</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.period_year}</TableCell>
                    <TableCell><Badge variant="outline">{STATUS_LABEL[s.status] ?? s.status}</Badge></TableCell>
                    <TableCell className="text-right">{eur(s.total_savings_eur)}</TableCell>
                    <TableCell className="text-right">{eur(s.aicono_amount_eur)}</TableCell>
                    <TableCell className="text-right">{eur(s.tenant_retained_eur)}</TableCell>
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

function Field({ label, value }: { label: string; value: any }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value ?? "–"}</p></div>;
}