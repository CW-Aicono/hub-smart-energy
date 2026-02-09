import { Suspense, useState, useCallback, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, Text } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Play, Square, Edit, Loader2 } from "lucide-react";
import { Floor } from "@/hooks/useFloors";
import { FloorRoom, useFloorRooms } from "@/hooks/useFloorRooms";
import { FloorSensorPosition, useFloorSensorPositions } from "@/hooks/useFloorSensorPositions";
import { Room3D } from "./Room3D";
import { Floor3DControls } from "./Floor3DControls";
import { Sensor3DLabel } from "./Sensor3DLabel";
import { RoomEditor } from "./RoomEditor";

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
}

function Scene({ 
  rooms, 
  sensorPositions, 
  sensors,
  isWalking,
  onLockChange,
}: { 
  rooms: FloorRoom[];
  sensorPositions: FloorSensorPosition[];
  sensors: Sensor[];
  isWalking: boolean;
  onLockChange: (locked: boolean) => void;
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
      
      {/* First Person Controls */}
      <Floor3DControls 
        enabled={isWalking} 
        onLockChange={onLockChange}
      />
      
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
  );
}

export function FloorPlan3DViewer({ floor, locationId, sensors = [], isAdmin = false }: FloorPlan3DViewerProps) {
  const { rooms, loading: roomsLoading, refetch: refetchRooms } = useFloorRooms(floor.id);
  const { positions: sensorPositions, loading: positionsLoading } = useFloorSensorPositions(floor.id);
  
  const [isWalking, setIsWalking] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showRoomEditor, setShowRoomEditor] = useState(false);

  const handleLockChange = useCallback((locked: boolean) => {
    setIsLocked(locked);
    if (!locked) {
      setIsWalking(false);
    }
  }, []);

  const startWalking = () => {
    setIsWalking(true);
  };

  const stopWalking = () => {
    setIsWalking(false);
  };

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
      {/* Controls Bar */}
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

      {/* Status bar when walking */}
      {isWalking && (
        <div className="bg-primary/10 border-b px-3 py-2 text-sm text-center flex-shrink-0">
          <span className="font-medium">
            {isLocked 
              ? "WASD = Bewegen | Maus = Umsehen | ESC = Beenden" 
              : "Klicken Sie in das 3D-Fenster, um die Steuerung zu aktivieren"}
          </span>
        </div>
      )}

      {/* 3D Canvas */}
      <div className="flex-1 relative min-h-0 bg-gradient-to-b from-sky-100 to-sky-200 dark:from-slate-800 dark:to-slate-900">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
                rooms={rooms}
                sensorPositions={sensorPositions}
                sensors={sensors}
                isWalking={isWalking}
                onLockChange={handleLockChange}
              />
            </Suspense>
          </Canvas>
        )}
      </div>
    </div>
  );
}
