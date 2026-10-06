import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getT } from "@/i18n/getT";

export interface ModulePrice {
  id: string;
  module_code: string;
  price_monthly: number;
  standard_price: number;
  industry_price_monthly: number;
  industry_standard_price: number;
  partner_price_monthly: number;
  partner_industry_price_monthly: number;
  charge_point_price_monthly: number;
  industry_charge_point_price_monthly: number;
  partner_charge_point_price_monthly: number;
  partner_industry_charge_point_price_monthly: number;
  standard_charge_point_price_monthly: number;
  industry_standard_charge_point_price_monthly: number;
  created_at: string;
  updated_at: string;
}

export type CpField =
  | "charge_point_price_monthly" | "industry_charge_point_price_monthly"
  | "partner_charge_point_price_monthly" | "partner_industry_charge_point_price_monthly"
  | "standard_charge_point_price_monthly" | "industry_standard_charge_point_price_monthly";

export function useModulePrices() {
  const queryClient = useQueryClient();

  const { data: prices = [], isLoading } = useQuery({
    queryKey: ["module-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("module_prices")
        .select("*")
        .order("module_code");
      if (error) throw error;
      return data as ModulePrice[];
    },
  });

  const updatePrice = useMutation({
    mutationFn: async ({
      moduleCode,
      priceMonthly,
      standardPrice,
      industryPriceMonthly,
      industryStandardPrice,
      partnerPriceMonthly,
      partnerIndustryPriceMonthly,
      chargePointPriceMonthly,
      industryChargePointPriceMonthly,
      cpFields,
    }: {
      moduleCode: string;
      priceMonthly?: number;
      standardPrice?: number;
      industryPriceMonthly?: number;
      industryStandardPrice?: number;
      partnerPriceMonthly?: number;
      partnerIndustryPriceMonthly?: number;
      chargePointPriceMonthly?: number;
      industryChargePointPriceMonthly?: number;
      /** Ladepunkt-Unterpunkt: beliebige *_charge_point_price_monthly-Spalten */
      cpFields?: Partial<Record<CpField, number>>;
    }) => {
      const updates: any = { module_code: moduleCode, updated_at: new Date().toISOString() };
      if (priceMonthly !== undefined) updates.price_monthly = priceMonthly;
      if (standardPrice !== undefined) updates.standard_price = standardPrice;
      if (industryPriceMonthly !== undefined) updates.industry_price_monthly = industryPriceMonthly;
      if (industryStandardPrice !== undefined) updates.industry_standard_price = industryStandardPrice;
      if (partnerPriceMonthly !== undefined) updates.partner_price_monthly = partnerPriceMonthly;
      if (partnerIndustryPriceMonthly !== undefined) updates.partner_industry_price_monthly = partnerIndustryPriceMonthly;
      if (chargePointPriceMonthly !== undefined) updates.charge_point_price_monthly = chargePointPriceMonthly;
      if (industryChargePointPriceMonthly !== undefined) updates.industry_charge_point_price_monthly = industryChargePointPriceMonthly;
      if (cpFields) Object.assign(updates, cpFields);
      const { error } = await supabase
        .from("module_prices")
        .upsert(updates, { onConflict: "module_code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-prices"] });
      const t = getT();
      toast({ title: t("modulePrice.saved") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Einheitspreis: Mitglieds- und Industriepreise sind abgeschafft – alle Varianten liefern den Standardpreis.
  const getPrice = (moduleCode: string): number => getStandardPrice(moduleCode);

  const getStandardPrice = (moduleCode: string): number => {
    const p = prices.find((pr) => pr.module_code === moduleCode);
    return p ? Number(p.standard_price) : 0;
  };

  const getIndustryPrice = (moduleCode: string): number => getStandardPrice(moduleCode);
  const getIndustryStandardPrice = (moduleCode: string): number => getStandardPrice(moduleCode);

  const getPartnerPrice = (moduleCode: string): number => {
    const p = prices.find((pr) => pr.module_code === moduleCode);
    return p ? Number(p.partner_price_monthly ?? 0) : 0;
  };

  const getPartnerIndustryPrice = (moduleCode: string): number => getPartnerPrice(moduleCode);

  const getChargePointPrice = (moduleCode: string, field: CpField): number => {
    const p = prices.find((pr) => pr.module_code === moduleCode) as any;
    if (!p) return 0;
    const unified = field.startsWith("partner_") ? "partner_charge_point_price_monthly" : "standard_charge_point_price_monthly";
    return Number(p[unified] ?? 0);
  };

  return {
    prices,
    getChargePointPrice,
    isLoading,
    updatePrice,
    getPrice,
    getStandardPrice,
    getIndustryPrice,
    getIndustryStandardPrice,
    getPartnerPrice,
    getPartnerIndustryPrice,
  };
}
