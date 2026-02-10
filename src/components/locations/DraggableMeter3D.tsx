import { useRef, useState, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { Meter } from "@/hooks/useMeters";
import { Meter3DLabel } from "./Meter3DLabel";
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

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function DraggableMeter3D({
  meter,
  position,
  latestValue,
  isAdmin,
  onPositionChange,
  onDragStart,
  onDragEnd,
}: DraggableMeter3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const [isDragging, setIsDragging] = useState(false);
  const [currentPos, setCurrentPos] = useState<[number, number, number]>(position);
  const dragOffset = useRef(new THREE.Vector3());

  // Sync position from props when not dragging
  if (!isDragging && (currentPos[0] !== position[0] || currentPos[1] !== position[1] || currentPos[2] !== position[2])) {
    setCurrentPos(position);
  }

  const getIntersection = useCallback((event: THREE.Event & { point?: THREE.Vector3 }) => {
    const nativeEvent = (event as any).nativeEvent || event;
    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((nativeEvent.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    // Intersect with a horizontal plane at the current Y height
    const yPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -currentPos[1]);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(yPlane, intersection);
    return intersection;
  }, [camera, gl, currentPos]);

  const handlePointerDown = useCallback((e: any) => {
    if (!isAdmin) return;
    e.stopPropagation();
    setIsDragging(true);
    onDragStart?.();
    gl.domElement.style.cursor = "grabbing";
    
    const intersection = getIntersection(e);
    if (intersection) {
      dragOffset.current.set(
        currentPos[0] - intersection.x,
        0,
        currentPos[2] - intersection.z
      );
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((moveEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((moveEvent.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const yPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -currentPos[1]);
      const pt = new THREE.Vector3();
      raycaster.ray.intersectPlane(yPlane, pt);
      if (pt) {
        const newX = pt.x + dragOffset.current.x;
        const newZ = pt.z + dragOffset.current.z;
        setCurrentPos([newX, currentPos[1], newZ]);
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      onDragEnd?.();
      gl.domElement.style.cursor = "grab";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      // Save final position
      setCurrentPos(prev => {
        onPositionChange(meter.id, prev[0], prev[1], prev[2]);
        return prev;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [isAdmin, getIntersection, gl, camera, currentPos, meter.id, onPositionChange, onDragStart, onDragEnd]);

  const handleYChange = useCallback((meterId: string, newY: number) => {
    setCurrentPos(prev => {
      const newPos: [number, number, number] = [prev[0], newY, prev[2]];
      onPositionChange(meterId, newPos[0], newPos[1], newPos[2]);
      return newPos;
    });
  }, [onPositionChange]);

  return (
    <group ref={groupRef}>
      {/* Invisible drag handle sphere */}
      {isAdmin && (
        <mesh
          position={currentPos}
          onPointerDown={handlePointerDown}
          onPointerOver={() => { if (!isDragging) gl.domElement.style.cursor = "grab"; }}
          onPointerOut={() => { if (!isDragging) gl.domElement.style.cursor = "auto"; }}
        >
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      <Meter3DLabel
        meter={meter}
        position={currentPos}
        latestValue={latestValue}
        isAdmin={isAdmin}
        onChangeY={handleYChange}
      />
    </group>
  );
}
