import { Billboard, Html } from "@react-three/drei";
import { Meter } from "@/hooks/useMeters";
import { Gauge } from "lucide-react";

interface Meter3DLabelProps {
  meter: Meter;
  position: [number, number, number];
  latestValue?: number | null;
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

export function Meter3DLabel({ meter, position, latestValue }: Meter3DLabelProps) {
  const borderClass = energyTypeColors[meter.energy_type] || "border-border bg-card";
  const iconClass = energyTypeIconColors[meter.energy_type] || "text-primary";

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
      </Html>
    </Billboard>
  );
}
