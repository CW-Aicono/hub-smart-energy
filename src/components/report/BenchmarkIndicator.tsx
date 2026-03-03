import { useBenchmarks, EnergyBenchmark } from "@/hooks/useBenchmarks";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface BenchmarkIndicatorProps {
  specificValue: number; // kWh/m²a
  usageType: string;
  energyType: string; // strom | waerme
  compact?: boolean;
}

export function BenchmarkIndicator({ specificValue, usageType, energyType, compact }: BenchmarkIndicatorProps) {
  const { getBenchmark, getRating } = useBenchmarks(usageType);
  const { t } = useTranslation();
  const bm = getBenchmark(energyType);
  const rating = getRating(specificValue, energyType);

  if (!bm || rating === null) return null;

  const maxVal = bm.high_value * 1.3;
  const pct = Math.min((specificValue / maxVal) * 100, 100);

  const colorMap = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };

  const labelMap = {
    green: t("benchmark.good" as any) || "Gut",
    yellow: t("benchmark.average" as any) || "Mittel",
    red: t("benchmark.high" as any) || "Hoch",
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn("h-3 w-3 rounded-full", colorMap[rating])} />
        <span className="text-sm font-medium">
          {specificValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {bm.unit}
        </span>
        <span className="text-xs text-muted-foreground">({labelMap[rating]})</span>
      </div>
    );
  }

  const energyLabelMap: Record<string, string> = {
    strom: t("energy.electricity" as any) || "Strom",
    electricity: t("energy.electricity" as any) || "Strom",
    waerme: t("energy.heat" as any) || "Wärme",
    heat: t("energy.heat" as any) || "Wärme",
    wasser: t("energy.water" as any) || "Wasser",
    water: t("energy.water" as any) || "Wasser",
    gas: t("energy.gas" as any) || "Gas",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {energyLabelMap[energyType] || energyType}
        </span>
        <span className={cn("font-semibold", rating === "green" ? "text-emerald-600" : rating === "yellow" ? "text-amber-600" : "text-red-600")}>
          {specificValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {bm.unit}
        </span>
      </div>
      <div className="relative h-4 rounded-full bg-muted overflow-hidden">
        {/* Zone markers */}
        <div className="absolute inset-0 flex">
          <div className="bg-emerald-200" style={{ width: `${(bm.target_value / maxVal) * 100}%` }} />
          <div className="bg-amber-200" style={{ width: `${((bm.average_value - bm.target_value) / maxVal) * 100}%` }} />
          <div className="bg-red-200 flex-1" />
        </div>
        {/* Current value marker */}
        <div
          className={cn("absolute top-0 h-full w-1 rounded", colorMap[rating])}
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t("benchmark.target" as any) || "Ziel"}: {bm.target_value}</span>
        <span>{t("benchmark.average" as any) || "Mittel"}: {bm.average_value}</span>
        <span>{t("benchmark.high" as any) || "Grenzwert"}: {bm.high_value}</span>
      </div>
    </div>
  );
}
