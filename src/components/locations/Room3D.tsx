import { useMemo } from "react";
import { FloorRoom } from "@/hooks/useFloorRooms";
import * as THREE from "three";

interface Room3DProps {
  room: FloorRoom;
  showCeiling?: boolean;
}

const WALL_THICKNESS = 0.12;
const WORLD_SCALE = 0.3; // 100% of floor plan ≈ 30 world units
const WORLD_OFFSET = 15; // center around 0

// Convert polygon percentage coords to world XZ coords
function toWorld(p: { x: number; y: number }): [number, number] {
  return [p.x * WORLD_SCALE - WORLD_OFFSET, p.y * WORLD_SCALE - WORLD_OFFSET];
}

// Deterministic pseudo-random from room id
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Build a THREE.Shape from polygon world coords (XZ → used as XY for extrude)
function buildShape(worldPts: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(worldPts[0][0], worldPts[0][1]);
  for (let i = 1; i < worldPts.length; i++) {
    shape.lineTo(worldPts[i][0], worldPts[i][1]);
  }
  shape.closePath();
  return shape;
}

// ─── Wall segment between two points ────────────────────────
function WallSegment({ 
  p1, p2, height, color 
}: { 
  p1: [number, number]; p2: [number, number]; height: number; color: string;
}) {
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const cx = (p1[0] + p2[0]) / 2;
  const cz = (p1[1] + p2[1]) / 2;

  return (
    <mesh
      position={[cx, height / 2, cz]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length, height, WALL_THICKNESS]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

// ─── Door Component ──────────────────────────────────────────
function Door({ p1, p2, wallHeight }: {
  p1: [number, number]; p2: [number, number]; wallHeight: number;
}) {
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  
  // Place door at 20% along the wall
  const t = 0.2;
  const posX = p1[0] + dx * t;
  const posZ = p1[1] + dz * t;
  
  const doorW = Math.min(0.9, length * 0.25);
  const doorH = Math.min(2.1, wallHeight * 0.85);
  const frameDepth = WALL_THICKNESS + 0.04;

  return (
    <group position={[posX, 0, posZ]} rotation={[0, -angle, 0]}>
      {/* Door frame */}
      <mesh position={[0, doorH / 2, 0]} castShadow>
        <boxGeometry args={[doorW + 0.08, doorH + 0.04, frameDepth]} />
        <meshStandardMaterial color="#5c4033" roughness={0.7} />
      </mesh>
      {/* Door panel */}
      <mesh position={[0, doorH / 2, 0]} castShadow>
        <boxGeometry args={[doorW, doorH, frameDepth + 0.01]} />
        <meshStandardMaterial color="#8B6914" roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Door handle */}
      <mesh position={[doorW * 0.35, doorH / 2, frameDepth / 2 + 0.02]} castShadow>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ─── Window Component ────────────────────────────────────────
function WindowOnWall({ p1, p2, wallHeight }: {
  p1: [number, number]; p2: [number, number]; wallHeight: number;
}) {
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  
  const t = 0.6;
  const posX = p1[0] + dx * t;
  const posZ = p1[1] + dz * t;
  
  const winW = Math.min(1.2, length * 0.3);
  const winH = Math.min(1.0, wallHeight * 0.35);
  const winY = wallHeight * 0.55;
  const frameD = WALL_THICKNESS + 0.02;

  return (
    <group position={[posX, 0, posZ]} rotation={[0, -angle, 0]}>
      {/* Window frame */}
      <mesh position={[0, winY, 0]} castShadow>
        <boxGeometry args={[winW + 0.1, winH + 0.1, frameD]} />
        <meshStandardMaterial color="#f5f5f0" roughness={0.4} />
      </mesh>
      {/* Glass */}
      <mesh position={[0, winY, 0]}>
        <boxGeometry args={[winW, winH, frameD * 0.3]} />
        <meshPhysicalMaterial
          color="#a8d8ea"
          transparent
          opacity={0.35}
          roughness={0.05}
          metalness={0.1}
          transmission={0.6}
        />
      </mesh>
      {/* Cross bars */}
      <mesh position={[0, winY, 0]}>
        <boxGeometry args={[winW, 0.03, frameD * 0.5]} />
        <meshStandardMaterial color="#f5f5f0" />
      </mesh>
      <mesh position={[0, winY, 0]}>
        <boxGeometry args={[0.03, winH, frameD * 0.5]} />
        <meshStandardMaterial color="#f5f5f0" />
      </mesh>
      {/* Window sill */}
      <mesh position={[0, winY - winH / 2 - 0.03, 0]} castShadow>
        <boxGeometry args={[winW + 0.2, 0.04, 0.2]} />
        <meshStandardMaterial color="#e8e0d4" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Ceiling Light ──────────────────────────────────────────
function CeilingLight({ height, position }: { height: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, height - 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.03, 16]} />
        <meshStandardMaterial color="#e0e0e0" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, height - 0.15, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.25, 8]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, height - 0.32, 0]}>
        <cylinderGeometry args={[0.05, 0.2, 0.12, 16, 1, true]} />
        <meshStandardMaterial color="#fff8e7" side={THREE.DoubleSide} transparent opacity={0.9} roughness={0.3} />
      </mesh>
      <pointLight position={[0, height - 0.35, 0]} intensity={0.4} distance={6} color="#fff5e0" />
    </group>
  );
}

const DEFAULT_WALL_HEIGHT = 2.8;

export function Room3D({ room, showCeiling = true }: Room3DProps) {
  const wall_height = DEFAULT_WALL_HEIGHT;
  const { color, id, polygon_points } = room;
  const hash = useMemo(() => hashCode(id), [id]);
  const wallColor = color || "#f0f0f0";
  const floorColorBase = "#c8b99a";

  // Use polygon points if available, otherwise fall back to rectangle
  const worldPts = useMemo(() => {
    if (polygon_points && Array.isArray(polygon_points) && polygon_points.length >= 3) {
      return polygon_points.map(p => toWorld(p));
    }
    // Fallback: rectangular room from position/width/depth
    const { position_x: px, position_y: py, width: w, depth: d } = room;
    return [
      [px - w / 2, py - d / 2],
      [px + w / 2, py - d / 2],
      [px + w / 2, py + d / 2],
      [px - w / 2, py + d / 2],
    ] as [number, number][];
  }, [polygon_points, room]);

  // Centroid for light placement
  const centroid = useMemo(() => {
    const cx = worldPts.reduce((s, p) => s + p[0], 0) / worldPts.length;
    const cz = worldPts.reduce((s, p) => s + p[1], 0) / worldPts.length;
    return [cx, cz] as [number, number];
  }, [worldPts]);

  // Floor and ceiling geometry – built in XZ plane directly using BufferGeometry
  // ShapeGeometry works in XY; rotating it can cause sign mismatches with walls.
  // Instead we create the shape with Z negated so that after -PI/2 X-rotation it aligns correctly.
  const floorGeometry = useMemo(() => {
    // Shape in XY where Y = -worldZ (rotation -PI/2 maps shape-Y to +world-Z)
    const shape = new THREE.Shape();
    shape.moveTo(worldPts[0][0], -worldPts[0][1]);
    for (let i = 1; i < worldPts.length; i++) {
      shape.lineTo(worldPts[i][0], -worldPts[i][1]);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [worldPts]);

  // Determine which walls get doors/windows
  const doorWallIdx = hash % worldPts.length;
  const windowWallIdx = (hash + Math.max(1, Math.floor(worldPts.length / 2))) % worldPts.length;

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow geometry={floorGeometry}>
        <meshStandardMaterial color={floorColorBase} roughness={0.7} metalness={0.0} />
      </mesh>

      {/* Ceiling */}
      {showCeiling && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, wall_height, 0]} receiveShadow geometry={floorGeometry}>
          <meshStandardMaterial color="#ffffff" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Ceiling light at centroid */}
      <CeilingLight height={wall_height} position={[centroid[0], 0, centroid[1]]} />

      {/* Walls along each polygon edge */}
      {worldPts.map((pt, i) => {
        const next = worldPts[(i + 1) % worldPts.length];
        return (
          <WallSegment
            key={`wall-${i}`}
            p1={pt}
            p2={next}
            height={wall_height}
            color={wallColor}
          />
        );
      })}

      {/* Door on one wall */}
      {worldPts.length >= 3 && (() => {
        const p1 = worldPts[doorWallIdx];
        const p2 = worldPts[(doorWallIdx + 1) % worldPts.length];
        const dx = p2[0] - p1[0];
        const dz = p2[1] - p1[1];
        const wallLen = Math.sqrt(dx * dx + dz * dz);
        if (wallLen < 1.5) return null;
        return <Door p1={p1} p2={p2} wallHeight={wall_height} />;
      })()}

      {/* Window on another wall */}
      {worldPts.length >= 3 && windowWallIdx !== doorWallIdx && (() => {
        const p1 = worldPts[windowWallIdx];
        const p2 = worldPts[(windowWallIdx + 1) % worldPts.length];
        const dx = p2[0] - p1[0];
        const dz = p2[1] - p1[1];
        const wallLen = Math.sqrt(dx * dx + dz * dz);
        if (wallLen < 1.5) return null;
        return <WindowOnWall p1={p1} p2={p2} wallHeight={wall_height} />;
      })()}
    </group>
  );
}
