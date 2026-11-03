import { useTranslation } from "@/hooks/useTranslation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function CapacitySummary() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({ queryKey: ["capacity-summary-prices"], queryFn: async () => {
    const { data, error } = await supabase.from("pricing_unit_prices").select("code,uvp,new_sale_uvp,ek").in("code", ["charge_point", "extra_location"]);
    if (error) throw error;
    return data ?? [];
  } });
  const eur = (value: number) => value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  return <div className="space-y-3 text-sm text-muted-foreground">
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{data.map(p => <div key={p.code}><dt className="font-medium text-foreground">{t(p.code === "charge_point" ? "capacity.points" : "capacity.sites")}</dt><dd>VK {eur(Number(p.new_sale_uvp ?? p.uvp))} · EK {eur(Number(p.ek))}<span className="block text-xs">{t("capacity.perMonth")}</span></dd></div>)}</dl>
    <ul className="list-disc pl-4 space-y-1"><li>{t("capacity.limits")}</li><li>{t("license.autoCounted")}</li><li>{t("capacity.billing")}</li></ul>
    <details><summary className="cursor-pointer text-xs">{t("capacity.existing")}</summary><p className="mt-2 text-xs">{t("capacity.existingDetails")}</p></details>
  </div>;
}