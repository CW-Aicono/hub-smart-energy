import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenantQuery } from "./useTenantQuery";
import { toast } from "@/hooks/use-toast";
import { getT } from "@/i18n/getT";

export type EnergyPriceDirection = "consumption" | "feed_in";

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
  is_dynamic: boolean;
  spot_markup_per_unit: number;
  meter_id: string | null;
  direction: EnergyPriceDirection;
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

  const addPrice = async (price: {
    location_id: string;
    energy_type: string;
    price_per_unit: number;
    unit: string;
    valid_from: string;
    tenant_id?: string;
    is_dynamic?: boolean;
    spot_markup_per_unit?: number;
    meter_id?: string | null;
    direction?: EnergyPriceDirection;
  }) => {
    if (!ready) return false;
    const t = getT();
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

  /**
   * Resolves the active price for a meter or location+energyType.
   * Resolution order:
   * 1. Direct price on this meter_id
   * 2. Price on the parent meter (if sub-meter)
   * 3. Location-wide fallback (meter_id IS NULL)
   */
  const getActivePrice = (locId: string, energyType: string, meterId?: string, parentMeterId?: string | null): number => {
    const today = new Date().toISOString().split("T")[0];
    const isActive = (p: EnergyPrice) =>
      p.location_id === locId &&
      p.energy_type === energyType &&
      p.valid_from <= today &&
      (!p.valid_until || p.valid_until >= today);

    // 1. Direct meter price
    if (meterId) {
      const meterPrice = prices.find((p) => isActive(p) && p.meter_id === meterId);
      if (meterPrice) return meterPrice.price_per_unit;
    }

    // 2. Parent meter price (sub-meter inherits)
    if (parentMeterId) {
      const parentPrice = prices.find((p) => isActive(p) && p.meter_id === parentMeterId);
      if (parentPrice) return parentPrice.price_per_unit;
    }

    // 3. Location-wide fallback (no meter assigned)
    const locationPrice = prices.find((p) => isActive(p) && !p.meter_id);
    if (locationPrice) return locationPrice.price_per_unit;

    return 0;
  };

  return { prices, loading, addPrice, updatePrice, deletePrice, getActivePrice, refetch: fetchPrices };
}
