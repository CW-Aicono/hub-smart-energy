import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "@/hooks/useTenantQuery";
import { useTranslation } from "@/hooks/useTranslation";
import { pvT } from "@/lib/pvFlowI18n";
import PvSurplusMonitor from "@/components/charging/pv/PvSurplusMonitor";

/** Dashboard-Widget: PV-Überschuss live für den gewählten (oder ersten) Standort. */
export default function PvFlowLiveWidget({ locationId }: { locationId: string | null }) {
  const { tenantId } = useTenantQuery();
  const { language } = useTranslation();

  const { data } = useQuery({
    queryKey: ["pv-flow-widget-config", tenantId, locationId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: cfgs } = await supabase.from("solar_charging_config").select("*").eq("tenant_id", tenantId!);
      if (!cfgs?.length) return null;
      const cpIds = cfgs.map((c: any) => c.charge_point_id).filter(Boolean);
      const groupIds = cfgs.map((c: any) => c.group_id).filter(Boolean);
      const { data: cps } = await supabase.from("charge_points").select("id, group_id, location_id").eq("tenant_id", tenantId!);
      const locOf = (c: any) => (cps ?? []).find((p: any) => (c.group_id ? p.group_id === c.group_id : p.id === c.charge_point_id))?.location_id ?? null;
      const withLoc = cfgs.map((c: any) => ({ cfg: c, loc: locOf(c) })).filter((x) => x.loc);
      void cpIds; void groupIds;
      const match = withLoc.find((x) => !locationId || x.loc === locationId && x.cfg.is_active) ?? withLoc.find((x) => !locationId || x.loc === locationId);
      return match ?? null;
    },
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Sun className="h-4 w-4 text-primary" />{pvT(language, "title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {data ? <PvSurplusMonitor config={data.cfg} locationId={data.loc} compact /> : <p className="text-sm text-muted-foreground">{pvT(language, "noConfig")}</p>}
      </CardContent>
    </Card>
  );
}
