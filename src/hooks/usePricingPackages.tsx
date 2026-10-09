import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PackageDef, UnitPrice } from "@/lib/packagePricing";

export interface PricingCatalog {
  packages: (PackageDef & { sort: number; active: boolean; modules: string[] })[];
  units: (UnitPrice & { name: string; unit: string })[];
  flags: Record<string, "sellable" | "hidden" | "on_request">;
}

export function usePricingPackages() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["pricing-catalog"],
    queryFn: async (): Promise<PricingCatalog> => {
      const db = supabase as any;
      const [p, m, u, f] = await Promise.all([
        db.from("pricing_packages").select("*").order("sort"),
        db.from("pricing_package_modules").select("*"),
        db.from("pricing_unit_prices").select("*"),
        db.from("module_catalog_flags").select("*"),
      ]);
      for (const r of [p, m, u, f]) if (r.error) throw r.error;
      return {
        packages: (p.data ?? []).map((x: any) => ({
          ...x, uvp: Number(x.uvp), ek: Number(x.ek),
          modules: (m.data ?? []).filter((y: any) => y.package_code === x.code).map((y: any) => y.module_code),
        })),
        units: (u.data ?? []).map((x: any) => ({ ...x, uvp: Number(x.uvp), ek: Number(x.ek) })),
        flags: Object.fromEntries((f.data ?? []).map((x: any) => [x.module_code, x.visibility])),
      };
    },
    staleTime: 5 * 60_000,
  });

  const updatePrice = useMutation({
    mutationFn: async ({ table, code, uvp, ek }: { table: "pricing_packages" | "pricing_unit_prices"; code: string; uvp: number; ek: number }) => {
      const { error } = await (supabase as any).from(table).update({ uvp, ek, updated_at: new Date().toISOString() }).eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-catalog"] }),
  });

  return { ...query, catalog: query.data, updatePrice };
}
