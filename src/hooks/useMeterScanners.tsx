import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface MeterScanner {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useMeterScanners() {
  const { tenant } = useTenant();
  const [scanners, setScanners] = useState<MeterScanner[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScanners = useCallback(async () => {
    if (!tenant) {
      setScanners([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("meter_scanners")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching scanners:", error);
      setScanners([]);
    } else {
      setScanners((data ?? []) as MeterScanner[]);
    }
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetchScanners();
  }, [fetchScanners]);

  const createScanner = async (name: string, description?: string) => {
    if (!tenant) return { error: new Error("No tenant") };
    const { data, error } = await supabase
      .from("meter_scanners")
      .insert({ tenant_id: tenant.id, name, description: description || null } as any)
      .select()
      .single();
    if (!error) await fetchScanners();
    return { data: data as MeterScanner | null, error };
  };

  const updateScanner = async (id: string, updates: Partial<Pick<MeterScanner, "name" | "description" | "is_active">>) => {
    const { error } = await supabase
      .from("meter_scanners")
      .update(updates as any)
      .eq("id", id);
    if (!error) await fetchScanners();
    return { error };
  };

  const deleteScanner = async (id: string) => {
    const { error } = await supabase
      .from("meter_scanners")
      .delete()
      .eq("id", id);
    if (!error) await fetchScanners();
    return { error };
  };

  return { scanners, loading, createScanner, updateScanner, deleteScanner, refetch: fetchScanners };
}
