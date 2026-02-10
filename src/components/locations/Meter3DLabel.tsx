import { Billboard, Html } from "@react-three/drei";
import { Meter } from "@/hooks/useMeters";
import { Gauge } from "lucide-react";

interface Meter3DLabelProps {
  meter: Meter;
  position: [number, number, number];
  latestValue?: number | null;
}

export function Meter3DLabel({ meter, position, latestValue }: Meter3DLabelProps) {
  const energyTypeColors: Record<string, string> = {
    strom: "text-yellow-500",
    gas: "text-orange-500",
    waerme: "text-red-500",
    wasser: "text-blue-500",
  };

  const colorClass = energyTypeColors[meter.energy_type] || "text-primary";

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
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <div className="bg-card/95 backdrop-blur-sm border border-border shadow-lg rounded-lg px-3 py-2 min-w-[120px] text-center whitespace-nowrap">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Gauge className={`h-3 w-3 ${colorClass}`} />
            <p className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
              {meter.name}
            </p>
          </div>
          {latestValue != null ? (
            <p className="text-lg font-mono font-bold text-primary">
              {latestValue} {meter.unit}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
          {meter.meter_number && (
            <p className="text-[10px] text-muted-foreground">Nr. {meter.meter_number}</p>
          )}
        </div>
      </Html>
    </Billboard>
  );
}
