import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useDemoMode } from "@/contexts/DemoMode";

export interface Co2Factor {
  id: string;
  tenant_id: string;
  energy_type: string;
  factor_kg_per_kwh: number;
  factor_kg_per_m3: number | null;
  source: string | null;
  valid_from: string;
  valid_until: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const DEMO_FACTORS: Co2Factor[] = [
  { id: "demo-co2-1", tenant_id: "demo-tenant-id", energy_type: "strom", factor_kg_per_kwh: 0.420, factor_kg_per_m3: null, source: "UBA 2023", valid_from: "2023-01-01", valid_until: null, is_default: true, created_at: "", updated_at: "" },
  { id: "demo-co2-2", tenant_id: "demo-tenant-id", energy_type: "gas", factor_kg_per_kwh: 0.201, factor_kg_per_m3: 2.0, source: "GEMIS", valid_from: "2023-01-01", valid_until: null, is_default: true, created_at: "", updated_at: "" },
  { id: "demo-co2-3", tenant_id: "demo-tenant-id", energy_type: "waerme", factor_kg_per_kwh: 0.180, factor_kg_per_m3: null, source: "Durchschnitt", valid_from: "2023-01-01", valid_until: null, is_default: true, created_at: "", updated_at: "" },
  { id: "demo-co2-4", tenant_id: "demo-tenant-id", energy_type: "oel", factor_kg_per_kwh: 0.266, factor_kg_per_m3: null, source: "GEMIS", valid_from: "2023-01-01", valid_until: null, is_default: true, created_at: "", updated_at: "" },
];

export function useCo2Factors() {
  const { tenant } = useTenant();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const queryKey = ["co2_emission_factors", tenant?.id ?? "none"];

  const { data: factors = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (isDemo) return DEMO_FACTORS;
      const { data, error } = await supabase
        .from("co2_emission_factors")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("energy_type");
      if (error) throw error;
      return (data as unknown as Co2Factor[]) || [];
    },
    enabled: isDemo || !!tenant,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const upsertFactor = async (factor: Partial<Co2Factor> & { energy_type: string }) => {
    if (!tenant) return { error: new Error("No tenant") };
    const payload = { ...factor, tenant_id: tenant.id };
    const { error } = await supabase
      .from("co2_emission_factors")
      .upsert(payload as any, { onConflict: "id" });
    if (!error) await invalidate();
    return { error: error as Error | null };
  };

  const deleteFactor = async (id: string) => {
    const { error } = await supabase.from("co2_emission_factors").delete().eq("id", id);
    if (!error) await invalidate();
    return { error: error as Error | null };
  };

  const getFactorForType = (energyType: string): Co2Factor | undefined => {
    return factors.find((f) => f.energy_type === energyType);
  };

  return { factors, loading: isLoading, upsertFactor, deleteFactor, getFactorForType, refetch: invalidate };
}
