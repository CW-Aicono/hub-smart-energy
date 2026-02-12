import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

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

  const addPrice = async (price: { location_id: string; energy_type: string; price_per_unit: number; unit: string; valid_from: string; tenant_id: string }) => {
    const { error } = await supabase.from("energy_prices").insert(price);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Energiepreis gespeichert" });
    fetchPrices();
    return true;
  };

  const updatePrice = async (id: string, updates: Partial<EnergyPrice>) => {
    const { error } = await supabase.from("energy_prices").update(updates).eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Energiepreis aktualisiert" });
    fetchPrices();
    return true;
  };

  const deletePrice = async (id: string) => {
    const { error } = await supabase.from("energy_prices").delete().eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Energiepreis gelöscht" });
    fetchPrices();
    return true;
  };

  // Get active price for a location + energy type (most recent valid_from <= today)
  const getActivePrice = (locId: string, energyType: string): number => {
    const today = new Date().toISOString().split("T")[0];
    const matching = prices.filter(
      (p) => p.location_id === locId && p.energy_type === energyType && p.valid_from <= today && (!p.valid_until || p.valid_until >= today)
    );
    if (matching.length === 0) return 0;
    // Most recent valid_from first (already sorted desc)
    return matching[0].price_per_unit;
  };

  return { prices, loading, addPrice, updatePrice, deletePrice, getActivePrice, refetch: fetchPrices };
}
