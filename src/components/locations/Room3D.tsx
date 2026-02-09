import { useMemo } from "react";
import { FloorRoom } from "@/hooks/useFloorRooms";
import * as THREE from "three";

interface Room3DProps {
  room: FloorRoom;
}

const WALL_THICKNESS = 0.1;

export function Room3D({ room }: Room3DProps) {
  const { position_x, position_y, width, depth, wall_height, color } = room;
  
  // Convert 2D position to 3D (x stays, y becomes z in 3D)
  const position: [number, number, number] = [position_x, 0, position_y];
  
  const walls = useMemo(() => {
    const h = wall_height;
    const w = width;
    const d = depth;
    
    return [
      // Back wall (negative Z)
      { 
        position: [0, h / 2, -d / 2] as [number, number, number], 
        size: [w, h, WALL_THICKNESS] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number]
      },
      // Front wall (positive Z)
      { 
        position: [0, h / 2, d / 2] as [number, number, number], 
        size: [w, h, WALL_THICKNESS] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number]
      },
      // Left wall (negative X)
      { 
        position: [-w / 2, h / 2, 0] as [number, number, number], 
        size: [WALL_THICKNESS, h, d] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number]
      },
      // Right wall (positive X)
      { 
        position: [w / 2, h / 2, 0] as [number, number, number], 
        size: [WALL_THICKNESS, h, d] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number]
      },
    ];
  }, [width, depth, wall_height]);

  // Parse color or use default
  const wallColor = color || "#f0f0f0";
  const floorColor = "#e0e0e0";

  return (
    <group position={position}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floorColor} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Walls */}
      {walls.map((wall, index) => (
        <mesh 
          key={index} 
          position={wall.position} 
          rotation={wall.rotation}
          castShadow
          receiveShadow
        >
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      ))}
      
      {/* Room label on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[Math.min(width * 0.8, 2), 0.5]} />
        <meshBasicMaterial color="#333333" transparent opacity={0.1} />
      </mesh>
    </group>
  );
}
