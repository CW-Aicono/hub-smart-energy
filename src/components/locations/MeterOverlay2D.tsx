import { Gauge } from "lucide-react";
import { Meter } from "@/hooks/useMeters";
import { ENERGY_CARD_CLASSES, ENERGY_ICON_CLASSES } from "@/lib/energyTypeColors";

interface MeterOverlay2DProps {
  meters: Meter[];
  latestValues: Record<string, number | null>;
}

export function MeterOverlay2D({ meters, latestValues }: MeterOverlay2DProps) {
  if (meters.length === 0) return null;

  return (
    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none z-10">
      {meters.map((meter) => {
        const value = latestValues[meter.id];
        const borderClass = ENERGY_CARD_CLASSES[meter.energy_type] || "border-border bg-card";
        const iconClass = ENERGY_ICON_CLASSES[meter.energy_type] || "text-primary";

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
