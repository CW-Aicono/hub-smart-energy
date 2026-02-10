import { Html } from "@react-three/drei";
import { FloorSensorPosition } from "@/hooks/useFloorSensorPositions";

interface Sensor3DLabelProps {
  position: FloorSensorPosition;
  value?: string;
  unit?: string;
  scaleX?: number;
  scaleZ?: number;
  offsetX?: number;
  offsetZ?: number;
}

export function Sensor3DLabel({ 
  position, 
  value = "—", 
  unit = "",
  scaleX = 0.2,
  scaleZ = 0.2,
  offsetX = 0,
  offsetZ = 0,
}: Sensor3DLabelProps) {
  const x = (position.position_x - 50) * scaleX + offsetX;
  const y = (position as any).position_z ?? 1.5;
  const z = (position.position_y - 50) * scaleZ + offsetZ;

  return (
    <group position={[x, y, z]}>
      <Html
        center
        distanceFactor={8}
        occlude
        style={{
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <div className="bg-card border shadow-lg rounded-lg px-3 py-2 min-w-[100px] text-center whitespace-nowrap">
          <p className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
            {position.sensor_name}
          </p>
          <p className="text-lg font-mono font-bold text-primary">
            {value} {unit}
          </p>
        </div>
      </Html>
    </group>
  );
}
