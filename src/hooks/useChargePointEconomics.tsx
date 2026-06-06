import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export interface ChargePointEconomics {
  charge_point_id: string;
  tenant_id: string;
  capex_cents: number;
  opex_monthly_cents: number;
  commissioned_on: string | null;
  electricity_cost_eur_per_kwh: number;
  notes: string | null;
}

export function useChargePointEconomics(chargePointId?: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["charge-point-economics", tenant?.id, chargePointId];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!tenant?.id && !!chargePointId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_point_economics")
        .select("*")
        .eq("charge_point_id", chargePointId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ChargePointEconomics | null) ?? null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<ChargePointEconomics>) => {
      if (!tenant?.id || !chargePointId) throw new Error("Kein Mandant/Ladepunkt");
      const payload = {
        charge_point_id: chargePointId,
        tenant_id: tenant.id,
        capex_cents: values.capex_cents ?? 0,
        opex_monthly_cents: values.opex_monthly_cents ?? 0,
        commissioned_on: values.commissioned_on ?? null,
        electricity_cost_eur_per_kwh: values.electricity_cost_eur_per_kwh ?? 0.3,
        notes: values.notes ?? null,
      };
      const { error } = await supabase
        .from("charge_point_economics")
        .upsert(payload, { onConflict: "charge_point_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wirtschaftlichkeitsdaten gespeichert");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error("Fehler: " + e.message),
  });

  return { economics: data, isLoading, upsert };
}
