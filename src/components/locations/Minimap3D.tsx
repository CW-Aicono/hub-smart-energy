import { useMemo } from "react";
import { FloorRoom } from "@/hooks/useFloorRooms";

interface Minimap3DProps {
  rooms: FloorRoom[];
  cameraPosition: { x: number; z: number };
  cameraRotation: number; // Y-axis rotation in radians
}

export function Minimap3D({ rooms, cameraPosition, cameraRotation }: Minimap3DProps) {
  const { bounds, scale, offsetX, offsetZ } = useMemo(() => {
    if (rooms.length === 0) {
      return { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, scale: 1, offsetX: 0, offsetZ: 0 };
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    rooms.forEach(room => {
      minX = Math.min(minX, room.position_x - room.width / 2);
      maxX = Math.max(maxX, room.position_x + room.width / 2);
      minZ = Math.min(minZ, room.position_y - room.depth / 2);
      maxZ = Math.max(maxZ, room.position_y + room.depth / 2);
    });

    const padding = 2;
    minX -= padding; maxX += padding; minZ -= padding; maxZ += padding;

    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    const mapSize = 160;
    const s = mapSize / Math.max(rangeX, rangeZ);

    return {
      bounds: { minX, maxX, minZ, maxZ },
      scale: s,
      offsetX: minX,
      offsetZ: minZ,
    };
  }, [rooms]);

  const toMapX = (worldX: number) => (worldX - offsetX) * scale;
  const toMapY = (worldZ: number) => (worldZ - offsetZ) * scale;

  const mapWidth = (bounds.maxX - bounds.minX) * scale;
  const mapHeight = (bounds.maxZ - bounds.minZ) * scale;

  const playerX = toMapX(cameraPosition.x);
  const playerY = toMapY(cameraPosition.z);

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
      <div className="bg-card/90 backdrop-blur-sm border shadow-lg rounded-lg p-2">
        <svg
          width={mapWidth}
          height={mapHeight}
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="block"
        >
          {/* Rooms */}
          {rooms.map((room) => {
            const rx = toMapX(room.position_x - room.width / 2);
            const ry = toMapY(room.position_y - room.depth / 2);
            const rw = room.width * scale;
            const rh = room.depth * scale;
            return (
              <g key={room.id}>
                <rect
                  x={rx} y={ry} width={rw} height={rh}
                  fill="hsl(var(--muted))"
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
                <text
                  x={rx + rw / 2} y={ry + rh / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(rw, rh) * 0.2}
                  fill="hsl(var(--muted-foreground))"
                  className="select-none"
                >
                  {room.name}
                </text>
              </g>
            );
          })}

          {/* Player indicator */}
          <g transform={`translate(${playerX}, ${playerY}) rotate(${(cameraRotation * 180) / Math.PI})`}>
            <polygon
              points="0,-6 4,4 -4,4"
              fill="hsl(var(--primary))"
              stroke="hsl(var(--primary-foreground))"
              strokeWidth={0.5}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
