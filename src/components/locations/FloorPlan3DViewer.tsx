import { useState, useCallback, useMemo, useRef, useEffect, Component, type ReactNode, type ErrorInfo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls, Html } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Square, Edit, Loader2, RotateCw, Eye, EyeOff } from "lucide-react";
import { Floor, useFloors } from "@/hooks/useFloors";
import { FloorRoom, useFloorRooms } from "@/hooks/useFloorRooms";
import { FloorSensorPosition, useFloorSensorPositions } from "@/hooks/useFloorSensorPositions";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { Room3D } from "./Room3D";
import { Floor3DControls } from "./Floor3DControls";
import { Sensor3DLabel } from "./Sensor3DLabel";
import { DraggableMeter3D } from "./DraggableMeter3D";
import { RoomEditor } from "./RoomEditor";
import { Minimap3D } from "./Minimap3D";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { TDSLoader } from "three/examples/jsm/loaders/TDSLoader.js";
import * as THREE from "three";

interface Sensor {
  id: string;
  name: string;
  value: string;
  unit: string;
}

interface FloorPlan3DViewerProps {
  floor: Floor;
  locationId: string;
  sensors?: Sensor[];
  isAdmin?: boolean;
  compact?: boolean;
  readOnly?: boolean;
}

// ErrorBoundary for catching Three.js / R3F render errors
class Canvas3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || "Unknown 3D error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("3D Viewer error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-destructive">
          <div className="text-center p-4">
            <p className="text-sm font-medium mb-1">3D-Darstellung fehlgeschlagen</p>
            <p className="text-xs text-muted-foreground max-w-[300px]">{this.state.error}</p>
            <button
              className="mt-2 text-xs underline text-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CameraTracker({ onUpdate }: { onUpdate: (pos: { x: number; z: number }, rotY: number) => void }) {
  useFrame(({ camera }) => {
    onUpdate({ x: camera.position.x, z: camera.position.z }, camera.rotation.y);
  });
  return null;
}

// Auto-detects Z-up, centers, grounds and auto-scales a 3D object to fit the scene
function centerAndGroundObject(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  
  // Auto-detect Z-up coordinate system (common in CAD exports like Vectorworks)
  const tempBox = new THREE.Box3().setFromObject(obj);
  const tempSize = tempBox.getSize(new THREE.Vector3());
  if (tempSize.z > tempSize.y * 1.5) {
    obj.rotation.x = -Math.PI / 2;
    obj.updateMatrixWorld(true);
  }
  
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  // Auto-scale: if the model is very large (e.g. mm coordinates), scale it down
  const maxDim = Math.max(size.x, size.y, size.z);
  const targetSize = 20; // Target ~20 units across
  if (maxDim > 100) {
    const scale = targetSize / maxDim;
    obj.scale.multiplyScalar(scale);
    obj.updateMatrixWorld(true);
    // Recompute after scaling
    box.setFromObject(obj);
    box.getCenter(center);
  }
  
  // Center horizontally, place bottom on ground (y=0)
  obj.position.set(
    obj.position.x - center.x,
    obj.position.y - box.min.y,
    obj.position.z - center.z
  );
  obj.updateMatrixWorld(true);
}

function normalizeModelStorageUrl(url?: string | null): string | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0];
  return withoutQuery.replace(
    "/storage/v1/object/sign/floor-3d-models/",
    "/storage/v1/object/public/floor-3d-models/",
  );
}

// Renders a GLB model
function GLBModel({ url }: { url: string }) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadModel = async () => {
      setLoading(true);
      setError(null);
      try {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(url);
        const clone = gltf.scene.clone(true);

        // Remove any cameras embedded in the model
        const toRemove: THREE.Object3D[] = [];
        clone.traverse((child) => {
          if (child instanceof THREE.Camera) {
            toRemove.push(child);
          }
        });
        toRemove.forEach((obj) => obj.removeFromParent());

        centerAndGroundObject(clone);

        if (!cancelled) {
          setObject(clone);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading GLB model:", err);
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    };

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <Html center>
        <div className="text-destructive text-sm font-medium whitespace-nowrap">Fehler beim Laden des 3D-Modells</div>
      </Html>
    );
  }

  if (loading || !object) return null;

  return <primitive object={object} />;
}

// Renders an OBJ model with optional MTL
function OBJModel({ objUrl, mtlUrl }: { objUrl: string; mtlUrl?: string | null }) {
  const [object, setObject] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadModel = async () => {
      setLoading(true);
      try {
        let materials: MTLLoader.MaterialCreator | undefined;
        if (mtlUrl) {
          const mtlLoader = new MTLLoader();
          materials = await mtlLoader.loadAsync(mtlUrl);
          materials.preload();
        }

        const objLoader = new OBJLoader();
        if (materials) {
          objLoader.setMaterials(materials);
        }

        const obj = await objLoader.loadAsync(objUrl);

        // Apply default material if no MTL
        if (!mtlUrl) {
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
            }
          });
        }

        // Center and ground the loaded model (includes auto-scaling)
        centerAndGroundObject(obj);
        if (!cancelled) {
          setObject(obj);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading OBJ model:", err);
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    };
    loadModel();
    return () => { cancelled = true; };
  }, [objUrl, mtlUrl]);

  if (error) {
    return (
      <Html center>
        <div className="text-destructive text-sm font-medium whitespace-nowrap">Fehler beim Laden des 3D-Modells</div>
      </Html>
    );
  }

  if (loading || !object) return null;

  return <primitive object={object} />;
}

// Renders a 3DS model
function TDSModel({ url }: { url: string }) {
  const [object, setObject] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadModel = async () => {
      setLoading(true);
      setError(null);
      try {
        const loader = new TDSLoader();
        const obj = await loader.loadAsync(url);
        centerAndGroundObject(obj);
        if (!cancelled) {
          setObject(obj);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading 3DS model:", err);
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    };

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <Html center>
        <div className="text-destructive text-sm font-medium whitespace-nowrap">Fehler beim Laden des 3D-Modells</div>
      </Html>
    );
  }

  if (loading || !object) return null;

  return <primitive object={object} />;
}

// Wraps a model, applies X-axis rotation, then re-grounds once after load/rotation changes
function RotatedModelGroup({ rotationDeg, modelKey, children }: { rotationDeg: number; modelKey: string; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const rotationX = (rotationDeg * Math.PI) / 180;
  const needsGroundingRef = useRef(true);
  const groundingFramesRef = useRef(0);

  useEffect(() => {
    needsGroundingRef.current = true;
    groundingFramesRef.current = 0;
  }, [rotationX, modelKey]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !needsGroundingRef.current) return;

    group.position.y = 0;
    group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(group);

    if (!box.isEmpty()) {
      group.position.y = -box.min.y;
      needsGroundingRef.current = false;
      groundingFramesRef.current = 0;
      return;
    }

    // Keep trying indefinitely for empty boxes (model still loading / returns null)
    // No timeout - grounding will succeed once the model renders
  });

  return (
    <group ref={groupRef} rotation={[rotationX, 0, 0]}>
      {children}
    </group>
  );
}

// Renders uploaded 3D model (GLB, OBJ+MTL, or 3DS) with optional manual rotation
function ModelViewer({ floor, rotationDeg }: { floor: Floor; rotationDeg: number }) {
  const modelUrl = normalizeModelStorageUrl(floor.model_3d_url);
  if (!modelUrl) return null;

  const mtlUrl = normalizeModelStorageUrl(floor.model_3d_mtl_url);
  const pathOnly = modelUrl.toLowerCase();

  let modelElement: JSX.Element;

  if (pathOnly.endsWith(".glb")) {
    modelElement = <GLBModel url={modelUrl} />;
  } else if (pathOnly.endsWith(".3ds")) {
    modelElement = <TDSModel url={modelUrl} />;
  } else {
    modelElement = <OBJModel objUrl={modelUrl} mtlUrl={mtlUrl} />;
  }

  return (
    <RotatedModelGroup rotationDeg={rotationDeg} modelKey={pathOnly}>
      {modelElement}
    </RotatedModelGroup>
  );
}

/**
 * Derive centroid position for labels and scene bounds when room uses polygon_points.
 * Room3D now handles polygon→3D conversion internally.
 */
function deriveRoomCenter(room: FloorRoom, index: number, totalRooms: number): { cx: number; cz: number } {
  const pts = room.polygon_points;
  const SCALE = 0.3;
  const OFFSET = 15;

  if (pts && Array.isArray(pts) && pts.length >= 3) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * SCALE - OFFSET;
    const cz = pts.reduce((s, p) => s + p.y, 0) / pts.length * SCALE - OFFSET;
    return { cx, cz };
  }

  // Rooms with explicit position
  if (room.position_x !== 0 || room.position_y !== 0) {
    return { cx: room.position_x, cz: room.position_y };
  }

  // Spread rooms that have no polygon and no position
  const spacing = 5;
  const cols = Math.ceil(Math.sqrt(totalRooms));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { cx: col * spacing, cz: row * spacing };
}

/** Derive scene bounds from rooms (polygon or position-based) */
function deriveRoomBounds(room: FloorRoom, index: number, totalRooms: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const pts = room.polygon_points;
  const SCALE = 0.3;
  const OFFSET = 15;

  if (pts && Array.isArray(pts) && pts.length >= 3) {
    const xs = pts.map(p => p.x * SCALE - OFFSET);
    const zs = pts.map(p => p.y * SCALE - OFFSET);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }

  const center = deriveRoomCenter(room, index, totalRooms);
  const hw = room.width / 2 || 2;
  const hd = room.depth / 2 || 2;
  return { minX: center.cx - hw, maxX: center.cx + hw, minZ: center.cz - hd, maxZ: center.cz + hd };
}

function Scene({ 
  floor,
  rooms, 
  sensorPositions, 
  sensors,
  floorMeters,
  meterLatestValues,
  isWalking,
  rotationDeg,
  isAdmin,
  readOnly,
  showCeiling,
  onMeterPositionChange,
  onLockChange,
  onMovingChange,
  onCameraUpdate,
}: { 
  floor: Floor;
  rooms: FloorRoom[];
  sensorPositions: FloorSensorPosition[];
  sensors: Sensor[];
  floorMeters: Meter[];
  meterLatestValues: Record<string, { value: number | null; unit: string }>;
  isWalking: boolean;
  rotationDeg: number;
  isAdmin: boolean;
  readOnly: boolean;
  showCeiling: boolean;
  onMeterPositionChange: (meterId: string, x: number, y: number, z: number) => void;
  onLockChange: (locked: boolean) => void;
  onMovingChange: (moving: boolean) => void;
  onCameraUpdate: (pos: { x: number; z: number }, rotY: number) => void;
}) {
  const [isDraggingMeter, setIsDraggingMeter] = useState(false);
  // Calculate scene bounds based on rooms
  const sceneBounds = useMemo(() => {
    if (rooms.length === 0) {
      return { minX: -10, maxX: 10, minZ: -10, maxZ: 10, centerX: 0, centerZ: 0 };
    }
    
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    
    rooms.forEach((room, index) => {
      const bounds = deriveRoomBounds(room, index, rooms.length);
      minX = Math.min(minX, bounds.minX);
      maxX = Math.max(maxX, bounds.maxX);
      minZ = Math.min(minZ, bounds.minZ);
      maxZ = Math.max(maxZ, bounds.maxZ);
    });
    
    return {
      minX, maxX, minZ, maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }, [rooms]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      
      {/* Additional fill light for reflections (replaces external HDR Environment) */}
      <hemisphereLight args={["#b1e1ff", "#b97a20", 0.5]} />
      
      {/* Ground grid - placed well below floor polygons to prevent z-fighting */}
      <Grid 
        args={[100, 100]} 
        cellSize={1} 
        cellThickness={0.5}
        cellColor="#6b7280"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#374151"
        fadeDistance={50}
        fadeStrength={1}
        position={[sceneBounds.centerX, -0.05, sceneBounds.centerZ]}
      />
      
      {/* 3D Model or procedural rooms */}
      {floor.model_3d_url ? (
        <ModelViewer floor={floor} rotationDeg={rotationDeg} />
      ) : (
        <>
          {/* Rooms - render with polygon shapes */}
          {rooms.map((room) => (
            <Room3D key={room.id} room={room} showCeiling={showCeiling} />
          ))}
          
          {/* Room labels at centroid */}
          {rooms.map((room, index) => {
            const center = deriveRoomCenter(room, index, rooms.length);
            return (
              <Html
                key={`label-${room.id}`}
                position={[center.cx, 1.2, center.cz]}
                center
                occlude="raycast"
                style={{ pointerEvents: 'none' }}
              >
                <div className="text-xs font-semibold text-muted-foreground whitespace-nowrap bg-background/60 px-1 rounded">{room.name}</div>
              </Html>
            );
          })}
          
          {/* Sensor Labels – skip sensors that already have a meter (rendered as DraggableMeter3D) */}
          {sensorPositions
            .filter((pos) => !floorMeters.some(m => m.sensor_uuid === pos.sensor_uuid))
            .map((pos) => {
              const sensor = sensors.find(s => s.id === pos.sensor_uuid);
              return (
                <Sensor3DLabel
                  key={pos.id}
                  position={pos}
                  value={sensor?.value}
                  unit={sensor?.unit}
                />
              );
            })}

          {/* Empty state hint */}
          {rooms.length === 0 && floorMeters.length === 0 && (
            <Html center position={[0, 1, 0]}>
              <div className="text-sm text-muted-foreground whitespace-nowrap">Keine Räume definiert</div>
            </Html>
          )}
        </>
      )}

      {/* Meter Labels - always shown regardless of model/procedural mode */}
      {floorMeters.map((meter, index) => {
        const room = meter.room_id ? rooms.find(r => r.id === meter.room_id) : null;
        const yPos = Math.max(0.5, (meter as any).position_3d_y ?? 2.5);
        const xPos = (meter as any).position_3d_x;
        const zPos = (meter as any).position_3d_z;

        let meterPos: [number, number, number];
        if (xPos != null && zPos != null) {
          // Explicit 3D position saved by user drag
          meterPos = [xPos, yPos, zPos];
        } else {
          // Derive initial 3D position from 2D floor_sensor_positions (same transform as room polygons)
          const sensorPos = meter.sensor_uuid
            ? sensorPositions.find(sp => sp.sensor_uuid === meter.sensor_uuid)
            : null;
          if (sensorPos) {
            const ROOM_SCALE = 0.3;
            const ROOM_OFFSET = 15;
            const sx = sensorPos.position_x * ROOM_SCALE - ROOM_OFFSET;
            const sz = sensorPos.position_y * ROOM_SCALE - ROOM_OFFSET;
            meterPos = [sx, yPos, sz];
          } else if (room) {
            meterPos = [room.position_x + 1, yPos, room.position_y];
          } else {
            meterPos = [(index - floorMeters.length / 2) * 3, yPos, -2];
          }
        }
        
        return (
          <DraggableMeter3D
            key={`meter-${meter.id}`}
            meter={meter}
            position={meterPos}
            latestValue={meterLatestValues[meter.id]?.value}
            latestUnit={meterLatestValues[meter.id]?.unit}
            isAdmin={isAdmin && !isWalking}
            onPositionChange={onMeterPositionChange}
            onDragStart={() => setIsDraggingMeter(true)}
            onDragEnd={() => setIsDraggingMeter(false)}
          />
        );
      })}
      
      {/* OrbitControls for readOnly/dashboard mode when not walking */}
      {readOnly && !isWalking && (
        <OrbitControls enablePan enableZoom enableRotate target={[0, 2, 0]} />
      )}

      {/* No OrbitControls for admin editing mode - allows meter dragging */}

      {/* First Person Controls - only render when walking to prevent unwanted pointer lock */}
      {isWalking && (
        <Floor3DControls 
          enabled={isWalking} 
          onLockChange={onLockChange}
          onMovingChange={onMovingChange}
        />
      )}

      {/* Camera tracker for minimap */}
      <CameraTracker onUpdate={onCameraUpdate} />
    </>
  );
}

export function FloorPlan3DViewer({ floor, locationId, sensors = [], isAdmin = false, compact = false, readOnly = false }: FloorPlan3DViewerProps) {
  const { rooms, loading: roomsLoading, refetch: refetchRooms } = useFloorRooms(floor.id);
  const { positions: sensorPositions, loading: positionsLoading } = useFloorSensorPositions(floor.id);
  const { meters, loading: metersLoading, updateMeter } = useMeters(locationId);
  const { readings, loading: readingsLoading } = useMeterReadings();
  const { updateFloor } = useFloors(locationId);
  
  const floorMeters = useMemo(() => {
    const placedSensorUuids = new Set(sensorPositions.map(p => p.sensor_uuid));
    return meters.filter(m => !m.is_archived && m.sensor_uuid && placedSensorUuids.has(m.sensor_uuid));
  }, [meters, sensorPositions]);

  // Get meter values: prefer live sensor data from integrations, fall back to meter_readings
  const meterLatestValues = useMemo(() => {
    const values: Record<string, { value: number | null; unit: string }> = {};
    floorMeters.forEach(m => {
      // Determine correct display unit for live/instantaneous values
      const isFlowType = m.energy_type === "wasser" || m.energy_type === "gas";
      const liveUnit = isFlowType ? "m³/h" : ((m as any).source_unit_power || "kW");

      // Try live sensor value first (matched via sensor_uuid)
      const liveSensor = m.sensor_uuid ? sensors.find(s => s.id === m.sensor_uuid) : null;
      if (liveSensor && liveSensor.value !== undefined && liveSensor.value !== "") {
        const parsed = parseFloat(String(liveSensor.value).replace(",", "."));
        values[m.id] = { value: isNaN(parsed) ? null : parsed, unit: liveUnit };
      } else {
        // Fall back to latest meter reading
        const meterReadings = readings
          .filter(r => r.meter_id === m.id)
          .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
        values[m.id] = { value: meterReadings.length > 0 ? meterReadings[0].value : null, unit: m.unit };
      }
    });
    return values;
  }, [floorMeters, readings, sensors]);

  const [isWalking, setIsWalking] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [showRoomEditor, setShowRoomEditor] = useState(false);
  const [showCeiling, setShowCeiling] = useState(() => {
    const stored = localStorage.getItem(`floor3d_ceiling_${floor.id}`);
    return stored !== null ? stored === 'true' : false;
  });

  // Persist ceiling preference
  const handleCeilingToggle = useCallback(() => {
    setShowCeiling(prev => {
      const next = !prev;
      localStorage.setItem(`floor3d_ceiling_${floor.id}`, String(next));
      return next;
    });
  }, [floor.id]);
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 10 });
  const [cameraRotY, setCameraRotY] = useState(0);
  const [modelRotation, setModelRotation] = useState<number>(floor.model_3d_rotation ?? 0);
  const [showRotationControls, setShowRotationControls] = useState(false);
  const rotationSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCameraUpdate = useCallback((pos: { x: number; z: number }, rotY: number) => {
    setCameraPos(pos);
    setCameraRotY(rotY);
  }, []);

  const handleLockChange = useCallback((locked: boolean) => {
    setIsLocked(locked);
    if (!locked) {
      setIsWalking(false);
    }
  }, []);

  const startWalking = () => setIsWalking(true);
  const stopWalking = () => setIsWalking(false);

  // Prevent page scrolling while in walkthrough mode
  useEffect(() => {
    if (!isWalking) return;
    const prevent = (e: Event) => e.preventDefault();
    document.body.style.overflow = "hidden";
    document.addEventListener("wheel", prevent, { passive: false });
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("wheel", prevent);
      document.removeEventListener("touchmove", prevent);
    };
  }, [isWalking]);

  const handleRotationChange = useCallback((deg: number) => {
    setModelRotation(deg);
    // Debounce save to DB
    if (rotationSaveTimeout.current) clearTimeout(rotationSaveTimeout.current);
    rotationSaveTimeout.current = setTimeout(() => {
      updateFloor(floor.id, { model_3d_rotation: deg } as any);
    }, 500);
  }, [floor.id, updateFloor]);

  const meterSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMeterPositionChange = useCallback((meterId: string, x: number, y: number, z: number) => {
    // Debounce DB save to prevent re-renders on every interaction
    if (meterSaveTimeout.current) clearTimeout(meterSaveTimeout.current);
    meterSaveTimeout.current = setTimeout(() => {
      updateMeter(meterId, { position_3d_x: x, position_3d_y: y, position_3d_z: z } as any);
    }, 800);
  }, [updateMeter]);

  const loading = roomsLoading || positionsLoading;

  if (showRoomEditor) {
    return (
      <RoomEditor 
        floor={floor} 
        onClose={() => {
          setShowRoomEditor(false);
          refetchRooms();
        }} 
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full" style={compact ? { minHeight: 0 } : undefined}>
      {/* Controls Bar - hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between p-3 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowRoomEditor(true)}
                disabled={isWalking}
              >
                <Edit className="h-4 w-4 mr-2" />
                Räume bearbeiten
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {rooms.length} Räume | {sensorPositions.length} Sensoren | {floorMeters.length} Messpunkte
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {!floor.model_3d_url && (
              <Button
                variant={showCeiling ? "outline" : "default"}
                size="sm"
                onClick={handleCeilingToggle}
                disabled={isWalking}
              >
                {showCeiling ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {showCeiling ? "Decke ausblenden" : "Decke einblenden"}
              </Button>
            )}
            {floor.model_3d_url && isAdmin && (
              <Button
                variant={showRotationControls ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRotationControls(!showRotationControls)}
                disabled={isWalking}
              >
                <RotateCw className="h-4 w-4 mr-2" />
                Rotation
              </Button>
            )}
            {!isWalking ? (
              <Button onClick={startWalking} disabled={loading}>
                <Play className="h-4 w-4 mr-2" />
                Begehung starten
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopWalking}>
                <Square className="h-4 w-4 mr-2" />
                Beenden
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Rotation controls bar */}
      {showRotationControls && !isWalking && (
        <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/30 flex-shrink-0">
          <RotateCw className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground flex-shrink-0">Rotation:</span>
          <Slider
            value={[modelRotation]}
            onValueChange={(v) => handleRotationChange(v[0])}
            min={0}
            max={360}
            step={15}
            className="flex-1 max-w-xs"
          />
          <span className="text-sm font-mono text-muted-foreground w-10 text-right flex-shrink-0">
            {modelRotation}°
          </span>
          <div className="flex gap-1 flex-shrink-0">
            {[0, 90, 180, 270].map((deg) => (
              <Button
                key={deg}
                type="button"
                variant={modelRotation === deg ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => handleRotationChange(deg)}
              >
                {deg}°
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Status bar when walking */}
      {isWalking && !compact && (
        <div className={`bg-primary/10 border-b px-3 py-2 text-sm text-center flex-shrink-0 transition-opacity duration-300 ${isMoving ? "opacity-0" : "opacity-100"}`}>
          <span className="font-medium">
            {isLocked 
              ? "WASD = Bewegen | Leertaste = Hoch | Shift = Runter | Mausrad = Höhe | ESC = Beenden" 
              : "Klicken Sie in das 3D-Fenster, um die Steuerung zu aktivieren"}
          </span>
        </div>
      )}

      {/* 3D Canvas */}
      <div className="flex-1 relative bg-gradient-to-b from-muted/30 to-muted/60" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
          <Canvas3DErrorBoundary>
            <Canvas
              shadows
              camera={{ 
                position: readOnly ? [15, 20, 15] : [0, 1.7, 10], 
                fov: readOnly ? 50 : 75,
                near: 0.1,
                far: 1000,
              }}
              style={{ width: "100%", height: "100%", cursor: isWalking && isLocked ? "none" : "grab" }}
              onCreated={({ gl }) => {
                gl.getContext().canvas.addEventListener("webglcontextlost", (e) => {
                  console.error("WebGL context lost", e);
                });
              }}
            >
                <Scene 
                  floor={floor}
                  rooms={rooms}
                  sensorPositions={sensorPositions}
                  sensors={sensors}
                  floorMeters={floorMeters}
                  meterLatestValues={meterLatestValues}
                  isWalking={isWalking}
                  rotationDeg={modelRotation}
                  isAdmin={readOnly ? false : isAdmin}
                  readOnly={readOnly}
                  showCeiling={showCeiling}
                  onMeterPositionChange={handleMeterPositionChange}
                  onLockChange={handleLockChange}
                  onMovingChange={setIsMoving}
                  onCameraUpdate={handleCameraUpdate}
                />
            </Canvas>
          </Canvas3DErrorBoundary>

            {/* Floating buttons for compact/readOnly mode */}
            {compact && !isWalking && (
              <div className="absolute bottom-3 left-3 z-10 flex gap-2">
                <Button
                  size="sm"
                  className="shadow-lg"
                  onClick={startWalking}
                  disabled={loading}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Begehung
                </Button>
                {!floor.model_3d_url && (
                  <Button
                    size="sm"
                    variant={showCeiling ? "secondary" : "default"}
                    className="shadow-lg"
                    onClick={handleCeilingToggle}
                  >
                    {showCeiling ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                    Decke
                  </Button>
                )}
              </div>
            )}
            {compact && isWalking && (
              <Button
                size="sm"
                variant="destructive"
                className="absolute bottom-3 left-3 z-10 shadow-lg"
                onClick={stopWalking}
              >
                <Square className="h-4 w-4 mr-1" />
                Beenden
              </Button>
            )}

            {/* Status bar when walking */}
            {isWalking && compact && (
              <div className={`absolute top-0 left-0 right-0 bg-primary/10 backdrop-blur-sm px-3 py-2 text-sm text-center z-10 transition-opacity duration-300 ${isMoving ? "opacity-0" : "opacity-100"}`}>
                <span className="font-medium">
                  {isLocked 
                    ? "WASD = Bewegen | Leertaste = Hoch | Shift = Runter | Mausrad = Höhe | ESC = Beenden" 
                    : "Klicken Sie in das 3D-Fenster, um die Steuerung zu aktivieren"}
                </span>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
