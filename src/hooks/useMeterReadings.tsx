import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useTenantQuery } from "./useTenantQuery";
import { toast } from "sonner";
import { syncReadings } from "@/lib/brighthubApi";
import { getT } from "@/i18n/getT";

export interface MeterReading {
  id: string;
  meter_id: string;
  tenant_id: string;
  value: number;
  reading_date: string;
  capture_method: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useMeterReadings(meterId?: string) {
  const { user } = useAuth();
  const { tenantId, ready, insert: tenantInsert } = useTenantQuery();
  const queryClient = useQueryClient();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReadings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      let query = supabase
        .from("meter_readings")
        .select("*")
        .order("reading_date", { ascending: false });

      if (meterId) query = query.eq("meter_id", meterId);

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching meter readings:", error);
        setReadings([]);
      } else {
        setReadings((data ?? []) as MeterReading[]);
      }
    } catch (err) {
      console.error("Error fetching meter readings:", err);
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [user, meterId]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  const getLastReading = useCallback(
    (mId: string): MeterReading | null => {
      const meterReadings = readings
        .filter((r) => r.meter_id === mId)
        .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
      return meterReadings[0] ?? null;
    },
    [readings]
  );

  const addReading = async (data: {
    meter_id: string;
    value: number;
    reading_date: string;
    capture_method?: string;
    notes?: string;
  }) => {
    if (!ready || !user) return;
    const t = getT();
    const { error } = await tenantInsert("meter_readings", {
      ...data,
      created_by: user.id,
      capture_method: data.capture_method || "manual",
    } as any);
    if (error) {
      toast.error(t("meterReading.errorSave"));
      console.error(error);
      return false;
    }
    toast.success(t("meterReading.created"));
    fetchReadings();
    queryClient.invalidateQueries({ queryKey: ["energy-readings-and-sources"] });

    // Auto-sync to BrightHub if enabled (check per-location settings)
    try {
      const { data: meter } = await supabase
        .from("meters")
        .select("location_id")
        .eq("id", data.meter_id)
        .single();
      if (meter?.location_id) {
        const { data: bhSettings } = await supabase
          .from("brighthub_settings")
          .select("is_enabled, auto_sync_readings")
          .eq("tenant_id", tenantId)
          .eq("location_id", meter.location_id)
          .maybeSingle();
        if (bhSettings?.is_enabled && bhSettings?.auto_sync_readings) {
          syncReadings(tenantId, meter.location_id)
            .catch((err) => console.warn("BrightHub sync failed:", err));
        }
      }
    } catch (e) {
      console.warn("BrightHub auto-sync check failed:", e);
    }

    return true;
  };

  const deleteReading = async (id: string) => {
    if (!user) return false;
    const t = getT();
    const { error } = await supabase
      .from("meter_readings")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(t("meterReading.errorDelete"));
      console.error(error);
      return false;
    }
    toast.success(t("meterReading.deleted"));
    fetchReadings();
    queryClient.invalidateQueries({ queryKey: ["energy-readings-and-sources"] });
    return true;
  };

  return { readings, loading, addReading, deleteReading, getLastReading, refetch: fetchReadings };
}
