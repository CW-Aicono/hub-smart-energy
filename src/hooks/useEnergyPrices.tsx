import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenantQuery } from "./useTenantQuery";
import { toast } from "@/hooks/use-toast";
import { getT } from "@/i18n/getT";

export interface EnergyPrice {
  id: string;
  location_id: string;
  energy_type: string;
  price_per_unit: number;
  currency: string;
  unit: string;
  valid_from: string;
  valid_until: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export function useEnergyPrices(locationId?: string) {
  const { user } = useAuth();
  const { ready, insert: tenantInsert } = useTenantQuery();
  const [prices, setPrices] = useState<EnergyPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from("energy_prices").select("*").order("energy_type").order("valid_from", { ascending: false });
    if (locationId) {
      query = query.eq("location_id", locationId);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Error fetching energy prices:", error);
    } else {
      setPrices((data ?? []) as EnergyPrice[]);
    }
    setLoading(false);
  }, [user, locationId]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const addPrice = async (price: { location_id: string; energy_type: string; price_per_unit: number; unit: string; valid_from: string; tenant_id?: string }) => {
    if (!ready) return false;
    const t = getT();
    // Strip manually passed tenant_id – tenantInsert injects it automatically
    const { tenant_id: _ignored, ...rest } = price;
    const { error } = await tenantInsert("energy_prices", rest as any);
    if (error) {
      toast({ title: t("common.error"), description: (error as Error).message, variant: "destructive" });
      return false;
    }
    toast({ title: t("energyPrice.created") });
    fetchPrices();
    return true;
  };

  const updatePrice = async (id: string, updates: Partial<EnergyPrice>) => {
    const t = getT();
    const { error } = await supabase.from("energy_prices").update(updates).eq("id", id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: t("energyPrice.updated") });
    fetchPrices();
    return true;
  };

  const deletePrice = async (id: string) => {
    const t = getT();
    const { error } = await supabase.from("energy_prices").delete().eq("id", id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: t("energyPrice.deleted") });
    fetchPrices();
    return true;
  };

  const getActivePrice = (locId: string, energyType: string): number => {
    const today = new Date().toISOString().split("T")[0];
    const matching = prices.filter(
      (p) => p.location_id === locId && p.energy_type === energyType && p.valid_from <= today && (!p.valid_until || p.valid_until >= today)
    );
    if (matching.length === 0) return 0;
    return matching[0].price_per_unit;
  };

  return { prices, loading, addPrice, updatePrice, deletePrice, getActivePrice, refetch: fetchPrices };
}
