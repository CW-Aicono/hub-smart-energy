import { Gauge } from "lucide-react";
import { Meter } from "@/hooks/useMeters";

interface MeterOverlay2DProps {
  meters: Meter[];
  latestValues: Record<string, number | null>;
}

const energyTypeColors: Record<string, string> = {
  strom: "border-yellow-500/40 bg-yellow-50 dark:bg-yellow-950",
  gas: "border-orange-500/40 bg-orange-50 dark:bg-orange-950",
  waerme: "border-red-500/40 bg-red-50 dark:bg-red-950",
  wasser: "border-blue-500/40 bg-blue-50 dark:bg-blue-950",
};

const energyTypeIconColors: Record<string, string> = {
  strom: "text-yellow-500",
  gas: "text-orange-500",
  waerme: "text-red-500",
  wasser: "text-blue-500",
};

export function MeterOverlay2D({ meters, latestValues }: MeterOverlay2DProps) {
  if (meters.length === 0) return null;

  return (
    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none z-10">
      {meters.map((meter) => {
        const value = latestValues[meter.id];
        const borderClass = energyTypeColors[meter.energy_type] || "border-border bg-card";
        const iconClass = energyTypeIconColors[meter.energy_type] || "text-primary";

        return (
          <div
            key={meter.id}
            className={`border rounded-lg px-2 py-1 min-w-[100px] text-center ${borderClass}`}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Gauge className={`h-3 w-3 ${iconClass}`} />
              <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">
                {meter.name}
              </p>
            </div>
            <p className="text-sm font-mono font-bold text-primary">
              {value != null ? `${value.toLocaleString("de-DE")} ${meter.unit}` : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
