import { FloorRoom } from "@/hooks/useFloorRooms";

interface PolygonPoint {
  x: number;
  y: number;
}

interface RoomOverlay2DProps {
  rooms: FloorRoom[];
  selectedRoomId?: string | null;
  onSelectRoom?: (room: FloorRoom) => void;
}

export function RoomOverlay2D({ rooms, selectedRoomId, onSelectRoom }: RoomOverlay2DProps) {
  const roomsWithPolygons = rooms.filter(
    (r) => r.polygon_points && Array.isArray(r.polygon_points) && (r.polygon_points as PolygonPoint[]).length >= 3
  );

  if (roomsWithPolygons.length === 0) return null;

  // Ensure color has enough contrast (avoid near-white colors on white backgrounds)
  const ensureVisibleColor = (color: string) => {
    if (!color) return "#3b82f6";
    // Check if color is too light (simple hex check)
    const hex = color.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      // If all channels > 200, it's too light
      if (r > 200 && g > 200 && b > 200) return "#3b82f6";
    }
    return color;
  };

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {roomsWithPolygons.map((room) => {
        const points = room.polygon_points as PolygonPoint[];
        const pointsStr = points.map((p) => `${p.x},${p.y}`).join(" ");
        const isSelected = selectedRoomId === room.id;
        const color = ensureVisibleColor(room.color || "#3b82f6");

        // Calculate centroid for label
        const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
        const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

        return (
          <g key={room.id}>
            <polygon
              points={pointsStr}
              fill={color}
              fillOpacity={isSelected ? 0.35 : 0.15}
              stroke={color}
              strokeWidth={isSelected ? 0.4 : 0.25}
              strokeOpacity={0.8}
              className={onSelectRoom ? "pointer-events-auto cursor-pointer" : ""}
              onClick={() => onSelectRoom?.(room)}
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="1.8"
              fill={color}
              fontWeight="600"
              className="pointer-events-none select-none"
              style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 0.4, strokeLinecap: "round", strokeLinejoin: "round" }}
            >
              {room.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
