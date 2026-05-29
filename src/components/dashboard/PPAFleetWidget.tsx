import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSignature, TrendingUp } from "lucide-react";

interface Props {
  locationId?: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const PPAFleetWidget = (_props: Props) => {
  const { tenant } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ["ppa-fleet-overview", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthIso = monthStart.toISOString().slice(0, 10);

      const [contractsRes, settlementsRes] = await Promise.all([
        supabase
          .from("ppa_contracts" as any)
          .select("id, status, ppa_type, producer_name, offtaker_name, contract_end, contracted_volume_kwh_pa")
          .eq("tenant_id", tenant!.id),
        supabase
          .from("ppa_settlements" as any)
          .select("delivered_kwh, total_amount_eur, period_start")
          .eq("tenant_id", tenant!.id)
          .gte("period_start", monthIso),
      ]);

      if (contractsRes.error) throw contractsRes.error;
      const contracts = (contractsRes.data ?? []) as any[];
      const settlements = (settlementsRes.data ?? []) as any[];

      const active = contracts.filter((c) => c.status === "active");
      const totalKwh = settlements.reduce((s, r) => s + Number(r.delivered_kwh ?? 0), 0);
      const totalEur = settlements.reduce((s, r) => s + Number(r.total_amount_eur ?? 0), 0);

      const nextExpiring = [...active]
        .filter((c) => new Date(c.contract_end).getTime() > Date.now())
        .sort((a, b) => new Date(a.contract_end).getTime() - new Date(b.contract_end).getTime())[0];

      return {
        totalContracts: contracts.length,
        activeContracts: active.length,
        onsiteCount: active.filter((c) => c.ppa_type === "onsite").length,
        offsiteCount: active.filter((c) => c.ppa_type === "offsite").length,
        monthKwh: totalKwh,
        monthEur: totalEur,
        nextExpiring,
      };
    },
  });

  const daysUntilExpiry = useMemo(() => {
    if (!data?.nextExpiring) return null;
    return Math.ceil(
      (new Date(data.nextExpiring.contract_end).getTime() - Date.now()) / 86400000,
    );
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" /> PPA-Flotte
        </CardTitle>
        <Link to="/ppa/onsite" className="text-xs text-primary hover:underline">
          Alle Verträge →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Lade…</div>
        ) : !data || data.totalContracts === 0 ? (
          <div className="text-sm text-muted-foreground">
            Noch keine PPA-Verträge angelegt.{" "}
            <Link to="/ppa/onsite" className="text-primary underline">
              Jetzt anlegen
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Aktiv" value={data.activeContracts.toLocaleString("de-DE")} />
              <Kpi
                label="Volumen MTD"
                value={`${data.monthKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })} kWh`}
              />
              <Kpi
                label="Kosten MTD"
                value={data.monthEur.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
              />
            </div>
            <div className="flex gap-2 flex-wrap text-xs">
              <Badge variant="outline">On-site: {data.onsiteCount.toLocaleString("de-DE")}</Badge>
              <Badge variant="outline">Off-site: {data.offsiteCount.toLocaleString("de-DE")}</Badge>
            </div>
            {data.nextExpiring && daysUntilExpiry != null && (
              <div className="text-xs flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Nächste Fälligkeit
                </span>
                <Link to={`/ppa/${data.nextExpiring.id}`} className="text-primary hover:underline">
                  {data.nextExpiring.producer_name} ({daysUntilExpiry.toLocaleString("de-DE")} Tage)
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

export default PPAFleetWidget;
