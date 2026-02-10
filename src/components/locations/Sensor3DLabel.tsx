import { Billboard, Html } from "@react-three/drei";
import { FloorSensorPosition } from "@/hooks/useFloorSensorPositions";

interface Sensor3DLabelProps {
  position: FloorSensorPosition;
  value?: string;
  unit?: string;
  // Scale factor to convert 2D percentage positions to 3D world coordinates
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
  // Convert 2D percentage position to 3D world coordinates
  // position_x and position_y are percentages (0-100)
  // We scale them to 3D world units
  const x = (position.position_x - 50) * scaleX + offsetX;
  const y = (position as any).position_z ?? 1.5; // Height from floor, default 1.5m
  const z = (position.position_y - 50) * scaleZ + offsetZ;

  return (
    <Billboard
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
      position={[x, y, z]}
    >
      <Html
        center
        distanceFactor={8}
        occlude="blending"
        style={{
          pointerEvents: "none",
          userSelect: "none",
          transition: "opacity 0.3s ease",
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
    </Billboard>
  );
}
