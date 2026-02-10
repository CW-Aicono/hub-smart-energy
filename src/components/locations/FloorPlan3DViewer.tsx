import { Suspense, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment, Grid, OrbitControls, Text, useGLTF } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Play, Square, Edit, Loader2 } from "lucide-react";
import { Floor } from "@/hooks/useFloors";
import { FloorRoom, useFloorRooms } from "@/hooks/useFloorRooms";
import { FloorSensorPosition, useFloorSensorPositions } from "@/hooks/useFloorSensorPositions";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { Room3D } from "./Room3D";
import { Floor3DControls } from "./Floor3DControls";
import { Sensor3DLabel } from "./Sensor3DLabel";
import { Meter3DLabel } from "./Meter3DLabel";
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
}

// Tracks camera position for minimap
function CameraTracker({ onUpdate }: { onUpdate: (pos: { x: number; z: number }, rotY: number) => void }) {
  useFrame(({ camera }) => {
    onUpdate({ x: camera.position.x, z: camera.position.z }, camera.rotation.y);
  });
  return null;
}

// Centers, grounds and auto-scales a 3D object to fit the scene
function centerAndGroundObject(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
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

        // Auto-detect Z-up coordinate system (CAD exports) if no manual rotation set
        const tempBox = new THREE.Box3().setFromObject(obj);
        const tempSize = tempBox.getSize(new THREE.Vector3());
        
        if (tempSize.z > tempSize.y * 1.5) {
          // Z-up to Y-up conversion
          obj.rotation.x = -Math.PI / 2;
          obj.updateMatrixWorld(true);
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

// Renders uploaded 3D model (GLB, OBJ+MTL, or 3DS) with optional manual rotation
function ModelViewer({ floor }: { floor: Floor }) {
  if (!floor.model_3d_url) return null;

  const url = floor.model_3d_url;
  const pathOnly = url.split("?")[0].toLowerCase();
  const manualRotation = floor.model_3d_rotation;

  // Apply manual Y-axis rotation (degrees to radians)
  const rotationY = manualRotation != null ? (manualRotation * Math.PI) / 180 : 0;

  let modelElement: JSX.Element;

  if (pathOnly.endsWith(".glb")) {
    modelElement = <GLBModel url={url} />;
  } else if (pathOnly.endsWith(".3ds")) {
    modelElement = <TDSModel url={url} />;
  } else {
    modelElement = <OBJModel objUrl={url} mtlUrl={floor.model_3d_mtl_url} />;
  }

  return (
    <group rotation={[0, rotationY, 0]}>
      {modelElement}
    </group>
  );
}

function Scene({ 
  floor,
  rooms, 
  sensorPositions, 
  sensors,
  floorMeters,
  meterLatestValues,
  isWalking,
  onLockChange,
  onCameraUpdate,
}: { 
  floor: Floor;
  rooms: FloorRoom[];
  sensorPositions: FloorSensorPosition[];
  sensors: Sensor[];
  floorMeters: Meter[];
  meterLatestValues: Record<string, number | null>;
  isWalking: boolean;
  onLockChange: (locked: boolean) => void;
  onCameraUpdate: (pos: { x: number; z: number }, rotY: number) => void;
}) {
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
        <ModelViewer floor={floor} />
      ) : (
        <>
          {/* Rooms */}
          {rooms.map((room) => (
            <Room3D key={room.id} room={room} />
          ))}
          
          {/* Room labels */}
          {rooms.map((room) => (
            <Text
              key={`label-${room.id}`}
              position={[room.position_x, 0.1, room.position_y]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.5}
              color="#374151"
              anchorX="center"
              anchorY="middle"
            >
              {room.name}
            </Text>
          ))}
          
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
        const meterPos: [number, number, number] = room
          ? [room.position_x + 1, 2.5, room.position_y]
          : [(index - floorMeters.length / 2) * 3, 2.5, -2];
        
        return (
          <Meter3DLabel
            key={`meter-${meter.id}`}
            meter={meter}
            position={meterPos}
            latestValue={meterLatestValues[meter.id]}
          />
        );
      })}
      
      {/* Orbit Controls for normal viewing (not walking) */}
      {!isWalking && (
        <OrbitControls 
          makeDefault
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2}
          minDistance={2}
          maxDistance={100}
        />
      )}

      {/* First Person Controls */}
      <Floor3DControls 
        enabled={isWalking} 
        onLockChange={onLockChange}
      />

      {/* Camera tracker for minimap */}
      <CameraTracker onUpdate={onCameraUpdate} />
    </>
  );
}

export function FloorPlan3DViewer({ floor, locationId, sensors = [], isAdmin = false, compact = false }: FloorPlan3DViewerProps) {
  const { rooms, loading: roomsLoading, refetch: refetchRooms } = useFloorRooms(floor.id);
  const { positions: sensorPositions, loading: positionsLoading } = useFloorSensorPositions(floor.id);
  const { meters, loading: metersLoading } = useMeters(locationId);
  const { readings, loading: readingsLoading } = useMeterReadings();
  
  // Filter meters: assigned to this floor OR unassigned (show all location meters)
  const floorMeters = useMemo(() => 
    meters.filter(m => !m.is_archived && (m.floor_id === floor.id || !m.floor_id)),
    [meters, floor.id]
  );

  // Get latest reading value per meter
  const meterLatestValues = useMemo(() => {
    const values: Record<string, number | null> = {};
    floorMeters.forEach(m => {
      const meterReadings = readings
        .filter(r => r.meter_id === m.id)
        .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
      values[m.id] = meterReadings.length > 0 ? meterReadings[0].value : null;
    });
    return values;
  }, [floorMeters, readings]);

  const [isWalking, setIsWalking] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showRoomEditor, setShowRoomEditor] = useState(false);
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 10 });
  const [cameraRotY, setCameraRotY] = useState(0);

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

      {/* Status bar when walking */}
      {isWalking && (
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
                position: [0, 1.7, 10], 
                fov: 75,
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
                  onLockChange={handleLockChange}
                  onCameraUpdate={handleCameraUpdate}
                />
              </Suspense>
            </Canvas>

            {/* Minimap overlay */}
            {rooms.length > 0 && (
              <Minimap3D
                rooms={rooms}
                cameraPosition={cameraPos}
                cameraRotation={cameraRotY}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
