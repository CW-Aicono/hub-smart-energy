import { useRef, useEffect, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

interface Floor3DControlsProps {
  enabled: boolean;
  onLockChange?: (locked: boolean) => void;
  onMovingChange?: (moving: boolean) => void;
  moveSpeed?: number;
  eyeHeight?: number;
}

const MOVE_SPEED = 5;
const EYE_HEIGHT = 1.7;

export function Floor3DControls({ 
  enabled, 
  onLockChange, 
  onMovingChange,
  moveSpeed = MOVE_SPEED,
  eyeHeight = EYE_HEIGHT 
}: Floor3DControlsProps) {
  const controlsRef = useRef<any>(null);
  const { camera, gl } = useThree();
  
  const [keys, setKeys] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });

  // Velocity for smooth movement
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const currentHeight = useRef(eyeHeight);

  // Initialize height ref from current camera position (preserve starting position)
  useEffect(() => {
    currentHeight.current = camera.position.y;
  }, [camera]);

  // Handle lock state changes
  useEffect(() => {
    if (!controlsRef.current) return;

    const handleLock = () => onLockChange?.(true);
    const handleUnlock = () => onLockChange?.(false);

    controlsRef.current.addEventListener("lock", handleLock);
    controlsRef.current.addEventListener("unlock", handleUnlock);

    return () => {
      if (controlsRef.current) {
        controlsRef.current.removeEventListener("lock", handleLock);
        controlsRef.current.removeEventListener("unlock", handleUnlock);
      }
    };
  }, [onLockChange]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          setKeys((k) => ({ ...k, forward: true }));
          break;
        case "KeyS":
        case "ArrowDown":
          setKeys((k) => ({ ...k, backward: true }));
          break;
        case "KeyA":
        case "ArrowLeft":
          setKeys((k) => ({ ...k, left: true }));
          break;
        case "KeyD":
        case "ArrowRight":
          setKeys((k) => ({ ...k, right: true }));
          break;
        case "Space":
          e.preventDefault();
          setKeys((k) => ({ ...k, up: true }));
          break;
        case "ShiftLeft":
        case "ShiftRight":
          setKeys((k) => ({ ...k, down: true }));
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          setKeys((k) => ({ ...k, forward: false }));
          break;
        case "KeyS":
        case "ArrowDown":
          setKeys((k) => ({ ...k, backward: false }));
          break;
        case "KeyA":
        case "ArrowLeft":
          setKeys((k) => ({ ...k, left: false }));
          break;
        case "KeyD":
        case "ArrowRight":
          setKeys((k) => ({ ...k, right: false }));
          break;
        case "Space":
          setKeys((k) => ({ ...k, up: false }));
          break;
        case "ShiftLeft":
        case "ShiftRight":
          setKeys((k) => ({ ...k, down: false }));
          break;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!controlsRef.current?.isLocked) return;
      e.preventDefault();
      currentHeight.current = Math.max(0.5, Math.min(20, currentHeight.current - e.deltaY * 0.005));
    };

    if (enabled) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
      gl.domElement.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      gl.domElement.removeEventListener("wheel", handleWheel);
    };
  }, [enabled]);

  // Movement logic
  useFrame((_, delta) => {
    if (!enabled || !controlsRef.current?.isLocked) return;

    const moving = keys.forward || keys.backward || keys.left || keys.right || keys.up || keys.down;
    onMovingChange?.(moving);

    // Damping for horizontal movement
    velocity.current.x -= velocity.current.x * 10.0 * delta;
    velocity.current.z -= velocity.current.z * 10.0 * delta;

    // Direction based on keys
    direction.current.z = Number(keys.forward) - Number(keys.backward);
    direction.current.x = Number(keys.right) - Number(keys.left);
    direction.current.normalize();

    // Apply horizontal movement
    if (keys.forward || keys.backward) {
      velocity.current.z -= direction.current.z * moveSpeed * delta * 10;
    }
    if (keys.left || keys.right) {
      velocity.current.x -= direction.current.x * moveSpeed * delta * 10;
    }

    // Vertical movement via Space/Shift
    const verticalSpeed = moveSpeed * 0.6;
    if (keys.up) {
      currentHeight.current = Math.min(20, currentHeight.current + verticalSpeed * delta);
    }
    if (keys.down) {
      currentHeight.current = Math.max(0.5, currentHeight.current - verticalSpeed * delta);
    }

    // Move the controls/camera
    controlsRef.current.moveRight(-velocity.current.x * delta);
    controlsRef.current.moveForward(-velocity.current.z * delta);

    // Apply height
    camera.position.y = currentHeight.current;
  });

  // Auto-lock when enabled
  useEffect(() => {
    if (enabled && controlsRef.current && !controlsRef.current.isLocked) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        controlsRef.current?.lock();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [enabled]);

  return <PointerLockControls ref={controlsRef} args={[camera, gl.domElement]} />;
}
