import { useRef, useState, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Meter } from "@/hooks/useMeters";
import { Gauge, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { ENERGY_CARD_CLASSES, ENERGY_ICON_CLASSES } from "@/lib/energyTypeColors";
import * as THREE from "three";

interface DraggableMeter3DProps {
  meter: Meter;
  position: [number, number, number];
  latestValue?: number | null;
  isAdmin?: boolean;
  onPositionChange: (meterId: string, x: number, y: number, z: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DraggableMeter3D({
  meter,
  position,
  latestValue,
  isAdmin,
  onPositionChange,
  onDragStart,
  onDragEnd,
}: DraggableMeter3DProps) {
  const { camera, gl } = useThree();
  const [currentPos, setCurrentPos] = useState<[number, number, number]>(position);
  const isDragging = useRef(false);
  const dragStartScreen = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef<[number, number, number]>([0, 0, 0]);

  // Sync position from props when not dragging
  const posRef = useRef(position);
  if (!isDragging.current && (posRef.current[0] !== position[0] || posRef.current[1] !== position[1] || posRef.current[2] !== position[2])) {
    posRef.current = position;
    setCurrentPos(position);
  }

  const screenToWorld = useCallback((screenDeltaX: number, screenDeltaY: number, refPos: [number, number, number]): [number, number, number] => {
    const rect = gl.domElement.getBoundingClientRect();
    
    // Project the reference point to screen space
    const worldPoint = new THREE.Vector3(refPos[0], refPos[1], refPos[2]);
    worldPoint.project(camera);
    
    // Add screen delta (normalized)
    const ndcDx = (screenDeltaX / rect.width) * 2;
    const ndcDy = -(screenDeltaY / rect.height) * 2;
    
    const newScreen = new THREE.Vector3(
      worldPoint.x + ndcDx,
      worldPoint.y + ndcDy,
      worldPoint.z
    );
    
    // Unproject back to world
    newScreen.unproject(camera);
    
    return [newScreen.x, refPos[1], newScreen.z]; // Keep Y fixed
  }, [camera, gl]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (!isAdmin) return;
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    dragStartScreen.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = [...currentPos] as [number, number, number];
    onDragStart?.();

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - dragStartScreen.current.x;
      const dy = moveEvent.clientY - dragStartScreen.current.y;
      const newPos = screenToWorld(dx, dy, dragStartPos.current);
      setCurrentPos(newPos);
    };

    const handleUp = () => {
      isDragging.current = false;
      onDragEnd?.();
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      // Save position
      setCurrentPos(prev => {
        onPositionChange(meter.id, prev[0], prev[1], prev[2]);
        return prev;
      });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [isAdmin, currentPos, screenToWorld, meter.id, onPositionChange, onDragStart, onDragEnd]);

  const handleYChange = useCallback((meterId: string, newY: number) => {
    setCurrentPos(prev => {
      const newPos: [number, number, number] = [prev[0], newY, prev[2]];
      onPositionChange(meterId, newPos[0], newPos[1], newPos[2]);
      return newPos;
    });
  }, [onPositionChange]);

  const borderClass = ENERGY_CARD_CLASSES[meter.energy_type] || "border-border bg-card";
  const iconClass = ENERGY_ICON_CLASSES[meter.energy_type] || "text-primary";

  return (
    <group position={currentPos}>
      <Html
        center
        distanceFactor={8}
        occlude
        style={{
          pointerEvents: isAdmin ? "auto" : "none",
          userSelect: "none",
        }}
      >
        <div className="flex items-center gap-1">
          {isAdmin && (
            <div className="flex flex-col gap-0.5">
              {/* Drag handle */}
              <div
                className="h-6 w-5 flex items-center justify-center rounded bg-primary/20 hover:bg-primary/40 border border-primary/30 text-primary cursor-grab active:cursor-grabbing"
                onPointerDown={handleDragStart}
                title="Ziehen zum Verschieben"
              >
                <GripVertical className="h-3 w-3" />
              </div>
              <button
                className="h-5 w-5 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/20 border text-muted-foreground"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); handleYChange(meter.id, currentPos[1] + 0.5); }}
                title="Höher"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                className="h-5 w-5 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/20 border text-muted-foreground"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); handleYChange(meter.id, currentPos[1] - 0.5); }}
                title="Tiefer"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}
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
        </div>
      </Html>
    </group>
  );
}
