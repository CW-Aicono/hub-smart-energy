import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "sonner";

export interface EnergyMeasure {
  id: string;
  tenant_id: string;
  location_id: string;
  title: string;
  description: string | null;
  category: string;
  implementation_date: string | null;
  investment_cost: number | null;
  estimated_annual_savings_kwh: number | null;
  estimated_annual_savings_eur: number | null;
  energy_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type EnergyMeasureInsert = Omit<EnergyMeasure, "id" | "tenant_id" | "created_at" | "updated_at">;

export function useEnergyMeasures(locationId?: string) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const queryKey = ["energy_measures", tenant?.id, locationId ?? "all"];

  const { data: measures = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("energy_measures")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("implementation_date", { ascending: false, nullsFirst: false });
      if (locationId) query = query.eq("location_id", locationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as EnergyMeasure[];
    },
    enabled: !!tenant,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["energy_measures"] });

  const addMeasure = async (measure: EnergyMeasureInsert) => {
    if (!tenant) return;
    const { error } = await supabase
      .from("energy_measures")
      .insert({ ...measure, tenant_id: tenant.id } as any);
    if (error) { toast.error("Fehler beim Speichern"); console.error(error); }
    else { toast.success("Maßnahme gespeichert"); invalidate(); }
  };

  const updateMeasure = async (id: string, updates: Partial<EnergyMeasureInsert>) => {
    const { error } = await supabase.from("energy_measures").update(updates as any).eq("id", id);
    if (error) { toast.error("Fehler beim Aktualisieren"); console.error(error); }
    else { toast.success("Maßnahme aktualisiert"); invalidate(); }
  };

  const deleteMeasure = async (id: string) => {
    const { error } = await supabase.from("energy_measures").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); console.error(error); }
    else { toast.success("Maßnahme gelöscht"); invalidate(); }
  };

  return { measures, loading: isLoading, addMeasure, updateMeasure, deleteMeasure, refetch: invalidate };
}
