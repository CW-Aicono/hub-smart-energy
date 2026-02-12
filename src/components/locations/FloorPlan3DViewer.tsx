import { Suspense, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment, Grid, OrbitControls, Text, useGLTF } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Square, Edit, Loader2, RotateCw } from "lucide-react";
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

// Tracks camera position for minimap
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

// Renders a GLB model
function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    // Remove any cameras embedded in the model
    const toRemove: THREE.Object3D[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Camera) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => obj.removeFromParent());
    // Center and ground the model
    centerAndGroundObject(clone);
    return clone;
  }, [scene]);
  return <primitive object={cloned} />;
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
      <Text position={[0, 1, 0]} fontSize={0.3} color="#ef4444" anchorX="center" anchorY="middle">
        Fehler beim Laden des 3D-Modells
      </Text>
    );
  }

  if (loading || !object) {
    return (
      <Text position={[0, 1, 0]} fontSize={0.3} color="#6b7280" anchorX="center" anchorY="middle">
        3D-Modell wird geladen...
      </Text>
    );
  }

  return <primitive object={object} />;
}

// Renders a 3DS model
function TDSModel({ url }: { url: string }) {
  const [object, setObject] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new TDSLoader();
    loader.loadAsync(url).then((obj) => {
      centerAndGroundObject(obj);
      setObject(obj);
    });
  }, [url]);

  if (!object) return null;
  return <primitive object={object} />;
}

// Wraps a model, applies X-axis rotation, then re-grounds so bottom sits at Y=0
function RotatedModelGroup({ rotationDeg, children }: { rotationDeg: number; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const rotationX = (rotationDeg * Math.PI) / 180;

  // Idempotent: reset position, measure, correct every frame
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.set(rotationX, 0, 0);
    groupRef.current.position.y = 0;
    groupRef.current.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(groupRef.current);
    if (box.isEmpty()) return;

    groupRef.current.position.y = -box.min.y;
  });

  return (
    <group ref={groupRef}>
      {children}
    </group>
  );
}

// Renders uploaded 3D model (GLB, OBJ+MTL, or 3DS) with optional manual rotation
function ModelViewer({ floor, rotationDeg }: { floor: Floor; rotationDeg: number }) {
  if (!floor.model_3d_url) return null;

  const url = floor.model_3d_url;
  const pathOnly = url.split("?")[0].toLowerCase();

  let modelElement: JSX.Element;

  if (pathOnly.endsWith(".glb")) {
    modelElement = <GLBModel url={url} />;
  } else if (pathOnly.endsWith(".3ds")) {
    modelElement = <TDSModel url={url} />;
  } else {
    modelElement = <OBJModel objUrl={url} mtlUrl={floor.model_3d_mtl_url} />;
  }

  return (
    <RotatedModelGroup rotationDeg={rotationDeg}>
      {modelElement}
    </RotatedModelGroup>
  );
}

/**
 * Derive 3D room position and size from polygon_points when the room uses default position (0,0).
 * Polygon coords are in percentage (0-100) of the floor plan image; we scale them to world units.
 */
function deriveRoomPosition(room: FloorRoom, index: number, totalRooms: number): FloorRoom {
  const hasDefaultPos = room.position_x === 0 && room.position_y === 0;
  const pts = room.polygon_points;

  if (hasDefaultPos && pts && Array.isArray(pts) && pts.length >= 3) {
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Scale percentage coords to world units (100% ≈ 30 units)
    const scale = 0.3;
    const cx = ((minX + maxX) / 2) * scale - 15; // center around 0
    const cy = ((minY + maxY) / 2) * scale - 15;
    const w = Math.max(2, (maxX - minX) * scale);
    const d = Math.max(2, (maxY - minY) * scale);

    return { ...room, position_x: cx, position_y: cy, width: w, depth: d };
  }

  // If still default and no polygon, spread rooms so they don't overlap
  if (hasDefaultPos && totalRooms > 1) {
    const spacing = 5;
    const cols = Math.ceil(Math.sqrt(totalRooms));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { ...room, position_x: col * spacing, position_y: row * spacing };
  }

  return room;
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
  onMeterPositionChange,
  onLockChange,
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
  onMeterPositionChange: (meterId: string, x: number, y: number, z: number) => void;
  onLockChange: (locked: boolean) => void;
  onCameraUpdate: (pos: { x: number; z: number }, rotY: number) => void;
}) {
  const [isDraggingMeter, setIsDraggingMeter] = useState(false);
  // Calculate scene bounds based on rooms
  const sceneBounds = useMemo(() => {
    if (rooms.length === 0) {
      return { minX: -10, maxX: 10, minZ: -10, maxZ: 10, centerX: 0, centerZ: 0 };
    }
    
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    
    rooms.forEach(room => {
      const left = room.position_x - room.width / 2;
      const right = room.position_x + room.width / 2;
      const back = room.position_y - room.depth / 2;
      const front = room.position_y + room.depth / 2;
      
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minZ = Math.min(minZ, back);
      maxZ = Math.max(maxZ, front);
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
      
      {/* Environment for reflections */}
      <Environment preset="apartment" />
      
      {/* Ground grid */}
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
        position={[sceneBounds.centerX, -0.01, sceneBounds.centerZ]}
      />
      
      {/* 3D Model or procedural rooms */}
      {floor.model_3d_url ? (
        <ModelViewer floor={floor} rotationDeg={rotationDeg} />
      ) : (
        <>
          {/* Rooms - derive position from polygon_points when available */}
          {rooms.map((room, index) => {
            const derivedRoom = deriveRoomPosition(room, index, rooms.length);
            return <Room3D key={room.id} room={derivedRoom} />;
          })}
          
          {/* Room labels */}
          {rooms.map((room, index) => {
            const derivedRoom = deriveRoomPosition(room, index, rooms.length);
            return (
              <Text
                key={`label-${room.id}`}
                position={[derivedRoom.position_x, 0.1, derivedRoom.position_y]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.5}
                color="#374151"
                anchorX="center"
                anchorY="middle"
              >
                {room.name}
              </Text>
            );
          })}
          
          {/* Sensor Labels */}
          {sensorPositions.map((pos) => {
            const sensor = sensors.find(s => s.id === pos.sensor_uuid);
            return (
              <Sensor3DLabel
                key={pos.id}
                position={pos}
                value={sensor?.value}
                unit={sensor?.unit}
                scaleX={0.2}
                scaleZ={0.2}
                offsetX={sceneBounds.centerX}
                offsetZ={sceneBounds.centerZ}
              />
            );
          })}

          {/* Empty state hint */}
          {rooms.length === 0 && floorMeters.length === 0 && (
            <Text
              position={[0, 1, 0]}
              fontSize={0.3}
              color="#6b7280"
              anchorX="center"
              anchorY="middle"
            >
              Keine Räume definiert
            </Text>
          )}
        </>
      )}

      {/* Meter Labels - always shown regardless of model/procedural mode */}
      {floorMeters.map((meter, index) => {
        const room = meter.room_id ? rooms.find(r => r.id === meter.room_id) : null;
        const yPos = Math.max(0.5, (meter as any).position_3d_y ?? 2.5);
        const xPos = (meter as any).position_3d_x;
        const zPos = (meter as any).position_3d_z;
        const meterPos: [number, number, number] = (xPos != null && zPos != null)
          ? [xPos, yPos, zPos]
          : room
            ? [room.position_x + 1, yPos, room.position_y]
            : [(index - floorMeters.length / 2) * 3, yPos, -2];
        
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
  
  // Filter meters: only show meters that have been explicitly placed as sensor positions on this floor
  const floorMeters = useMemo(() => {
    const placedSensorUuids = new Set(sensorPositions.map(p => p.sensor_uuid));
    return meters.filter(m => !m.is_archived && (m.floor_id === floor.id || m.floor_id === null) && m.sensor_uuid && placedSensorUuids.has(m.sensor_uuid));
  }, [meters, floor.id, sensorPositions]);

  // Get meter values: prefer live sensor data from integrations, fall back to meter_readings
  const meterLatestValues = useMemo(() => {
    const values: Record<string, { value: number | null; unit: string }> = {};
    floorMeters.forEach(m => {
      // Try live sensor value first (matched via sensor_uuid)
      const liveSensor = m.sensor_uuid ? sensors.find(s => s.id === m.sensor_uuid) : null;
      if (liveSensor && liveSensor.value !== undefined && liveSensor.value !== "") {
        const parsed = parseFloat(String(liveSensor.value).replace(",", "."));
        values[m.id] = { value: isNaN(parsed) ? null : parsed, unit: liveSensor.unit || m.unit };
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
  const [showRoomEditor, setShowRoomEditor] = useState(false);
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

  const loading = roomsLoading || positionsLoading || metersLoading;

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
    <div className="flex flex-col h-full">
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
        <div className="bg-primary/10 border-b px-3 py-2 text-sm text-center flex-shrink-0">
          <span className="font-medium">
            {isLocked 
              ? "WASD = Bewegen | Leertaste = Hoch | Shift = Runter | Mausrad = Höhe | ESC = Beenden" 
              : "Klicken Sie in das 3D-Fenster, um die Steuerung zu aktivieren"}
          </span>
        </div>
      )}

      {/* 3D Canvas */}
      <div className="flex-1 relative min-h-0 bg-gradient-to-b from-muted/30 to-muted/60">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Canvas
              shadows
              camera={{ 
                position: readOnly ? [15, 20, 15] : [0, 1.7, 10], 
                fov: readOnly ? 50 : 75,
                near: 0.1,
                far: 1000,
              }}
              style={{ cursor: isWalking && isLocked ? "none" : "grab" }}
            >
              <Suspense fallback={null}>
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
                  onMeterPositionChange={handleMeterPositionChange}
                  onLockChange={handleLockChange}
                  onCameraUpdate={handleCameraUpdate}
                />
              </Suspense>
            </Canvas>

            {/* Floating walkthrough button for compact/readOnly mode */}
            {compact && !isWalking && (
              <Button
                size="sm"
                className="absolute bottom-3 left-3 z-10 shadow-lg"
                onClick={startWalking}
                disabled={loading}
              >
                <Play className="h-4 w-4 mr-1" />
                Begehung
              </Button>
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
              <div className="absolute top-0 left-0 right-0 bg-primary/10 backdrop-blur-sm px-3 py-2 text-sm text-center z-10">
                <span className="font-medium">
                  {isLocked 
                    ? "WASD = Bewegen | Leertaste = Hoch | Shift = Runter | Mausrad = Höhe | ESC = Beenden" 
                    : "Klicken Sie in das 3D-Fenster, um die Steuerung zu aktivieren"}
                </span>
              </div>
            )}

            {/* Minimap removed – not needed in location detail view */}
          </>
        )}
      </div>
    </div>
  );
}
