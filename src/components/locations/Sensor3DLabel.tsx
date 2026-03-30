import { Html } from "@react-three/drei";
import { FloorSensorPosition } from "@/hooks/useFloorSensorPositions";

interface Sensor3DLabelProps {
  position: FloorSensorPosition;
  value?: string;
  unit?: string;
  /** Live sensor name from the gateway API; preferred over stored position name */
  liveName?: string;
  /** @deprecated use ROOM_SCALE/ROOM_OFFSET instead */
  scaleX?: number;
  /** @deprecated use ROOM_SCALE/ROOM_OFFSET instead */
  scaleZ?: number;
  /** @deprecated use ROOM_SCALE/ROOM_OFFSET instead */
  offsetX?: number;
  /** @deprecated use ROOM_SCALE/ROOM_OFFSET instead */
  offsetZ?: number;
}

// Must match the room polygon transform in FloorPlan3DViewer (deriveRoomBounds)
const ROOM_SCALE = 0.3;
const ROOM_OFFSET = 15;

export function Sensor3DLabel({ 
  position, 
  value = "—", 
  unit = "",
  liveName,
}: Sensor3DLabelProps) {
  const x = position.position_x * ROOM_SCALE - ROOM_OFFSET;
  const y = (position as any).position_z ?? 1.5;
  const z = position.position_y * ROOM_SCALE - ROOM_OFFSET;
  const displayName = liveName || position.sensor_name;

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
