import { useMemo } from "react";
import { FloorRoom } from "@/hooks/useFloorRooms";
import * as THREE from "three";

interface Room3DProps {
  room: FloorRoom;
}

const WALL_THICKNESS = 0.12;

// Deterministic pseudo-random from room id
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ─── Door Component ──────────────────────────────────────────
function Door({ wallWidth, wallHeight, wallPos, wallAxis }: {
  wallWidth: number; wallHeight: number;
  wallPos: [number, number, number]; wallAxis: "x" | "z";
}) {
  const doorW = Math.min(0.9, wallWidth * 0.25);
  const doorH = Math.min(2.1, wallHeight * 0.85);
  const doorOffset = wallWidth * 0.2 - wallWidth / 2;

  const pos: [number, number, number] = wallAxis === "z"
    ? [doorOffset, doorH / 2, wallPos[2]]
    : [wallPos[0], doorH / 2, doorOffset];

  const frameDepth = WALL_THICKNESS + 0.04;

  return (
    <group position={pos}>
      {/* Door frame */}
      <mesh castShadow>
        <boxGeometry args={wallAxis === "z" ? [doorW + 0.08, doorH + 0.04, frameDepth] : [frameDepth, doorH + 0.04, doorW + 0.08]} />
        <meshStandardMaterial color="#5c4033" roughness={0.7} />
      </mesh>
      {/* Door panel */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={wallAxis === "z" ? [doorW, doorH, frameDepth + 0.01] : [frameDepth + 0.01, doorH, doorW]} />
        <meshStandardMaterial color="#8B6914" roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Door handle */}
      <mesh position={wallAxis === "z" ? [doorW * 0.35, 0, frameDepth / 2 + 0.02] : [frameDepth / 2 + 0.02, 0, doorW * 0.35]} castShadow>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ─── Window Component ────────────────────────────────────────
function Window({ wallWidth, wallHeight, wallPos, wallAxis, offset }: {
  wallWidth: number; wallHeight: number;
  wallPos: [number, number, number]; wallAxis: "x" | "z"; offset: number;
}) {
  const winW = Math.min(1.2, wallWidth * 0.3);
  const winH = Math.min(1.0, wallHeight * 0.35);
  const winY = wallHeight * 0.55;
  const xOff = offset;

  const pos: [number, number, number] = wallAxis === "z"
    ? [xOff, winY, wallPos[2]]
    : [wallPos[0], winY, xOff];

  const frameD = WALL_THICKNESS + 0.02;

  return (
    <group position={pos}>
      {/* Window frame */}
      <mesh castShadow>
        <boxGeometry args={wallAxis === "z" ? [winW + 0.1, winH + 0.1, frameD] : [frameD, winH + 0.1, winW + 0.1]} />
        <meshStandardMaterial color="#f5f5f0" roughness={0.4} />
      </mesh>
      {/* Glass */}
      <mesh>
        <boxGeometry args={wallAxis === "z" ? [winW, winH, frameD * 0.3] : [frameD * 0.3, winH, winW]} />
        <meshPhysicalMaterial
          color="#a8d8ea"
          transparent
          opacity={0.35}
          roughness={0.05}
          metalness={0.1}
          transmission={0.6}
        />
      </mesh>
      {/* Window cross bars */}
      <mesh>
        <boxGeometry args={wallAxis === "z" ? [winW, 0.03, frameD * 0.5] : [frameD * 0.5, 0.03, winW]} />
        <meshStandardMaterial color="#f5f5f0" />
      </mesh>
      <mesh>
        <boxGeometry args={wallAxis === "z" ? [0.03, winH, frameD * 0.5] : [frameD * 0.5, winH, 0.03]} />
        <meshStandardMaterial color="#f5f5f0" />
      </mesh>
      {/* Window sill */}
      <mesh position={[0, -winH / 2 - 0.03, 0]} castShadow>
        <boxGeometry args={wallAxis === "z" ? [winW + 0.2, 0.04, 0.2] : [0.2, 0.04, winW + 0.2]} />
        <meshStandardMaterial color="#e8e0d4" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Furniture: Desk ─────────────────────────────────────────
function Desk({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Table top */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.04, 0.7]} />
        <meshStandardMaterial color="#a0784c" roughness={0.6} />
      </mesh>
      {/* Legs */}
      {[[-0.65, 0, -0.3], [0.65, 0, -0.3], [-0.65, 0, 0.3], [0.65, 0, 0.3]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.37, p[2]]} castShadow>
          <boxGeometry args={[0.05, 0.74, 0.05]} />
          <meshStandardMaterial color="#8B7355" roughness={0.7} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 1.05, -0.2]} castShadow>
        <boxGeometry args={[0.6, 0.4, 0.03]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.82, -0.2]} castShadow>
        <boxGeometry args={[0.08, 0.12, 0.08]} />
        <meshStandardMaterial color="#333" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Monitor base */}
      <mesh position={[0, 0.76, -0.2]} castShadow>
        <boxGeometry args={[0.25, 0.02, 0.18]} />
        <meshStandardMaterial color="#333" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0, 0.77, 0.05]} castShadow>
        <boxGeometry args={[0.4, 0.015, 0.15]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Furniture: Chair ────────────────────────────────────────
function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.45, 0.05, 0.45]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.6} />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.75, -0.2]} castShadow>
        <boxGeometry args={[0.43, 0.55, 0.04]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.6} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
        <meshStandardMaterial color="#666" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.03, 12]} />
        <meshStandardMaterial color="#555" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─── Furniture: Shelf ────────────────────────────────────────
function Shelf({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Side panels */}
      <mesh position={[-0.45, 1.0, 0]} castShadow>
        <boxGeometry args={[0.03, 2.0, 0.35]} />
        <meshStandardMaterial color="#d4b896" roughness={0.6} />
      </mesh>
      <mesh position={[0.45, 1.0, 0]} castShadow>
        <boxGeometry args={[0.03, 2.0, 0.35]} />
        <meshStandardMaterial color="#d4b896" roughness={0.6} />
      </mesh>
      {/* Shelves */}
      {[0.01, 0.5, 1.0, 1.5, 1.95].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.87, 0.025, 0.35]} />
          <meshStandardMaterial color="#d4b896" roughness={0.6} />
        </mesh>
      ))}
      {/* Some books */}
      {[
        { x: -0.2, y: 0.63, w: 0.04, h: 0.22, c: "#c0392b" },
        { x: -0.12, y: 0.61, w: 0.04, h: 0.18, c: "#2980b9" },
        { x: -0.04, y: 0.62, w: 0.05, h: 0.2, c: "#27ae60" },
        { x: 0.15, y: 1.13, w: 0.04, h: 0.22, c: "#8e44ad" },
        { x: 0.23, y: 1.12, w: 0.05, h: 0.2, c: "#e67e22" },
      ].map((b, i) => (
        <mesh key={`book-${i}`} position={[b.x, b.y, 0]} castShadow>
          <boxGeometry args={[b.w, b.h, 0.18]} />
          <meshStandardMaterial color={b.c} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Furniture: Plant ────────────────────────────────────────
function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.12, 0.3, 12]} />
        <meshStandardMaterial color="#c17f59" roughness={0.8} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.02, 12]} />
        <meshStandardMaterial color="#3e2723" roughness={0.9} />
      </mesh>
      {/* Foliage */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color="#2d7a3a" roughness={0.8} />
      </mesh>
      <mesh position={[0.1, 0.75, 0.05]} castShadow>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color="#3a9148" roughness={0.8} />
      </mesh>
      <mesh position={[-0.08, 0.7, -0.08]} castShadow>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#256e31" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ─── Baseboard (Fußleiste) ──────────────────────────────────
function Baseboard({ width, depth }: { width: number; depth: number }) {
  const h = 0.08;
  const t = 0.02;
  return (
    <group>
      <mesh position={[0, h / 2, -depth / 2 + t / 2]}>
        <boxGeometry args={[width, h, t]} />
        <meshStandardMaterial color="#f5f0e8" roughness={0.5} />
      </mesh>
      <mesh position={[0, h / 2, depth / 2 - t / 2]}>
        <boxGeometry args={[width, h, t]} />
        <meshStandardMaterial color="#f5f0e8" roughness={0.5} />
      </mesh>
      <mesh position={[-width / 2 + t / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, depth]} />
        <meshStandardMaterial color="#f5f0e8" roughness={0.5} />
      </mesh>
      <mesh position={[width / 2 - t / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, depth]} />
        <meshStandardMaterial color="#f5f0e8" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Ceiling Light ──────────────────────────────────────────
function CeilingLight({ height, position }: { height: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Fixture base */}
      <mesh position={[0, height - 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.03, 16]} />
        <meshStandardMaterial color="#e0e0e0" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Rod */}
      <mesh position={[0, height - 0.15, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.25, 8]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Shade */}
      <mesh position={[0, height - 0.32, 0]}>
        <cylinderGeometry args={[0.05, 0.2, 0.12, 16, 1, true]} />
        <meshStandardMaterial color="#fff8e7" side={THREE.DoubleSide} transparent opacity={0.9} roughness={0.3} />
      </mesh>
      {/* Point light */}
      <pointLight position={[0, height - 0.35, 0]} intensity={0.4} distance={6} color="#fff5e0" />
    </group>
  );
}

// ─── Main Room3D ─────────────────────────────────────────────
export function Room3D({ room }: Room3DProps) {
  const { position_x, position_y, width, depth, wall_height, color, id } = room;
  const position: [number, number, number] = [position_x, 0, position_y];

  const hash = useMemo(() => hashCode(id), [id]);

  const wallColor = color || "#f0f0f0";
  const floorColorBase = "#c8b99a";

  // Deterministic furniture placement based on room hash
  const furniture = useMemo(() => {
    const items: JSX.Element[] = [];
    const rng = (seed: number) => ((seed * 9301 + 49297) % 233280) / 233280;
    const minDim = Math.min(width, depth);

    // Always place a desk if room is big enough
    if (minDim >= 3) {
      const dx = width * 0.25 - width / 2 + 0.8;
      const dz = -depth * 0.3 + depth / 2 - 0.8;
      items.push(<Desk key="desk" position={[dx, 0, dz]} rotation={Math.PI} />);
      items.push(<Chair key="chair" position={[dx, 0, dz + 0.7]} rotation={0} />);
    }

    // Shelf on a wall
    if (minDim >= 3 && rng(hash) > 0.3) {
      const sx = width / 2 - 0.25;
      items.push(<Shelf key="shelf" position={[sx, 0, 0]} rotation={-Math.PI / 2} />);
    }

    // Plant in corner
    if (rng(hash + 1) > 0.2) {
      const px = -width / 2 + 0.3;
      const pz = depth / 2 - 0.3;
      items.push(<Plant key="plant" position={[px, 0, pz]} />);
    }

    return items;
  }, [width, depth, hash]);

  // Determine which walls get doors/windows based on hash
  const doorWall = hash % 4; // 0=back, 1=front, 2=left, 3=right
  const windowWall = (hash + 2) % 4;

  const wallPositions: { pos: [number, number, number]; size: [number, number, number]; axis: "x" | "z"; wallWidth: number }[] = useMemo(() => [
    { pos: [0, wall_height / 2, -depth / 2], size: [width, wall_height, WALL_THICKNESS], axis: "z", wallWidth: width },
    { pos: [0, wall_height / 2, depth / 2], size: [width, wall_height, WALL_THICKNESS], axis: "z", wallWidth: width },
    { pos: [-width / 2, wall_height / 2, 0], size: [WALL_THICKNESS, wall_height, depth], axis: "x", wallWidth: depth },
    { pos: [width / 2, wall_height / 2, 0], size: [WALL_THICKNESS, wall_height, depth], axis: "x", wallWidth: depth },
  ], [width, depth, wall_height]);

  return (
    <group position={position}>
      {/* Floor - wood-like */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floorColorBase} roughness={0.7} metalness={0.0} />
      </mesh>

      {/* Floor planks pattern */}
      {Array.from({ length: Math.floor(width / 0.15) }).map((_, i) => (
        <mesh key={`plank-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-width / 2 + i * 0.15 + 0.075, 0.002, 0]}>
          <planeGeometry args={[0.005, depth]} />
          <meshStandardMaterial color="#b5a48a" transparent opacity={0.3} />
        </mesh>
      ))}

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, wall_height, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Ceiling light */}
      <CeilingLight height={wall_height} position={[0, 0, 0]} />

      {/* Baseboard */}
      <Baseboard width={width} depth={depth} />

      {/* Walls */}
      {wallPositions.map((wall, index) => (
        <mesh
          key={index}
          position={wall.pos}
          castShadow
          receiveShadow
        >
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={wallColor} roughness={0.85} />
        </mesh>
      ))}

      {/* Door */}
      {width >= 2 && depth >= 2 && (
        <Door
          wallWidth={wallPositions[doorWall].wallWidth}
          wallHeight={wall_height}
          wallPos={wallPositions[doorWall].pos}
          wallAxis={wallPositions[doorWall].axis}
        />
      )}

      {/* Windows */}
      {width >= 2 && depth >= 2 && windowWall !== doorWall && (
        <Window
          wallWidth={wallPositions[windowWall].wallWidth}
          wallHeight={wall_height}
          wallPos={wallPositions[windowWall].pos}
          wallAxis={wallPositions[windowWall].axis}
          offset={wallPositions[windowWall].wallWidth * 0.15}
        />
      )}

      {/* Additional window on opposite wall if room is big enough */}
      {width >= 5 && depth >= 5 && (() => {
        const extraWall = (windowWall + 2) % 4;
        if (extraWall === doorWall) return null;
        return (
          <Window
            wallWidth={wallPositions[extraWall].wallWidth}
            wallHeight={wall_height}
            wallPos={wallPositions[extraWall].pos}
            wallAxis={wallPositions[extraWall].axis}
            offset={-wallPositions[extraWall].wallWidth * 0.15}
          />
        );
      })()}

      {/* Furniture */}
      {furniture}
    </group>
  );
}
