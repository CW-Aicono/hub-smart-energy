import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Euro, ArrowRight, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import type { SavingsBaseline, SavingsContract } from "@/hooks/useTenantSavingsContract";
import type { SavingsSettlement } from "@/hooks/useTenantSavingsSettlements";

interface Props {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const fmtInt = (n: number | null | undefined) =>
  n == null ? "–" : Math.round(Number(n)).toLocaleString("de-DE");
const fmtEur = (n: number | null | undefined) =>
  n == null ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf", active: "Aktiv", paused: "Pausiert", terminated: "Beendet",
  approved: "Freigegeben", invoiced: "Abgerechnet", paid: "Bezahlt", void: "Ungültig",
};
const QUALITY_LABEL: Record<string, string> = {
  complete: "vollständig", partial: "teilweise", none: "keine Daten", manual: "manuell", unknown: "unbekannt",
};
const QUALITY_RANK: Record<string, number> = { complete: 3, manual: 2, partial: 1, none: 0, unknown: 0 };

const CONFIRMED_STATUSES = new Set(["approved", "invoiced", "paid"]);

export default function SavingsShareWidget(_props: Props) {
  const navigate = useNavigate();
  const { tenant } = useTenant();

  const query = useQuery({
    queryKey: ["savings-share-widget", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: contract, error: cErr } = await supabase
        .from("tenant_savings_contracts" as any)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!contract) return { contract: null, baselines: [], settlements: [] };

      const contractRow = contract as any;
      const [{ data: baselines, error: bErr }, { data: settlements, error: sErr }] = await Promise.all([
        supabase.from("tenant_savings_baselines" as any).select("*").eq("contract_id", contractRow.id),
        supabase.from("tenant_savings_settlements" as any).select("*").eq("contract_id", contractRow.id).order("period_year", { ascending: false }),
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

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Euro className="h-4 w-4 text-primary" />
          Gain-Sharing
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate("/savings-share")} className="h-7 text-xs">
          Details <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : query.error ? (
          <p className="text-sm text-destructive">Fehler beim Laden der Gain-Sharing-Daten.</p>
        ) : !query.data?.contract ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center gap-2 py-6">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Noch kein Gain-Sharing-Vertrag</p>
            <p className="text-xs text-muted-foreground">
              Für diesen Tenant ist noch keine Einsparbeteiligung hinterlegt.
            </p>
          </div>
        ) : (
          <WidgetBody
            contract={query.data.contract}
            baselines={query.data.baselines}
            settlements={query.data.settlements}
          />
        )}
      </CardContent>
    </Card>
  );
}

function WidgetBody({
  contract,
  baselines,
  settlements,
}: {
  contract: SavingsContract;
  baselines: SavingsBaseline[];
  settlements: SavingsSettlement[];
}) {
  const baselineTotalKwh = baselines.reduce((sum, b) => sum + Number(b.baseline_kwh_normalized ?? 0), 0);
  const worstQuality = baselines.length
    ? baselines.reduce((worst, b) => {
        const q = b.data_quality ?? "unknown";
        return (QUALITY_RANK[q] ?? 0) < (QUALITY_RANK[worst] ?? 0) ? q : worst;
      }, "complete")
    : null;
  const avgCoverage = baselines.length
    ? Math.round(baselines.reduce((s, b) => s + (b.coverage_months ?? 0), 0) / baselines.length)
    : 0;

  const latest = settlements[0];
  const confirmed = settlements.filter((s) => CONFIRMED_STATUSES.has(s.status));
  const cumulativeTotal = confirmed.reduce((s, x) => s + Number(x.total_savings_eur ?? 0), 0);
  const cumulativeTenant = confirmed.reduce((s, x) => s + Number(x.tenant_retained_eur ?? 0), 0);

  const chartData = [...settlements]
    .slice(0, 5)
    .reverse()
    .map((s) => ({
      year: String(s.period_year),
      tenant: Number(s.tenant_retained_eur ?? 0),
      aicono: Number(s.aicono_amount_eur ?? 0),
    }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          label="Vertragsstatus"
          value={<Badge variant="outline">{STATUS_LABEL[contract.status] ?? contract.status}</Badge>}
          sub={`${contract.baseline_year} → ${contract.start_year}`}
        />
        <Kpi
          label="Baseline gesamt"
          value={<span>{fmtInt(baselineTotalKwh)} <span className="text-xs text-muted-foreground">kWh</span></span>}
          sub={worstQuality ? `${QUALITY_LABEL[worstQuality] ?? worstQuality} · Ø ${avgCoverage}/12 Monate` : "keine Baseline"}
        />
        <Kpi
          label="Letzte Abrechnung"
          value={<span>{latest ? fmtEur(latest.total_savings_eur) : "–"}</span>}
          sub={latest ? `${latest.period_year} · ${STATUS_LABEL[latest.status] ?? latest.status}` : "noch keine Abrechnung"}
        />
        <Kpi
          label="Kumulierte Einsparung"
          value={<span>{fmtEur(cumulativeTotal)}</span>}
          sub={`davon Tenant-Anteil: ${fmtEur(cumulativeTenant)}`}
        />
      </div>

      <div className="flex-1 min-h-[160px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Noch keine Abrechnungen
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={160}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => Number(v).toLocaleString("de-DE") + " €"}
                width={70}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  fmtEur(v),
                  name === "tenant" ? "Tenant-Anteil" : "AICONO-Anteil",
                ]}
                labelFormatter={(l) => `Jahr ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(v) => (v === "tenant" ? "Tenant-Anteil" : "AICONO-Anteil")}
              />
              <Bar dataKey="tenant" stackId="a" fill="hsl(152 55% 42%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="aicono" stackId="a" fill="hsl(180 55% 42%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
    </div>
  );
}
