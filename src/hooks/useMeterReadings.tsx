import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";

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
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReadings = useCallback(async () => {
    if (!user) return;
    setLoading(true);

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
    setLoading(false);
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
    if (!tenantId || !user) return;
    const { error } = await supabase.from("meter_readings").insert({
      ...data,
      tenant_id: tenantId,
      created_by: user.id,
      capture_method: data.capture_method || "manual",
    } as any);
    if (error) {
      toast.error("Zählerstand konnte nicht gespeichert werden");
      console.error(error);
      return false;
    }
    toast.success("Zählerstand erfasst");
    fetchReadings();
    return true;
  };

  return { readings, loading, addReading, getLastReading, refetch: fetchReadings };
}
