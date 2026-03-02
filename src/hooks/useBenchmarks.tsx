import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/contexts/DemoMode";

export interface EnergyBenchmark {
  id: string;
  usage_type: string;
  energy_type: string;
  target_value: number;
  average_value: number;
  high_value: number;
  unit: string;
  source: string | null;
  valid_year: number;
}

const DEMO_BENCHMARKS: EnergyBenchmark[] = [
  { id: "b1", usage_type: "verwaltungsgebaeude", energy_type: "strom", target_value: 15, average_value: 25, high_value: 40, unit: "kWh/m²a", source: "ages/VDI 3807", valid_year: 2024 },
  { id: "b2", usage_type: "verwaltungsgebaeude", energy_type: "waerme", target_value: 50, average_value: 90, high_value: 140, unit: "kWh/m²a", source: "ages/VDI 3807", valid_year: 2024 },
  { id: "b3", usage_type: "schule", energy_type: "strom", target_value: 10, average_value: 18, high_value: 30, unit: "kWh/m²a", source: "ages/VDI 3807", valid_year: 2024 },
  { id: "b4", usage_type: "schule", energy_type: "waerme", target_value: 50, average_value: 85, high_value: 130, unit: "kWh/m²a", source: "ages/VDI 3807", valid_year: 2024 },
  { id: "b5", usage_type: "sportstaette", energy_type: "strom", target_value: 25, average_value: 40, high_value: 65, unit: "kWh/m²a", source: "ages/VDI 3807", valid_year: 2024 },
  { id: "b6", usage_type: "sportstaette", energy_type: "waerme", target_value: 80, average_value: 130, high_value: 200, unit: "kWh/m²a", source: "ages/VDI 3807", valid_year: 2024 },
];

export function useBenchmarks(usageType?: string | null) {
  const isDemo = useDemoMode();

  const { data: benchmarks = [], isLoading } = useQuery({
    queryKey: ["energy_benchmarks", usageType ?? "all"],
    queryFn: async () => {
      if (isDemo) {
        return usageType
          ? DEMO_BENCHMARKS.filter((b) => b.usage_type === usageType)
          : DEMO_BENCHMARKS;
      }
      let query = supabase.from("energy_benchmarks").select("*");
      if (usageType) query = query.eq("usage_type", usageType);
      const { data, error } = await query.order("energy_type");
      if (error) throw error;
      return (data as unknown as EnergyBenchmark[]) || [];
    },
    enabled: true,
  });

  const getBenchmark = (energyType: string): EnergyBenchmark | undefined => {
    return benchmarks.find((b) => b.energy_type === energyType);
  };

  /** Returns "green" | "yellow" | "red" based on kWh/m²a */
  const getRating = (specificValue: number, energyType: string): "green" | "yellow" | "red" | null => {
    const bm = getBenchmark(energyType);
    if (!bm) return null;
    if (specificValue <= bm.target_value) return "green";
    if (specificValue <= bm.average_value) return "yellow";
    return "red";
  };

  return { benchmarks, loading: isLoading, getBenchmark, getRating };
}
