import { useRef, useEffect, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

interface Floor3DControlsProps {
  enabled: boolean;
  onLockChange?: (locked: boolean) => void;
  moveSpeed?: number;
  eyeHeight?: number;
}

const MOVE_SPEED = 5;
const EYE_HEIGHT = 1.7;

export function Floor3DControls({ 
  enabled, 
  onLockChange, 
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
    jump: false,
  });

  // Velocity for smooth movement
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  // Set initial camera height
  useEffect(() => {
    camera.position.y = eyeHeight;
  }, [camera, eyeHeight]);

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
          setKeys((k) => ({ ...k, jump: true }));
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
          setKeys((k) => ({ ...k, jump: false }));
          break;
      }
    };

    if (enabled) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled]);

  // Movement logic
  useFrame((_, delta) => {
    if (!enabled || !controlsRef.current?.isLocked) return;

    // Damping
    velocity.current.x -= velocity.current.x * 10.0 * delta;
    velocity.current.z -= velocity.current.z * 10.0 * delta;

    // Direction based on keys
    direction.current.z = Number(keys.forward) - Number(keys.backward);
    direction.current.x = Number(keys.right) - Number(keys.left);
    direction.current.normalize();

    // Apply movement
    if (keys.forward || keys.backward) {
      velocity.current.z -= direction.current.z * moveSpeed * delta * 10;
    }
    if (keys.left || keys.right) {
      velocity.current.x -= direction.current.x * moveSpeed * delta * 10;
    }

    // Move the controls/camera
    controlsRef.current.moveRight(-velocity.current.x * delta);
    controlsRef.current.moveForward(-velocity.current.z * delta);

    // Keep camera at eye height
    camera.position.y = eyeHeight;
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
