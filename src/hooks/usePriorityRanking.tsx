import { useMemo } from "react";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { isHeatType } from "@/lib/report/weatherCorrection";
import { getActivePrice } from "@/lib/costCalculations";
import type { Location } from "@/hooks/useLocations";
import type { EnergyPrice } from "@/hooks/useEnergyPrices";
import type { PriorityRow } from "@/components/report/SavingsPotentialSection";

export function usePriorityRanking(
  locations: Location[],
  consumption: Record<string, Record<string, number>> | undefined,
  prices: EnergyPrice[],
  reportYear: number,
): PriorityRow[] {
  const { benchmarks } = useBenchmarks();

  return useMemo<PriorityRow[]>(() => {
    if (!consumption) return [];
    const out: PriorityRow[] = [];
    for (const loc of locations) {
      if (!loc.net_floor_area || loc.net_floor_area <= 0) continue;
      const cons = consumption[loc.id];
      if (!cons) continue;
      const grouped: Record<"strom" | "waerme", number> = { strom: 0, waerme: 0 };
      for (const [eType, kwh] of Object.entries(cons)) {
        if (eType.toLowerCase() === "strom" || eType.toLowerCase() === "electricity") grouped.strom += kwh;
        else if (isHeatType(eType)) grouped.waerme += kwh;
      }
      for (const eType of ["strom", "waerme"] as const) {
        const kwh = grouped[eType];
        if (kwh <= 0) continue;
        const bm = benchmarks.find((b) => b.usage_type === loc.usage_type && b.energy_type === eType);
        if (!bm) continue;
        const specific = kwh / loc.net_floor_area;
        const rating: "green" | "yellow" | "red" =
          specific <= bm.target_value ? "green" : specific <= bm.average_value ? "yellow" : "red";
        const excess = Math.max(0, specific - bm.target_value);
        const estSavingsKwh = excess * loc.net_floor_area;
        const candidates = eType === "waerme" ? ["waerme", "gas", "fernwaerme", "oel"] : ["strom"];
        let price = 0;
        for (const c of candidates) {
          price = getActivePrice(prices, loc.id, c, reportYear);
          if (price > 0) break;
        }
        const ratingWeight = rating === "red" ? 1.5 : rating === "yellow" ? 1.0 : 0.3;
        out.push({
          locationId: loc.id,
          locationName: loc.name,
          usageType: loc.usage_type || "–",
          area: loc.net_floor_area,
          energyType: eType,
          specific,
          benchmarkAvg: bm.average_value,
          excessKwhPerYear: estSavingsKwh,
          estSavingsKwh,
          estSavingsEur: estSavingsKwh * price,
          rating,
          priorityScore: Math.round(estSavingsKwh * ratingWeight),
        });
      }
    }
    return out.sort((a, b) => b.priorityScore - a.priorityScore);
  }, [locations, consumption, benchmarks, prices, reportYear]);
}
