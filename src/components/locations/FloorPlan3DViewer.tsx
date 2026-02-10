import { Suspense, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment, Grid, Text, useGLTF } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Play, Square, Edit, Loader2 } from "lucide-react";
import { Floor } from "@/hooks/useFloors";
import { FloorRoom, useFloorRooms } from "@/hooks/useFloorRooms";
import { FloorSensorPosition, useFloorSensorPositions } from "@/hooks/useFloorSensorPositions";
import { Room3D } from "./Room3D";
import { Floor3DControls } from "./Floor3DControls";
import { Sensor3DLabel } from "./Sensor3DLabel";
import { RoomEditor } from "./RoomEditor";
import { Minimap3D } from "./Minimap3D";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
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

// Renders a GLB model
function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone()} />;
}

// Renders an OBJ model with optional MTL
function OBJModel({ objUrl, mtlUrl }: { objUrl: string; mtlUrl?: string | null }) {
  const [object, setObject] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loadModel = async () => {
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

      if (!mtlUrl) {
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
          }
        });
      }

      setObject(obj);
    };
    loadModel();
  }, [objUrl, mtlUrl]);

  if (!object) return null;
  return <primitive object={object} />;
}

// Renders uploaded 3D model (GLB or OBJ+MTL)
function ModelViewer({ floor }: { floor: Floor }) {
  if (!floor.model_3d_url) return null;

  const url = floor.model_3d_url;
  const isGlb = url.toLowerCase().endsWith(".glb");

  if (isGlb) {
    return <GLBModel url={url} />;
  }

  return <OBJModel objUrl={url} mtlUrl={floor.model_3d_mtl_url} />;
}

function Scene({ 
  floor,
  rooms, 
  sensorPositions, 
  sensors,
  isWalking,
  onLockChange,
  onCameraUpdate,
}: { 
  floor: Floor;
  rooms: FloorRoom[];
  sensorPositions: FloorSensorPosition[];
  sensors: Sensor[];
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
          {rooms.length === 0 && (
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
              {rooms.length} Räume | {sensorPositions.length} Sensoren
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
