import { Billboard, Html } from "@react-three/drei";
import { Meter } from "@/hooks/useMeters";
import { Gauge, ChevronUp, ChevronDown } from "lucide-react";
import { ENERGY_CARD_CLASSES, ENERGY_ICON_CLASSES } from "@/lib/energyTypeColors";

interface Meter3DLabelProps {
  meter: Meter;
  position: [number, number, number];
  latestValue?: number | null;
  isAdmin?: boolean;
  onChangeY?: (meterId: string, newY: number) => void;
}

export function Meter3DLabel({ meter, position, latestValue, isAdmin, onChangeY }: Meter3DLabelProps) {
  const borderClass = ENERGY_CARD_CLASSES[meter.energy_type] || "border-border bg-card";
  const iconClass = ENERGY_ICON_CLASSES[meter.energy_type] || "text-primary";

  return (
    <Billboard
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
      position={position}
    >
      <Html
        center
        distanceFactor={8}
        style={{
          pointerEvents: isAdmin ? "auto" : "none",
          userSelect: "none",
        }}
      >
        <div className="flex items-center gap-1">
          {isAdmin && onChangeY && (
            <div className="flex flex-col gap-0.5">
              <button
                className="h-5 w-5 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/20 border text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); onChangeY(meter.id, position[1] + 0.5); }}
                title="Höher"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                className="h-5 w-5 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/20 border text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); onChangeY(meter.id, position[1] - 0.5); }}
                title="Tiefer"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className={`border rounded-lg px-3 py-2 min-w-[120px] text-center whitespace-nowrap ${borderClass}`}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Gauge className={`h-3 w-3 ${iconClass}`} />
              <p className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
                {meter.name}
              </p>
            </div>
            <p className="text-lg font-mono font-bold text-primary">
              {latestValue != null ? `${latestValue.toLocaleString("de-DE")} ${meter.unit}` : "—"}
            </p>
            {meter.meter_number && (
              <p className="text-[10px] text-muted-foreground">Nr. {meter.meter_number}</p>
            )}
          </div>
        </div>
      </Html>
    </Billboard>
  );
}
