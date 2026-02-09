import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";

const useTenantId = () => {
  const { tenant } = useTenant();
  return tenant?.id ?? null;
};

export interface Meter {
  id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  meter_number: string | null;
  energy_type: string;
  unit: string;
  medium: string | null;
  installation_date: string | null;
  notes: string | null;
  capture_type: string;
  location_integration_id: string | null;
  sensor_uuid: string | null;
  created_at: string;
  updated_at: string;
}

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
}

export function useMeters(locationId?: string) {
  const { user } = useAuth();
  const tenantId = useTenantId();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeters = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase.from("meters").select("*").order("name");
    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching meters:", error);
      setMeters([]);
    } else {
      setMeters((data ?? []) as Meter[]);
    }
    setLoading(false);
  }, [user, locationId]);

  useEffect(() => {
    fetchMeters();
  }, [fetchMeters]);

  const addMeter = async (meter: MeterInsert) => {
    if (!tenantId) return;
    const { error } = await supabase.from("meters").insert({
      ...meter,
      tenant_id: tenantId,
    } as any);
    if (error) {
      toast.error("Zähler konnte nicht angelegt werden");
      console.error(error);
    } else {
      toast.success("Zähler angelegt");
      fetchMeters();
    }
  };

  const updateMeter = async (id: string, updates: Partial<MeterInsert>) => {
    // If switching to manual, clear sensor fields
    const cleanedUpdates = { ...updates };
    if (cleanedUpdates.capture_type === "manual") {
      (cleanedUpdates as any).location_integration_id = null;
      (cleanedUpdates as any).sensor_uuid = null;
    }
    const { error } = await supabase.from("meters").update(cleanedUpdates as any).eq("id", id);
    if (error) {
      toast.error("Zähler konnte nicht aktualisiert werden");
      console.error(error);
    } else {
      toast.success("Zähler aktualisiert");
      fetchMeters();
    }
  };

  const deleteMeter = async (id: string) => {
    const { error } = await supabase.from("meters").delete().eq("id", id);
    if (error) {
      toast.error("Zähler konnte nicht gelöscht werden");
      console.error(error);
    } else {
      toast.success("Zähler gelöscht");
      fetchMeters();
    }
  };

  return { meters, loading, addMeter, updateMeter, deleteMeter, refetch: fetchMeters };
}
