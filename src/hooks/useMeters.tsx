import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenantQuery } from "./useTenantQuery";
import { toast } from "sonner";
import { getT } from "@/i18n/getT";
import type { Database } from "@/integrations/supabase/types";

type MeterRow = Database["public"]["Tables"]["meters"]["Row"];
type MeterInsertDB = Database["public"]["Tables"]["meters"]["Insert"];
type VirtualMeterSourceInsert = Database["public"]["Tables"]["virtual_meter_sources"]["Insert"];

export type Meter = MeterRow;

export interface MeterInsert {
  name: string;
  location_id: string;
  meter_number?: string;
  energy_type: string;
  unit: string;
  medium?: string;
  installation_date?: string;
  notes?: string;
  capture_type?: string;
  location_integration_id?: string;
  sensor_uuid?: string;
  meter_operator?: string;
  photo_url?: string;
}

export function useMeters(locationId?: string) {
  const { user } = useAuth();
  const { tenantId, insert: tenantInsert } = useTenantQuery();
  const queryClient = useQueryClient();

  const queryKey = ["meters", tenantId, locationId ?? "all"];

  const { data: meters = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase.from("meters").select("*").eq("tenant_id", tenantId!).order("name");
      if (locationId) query = query.eq("location_id", locationId);
      const { data, error } = await query;
      if (error) {
        console.error("Error fetching meters:", error);
        return [];
      }
      return (data ?? []) as Meter[];
    },
    enabled: !!user && !!tenantId,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["meters"] });
  }, [queryClient]);

  const addMeter = async (
    meter: MeterInsert,
    parentMeterId?: string | null,
    isMainMeter?: boolean,
    meterFunction?: string,
    virtualSources?: { source_meter_id: string; operator: "+" | "-" }[],
  ) => {
    if (!tenantId) return;

    const insertData: Omit<MeterInsertDB, "tenant_id"> = {
      ...meter,
      parent_meter_id: parentMeterId || null,
      is_main_meter: isMainMeter || false,
      meter_function: meterFunction || "consumption",
    };

    const { data: inserted, error } = await supabase
      .from("meters")
      .insert({ ...insertData, tenant_id: tenantId } satisfies MeterInsertDB)
      .select("id")
      .single();

    if (error) {
      toast.error(getT()("meter.errorCreate"));
      console.error(error);
    } else {
      if (virtualSources && virtualSources.length > 0 && inserted?.id) {
        const rows: VirtualMeterSourceInsert[] = virtualSources.map((s, i) => ({
          virtual_meter_id: inserted.id,
          source_meter_id: s.source_meter_id,
          operator: s.operator,
          sort_order: i,
        }));
        const { error: srcErr } = await supabase.from("virtual_meter_sources").insert(rows);
        if (srcErr) {
          console.error("Error saving virtual sources:", srcErr);
          toast.error(getT()("meter.errorFormula"));
        }
      }
      toast.success(getT()("meter.created"));
      invalidate();
    }
  };

  const updateMeter = async (id: string, updates: Partial<MeterInsert>) => {
    const cleanedUpdates: Partial<MeterInsertDB> = { ...updates };
    if (cleanedUpdates.capture_type === "manual") {
      cleanedUpdates.location_integration_id = null;
      cleanedUpdates.sensor_uuid = null;
    }
    const { error } = await supabase.from("meters").update(cleanedUpdates).eq("id", id);
    if (error) {
      toast.error(getT()("meter.errorUpdate"));
      console.error(error);
    } else {
      toast.success(getT()("meter.updated"));
      invalidate();
    }
  };

  const deleteMeter = async (id: string) => {
    const { error } = await supabase.from("meters").delete().eq("id", id);
    if (error) {
      toast.error(getT()("meter.errorDelete"));
      console.error(error);
    } else {
      toast.success(getT()("meter.deleted"));
      invalidate();
    }
  };

  const archiveMeter = async (id: string, archived: boolean) => {
    const { error } = await supabase.from("meters").update({ is_archived: archived }).eq("id", id);
    if (error) {
      toast.error(archived ? getT()("meter.errorArchive") : getT()("meter.errorRestore"));
      console.error(error);
    } else {
      toast.success(archived ? getT()("meter.archived") : getT()("meter.restored"));
      invalidate();
    }
  };

  const updateMeterParent = async (meterId: string, parentMeterId: string | null) => {
    const { error } = await supabase
      .from("meters")
      .update({ parent_meter_id: parentMeterId })
      .eq("id", meterId);
    if (error) {
      toast.error(getT()("meter.errorMove"));
      console.error(error);
    } else {
      toast.success(getT()("meter.moved"));
      invalidate();
    }
  };

  return { meters, loading, addMeter, updateMeter, deleteMeter, archiveMeter, updateMeterParent, refetch: invalidate };
}
