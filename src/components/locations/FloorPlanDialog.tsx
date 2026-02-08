import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Trash2, GripVertical, Activity, AlertCircle, Image, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Floor } from "@/hooks/useFloors";
import { useFloorSensorPositions, FloorSensorPosition, FloorSensorPositionInsert } from "@/hooks/useFloorSensorPositions";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Sensor {
  id: string;
  name: string;
  type: string;
  controlType?: string;
  room: string;
  category: string;
  value: string;
  unit: string;
  status: "online" | "offline" | "warning";
}

interface FloorPlanDialogProps {
  floor: Floor;
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FloorPlanDialog({ floor, locationId, open, onOpenChange }: FloorPlanDialogProps) {
  const { isAdmin } = useUserRole();
  const { positions, loading: positionsLoading, addPosition, updatePosition, deletePosition } = useFloorSensorPositions(floor.id);
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(locationId);
  
  const [availableSensors, setAvailableSensors] = useState<(Sensor & { integrationId: string })[]>([]);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("view");
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Drag state
  const [draggingSensor, setDraggingSensor] = useState<(Sensor & { integrationId: string }) | null>(null);
  const [draggingPosition, setDraggingPosition] = useState<FloorSensorPosition | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch sensors from all integrations
  const fetchAllSensors = useCallback(async () => {
    if (!locationIntegrations.length) return;
    
    setLoadingSensors(true);
    setError(null);
    
    try {
      const allSensors: (Sensor & { integrationId: string })[] = [];
      
      for (const li of locationIntegrations) {
        if (!li.is_enabled) continue;
        
        try {
          const { data, error: fnError } = await supabase.functions.invoke("loxone-api", {
            body: {
              locationIntegrationId: li.id,
              action: "getSensors",
            },
          });

          if (fnError || !data?.success) {
            console.warn(`Failed to fetch sensors for integration ${li.id}:`, fnError || data?.error);
            continue;
          }

          const sensors = (data.sensors || []).map((s: Sensor) => ({
            ...s,
            integrationId: li.id,
          }));
          
          allSensors.push(...sensors);
        } catch (err) {
          console.warn(`Error fetching sensors for integration ${li.id}:`, err);
        }
      }
      
      setAvailableSensors(allSensors);
    } catch (err) {
      console.error("Failed to fetch sensors:", err);
      setError("Fehler beim Laden der Sensoren");
    } finally {
      setLoadingSensors(false);
    }
  }, [locationIntegrations]);

  useEffect(() => {
    if (open && locationIntegrations.length > 0 && isAdmin) {
      fetchAllSensors();
    }
  }, [open, locationIntegrations, fetchAllSensors, isAdmin]);

  // Filter out already placed sensors
  const unplacedSensors = availableSensors.filter(
    (sensor) => !positions.some((p) => p.sensor_uuid === sensor.id)
  );

  // Get position info for placed sensors
  const placedSensorsWithInfo = positions.map((pos) => {
    const sensor = availableSensors.find((s) => s.id === pos.sensor_uuid);
    return { ...pos, sensorInfo: sensor };
  });

  const calculatePosition = (e: React.DragEvent | React.MouseEvent) => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { 
      x: Math.max(0, Math.min(100, x)), 
      y: Math.max(0, Math.min(100, y)) 
    };
  };

  // Drag handlers for new sensors
  const handleDragStart = (e: React.DragEvent, sensor: Sensor & { integrationId: string }) => {
    setDraggingSensor(sensor);
    setDraggingPosition(null);
    e.dataTransfer.effectAllowed = "copy";
  };

  // Drag handlers for existing positioned sensors
  const handlePositionDragStart = (e: React.DragEvent, position: FloorSensorPosition) => {
    if (!isAdmin) return;
    e.stopPropagation();
    setDraggingPosition(position);
    setDraggingSensor(null);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingPosition ? "move" : "copy";
    const pos = calculatePosition(e);
    if (pos) setDragPreview(pos);
  };

  const handleDragLeave = () => {
    setDragPreview(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    const pos = calculatePosition(e);
    if (!pos) {
      resetDragState();
      return;
    }

    // Moving existing sensor
    if (draggingPosition) {
      const { error } = await updatePosition(draggingPosition.id, {
        position_x: pos.x,
        position_y: pos.y,
      });
      
      if (error) {
        toast.error("Fehler beim Verschieben des Sensors");
        console.error("Failed to update position:", error);
      } else {
        toast.success(`${draggingPosition.sensor_name} verschoben`);
      }
      resetDragState();
      return;
    }

    // Adding new sensor
    if (draggingSensor) {
      const positionData: FloorSensorPositionInsert = {
        floor_id: floor.id,
        location_integration_id: draggingSensor.integrationId,
        sensor_uuid: draggingSensor.id,
        sensor_name: draggingSensor.name,
        position_x: pos.x,
        position_y: pos.y,
      };

      const { error } = await addPosition(positionData);
      
      if (error) {
        toast.error("Fehler beim Platzieren des Sensors");
        console.error("Failed to add position:", error);
      } else {
        toast.success(`${draggingSensor.name} platziert`);
      }
    }

    resetDragState();
  };

  const resetDragState = () => {
    setDraggingSensor(null);
    setDraggingPosition(null);
    setDragPreview(null);
  };

  const handleRemoveSensor = async (positionId: string, sensorName: string) => {
    const { error } = await deletePosition(positionId);
    
    if (error) {
      toast.error("Fehler beim Entfernen des Sensors");
      console.error("Failed to remove position:", error);
    } else {
      toast.success(`${sensorName} entfernt`);
    }
  };

  const loading = positionsLoading || integrationsLoading || loadingSensors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isFullscreen ? "max-w-[95vw] max-h-[95vh]" : "max-w-5xl max-h-[85vh]"} overflow-hidden flex flex-col`}>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                {floor.name} – Grundriss
              </DialogTitle>
              <DialogDescription>
                {isAdmin ? "Zeigen Sie den Grundriss an oder platzieren Sie Messgeräte" : "Grundrissansicht"}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="flex-shrink-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="flex-shrink-0 w-fit">
              <TabsTrigger value="view" className="gap-2">
                <Image className="h-4 w-4" />
                Ansicht
              </TabsTrigger>
              <TabsTrigger value="edit" className="gap-2">
                <MapPin className="h-4 w-4" />
                Messgeräte bearbeiten
              </TabsTrigger>
            </TabsList>

            <TabsContent value="view" className="flex-1 overflow-auto m-0 mt-4">
              <FloorPlanView 
                floor={floor}
                positions={placedSensorsWithInfo}
                isFullscreen={isFullscreen}
              />
            </TabsContent>

            <TabsContent value="edit" className="flex-1 overflow-hidden m-0 mt-4">
              <div className="flex gap-4 h-full">
                {/* Sensor List */}
                <div className="w-56 flex-shrink-0 border rounded-lg bg-muted/30 flex flex-col">
                  <div className="p-3 border-b bg-muted/50">
                    <h3 className="font-medium text-sm">Verfügbare Sensoren</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {unplacedSensors.length} von {availableSensors.length}
                    </p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : unplacedSensors.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          {availableSensors.length === 0 
                            ? "Keine Sensoren verfügbar" 
                            : "Alle platziert ✓"}
                        </p>
                      ) : (
                        unplacedSensors.map((sensor) => (
                          <div
                            key={sensor.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, sensor)}
                            className="flex items-center gap-2 p-2 rounded-md bg-card border cursor-grab hover:bg-accent transition-colors active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{sensor.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{sensor.room}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Floor Plan Editor */}
                <div 
                  ref={containerRef}
                  className="flex-1 relative border rounded-lg overflow-hidden bg-muted/20"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <img
                    ref={imageRef}
                    src={floor.floor_plan_url!}
                    alt={floor.name}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                  
                  {/* Placed Sensors */}
                  {placedSensorsWithInfo.map((placed) => (
                    <div
                      key={placed.id}
                      draggable
                      onDragStart={(e) => handlePositionDragStart(e, placed)}
                      className={`absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-grab active:cursor-grabbing ${
                        draggingPosition?.id === placed.id ? "opacity-50" : ""
                      }`}
                      style={{
                        left: `${placed.position_x}%`,
                        top: `${placed.position_y}%`,
                      }}
                    >
                      <div className="bg-card border-2 border-primary shadow-lg rounded-lg px-2 py-1 min-w-[90px] text-center">
                        <p className="text-xs font-medium truncate">{placed.sensor_name}</p>
                        {placed.sensorInfo && (
                          <p className="text-sm font-mono font-bold text-primary">
                            {placed.sensorInfo.value} {placed.sensorInfo.unit}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSensor(placed.id, placed.sensor_name);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* Drag Preview */}
                  {dragPreview && (draggingSensor || draggingPosition) && (
                    <div
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{
                        left: `${dragPreview.x}%`,
                        top: `${dragPreview.y}%`,
                      }}
                    >
                      <div className="bg-primary/20 border-2 border-primary border-dashed rounded-lg px-2 py-1 min-w-[90px] text-center">
                        <p className="text-xs font-medium">
                          {draggingSensor?.name || draggingPosition?.sensor_name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-auto">
            <FloorPlanView 
              floor={floor}
              positions={placedSensorsWithInfo}
              isFullscreen={isFullscreen}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Simple view component for floor plan with sensors
interface FloorPlanViewProps {
  floor: Floor;
  positions: (FloorSensorPosition & { sensorInfo?: Sensor })[];
  isFullscreen: boolean;
}

function FloorPlanView({ floor, positions, isFullscreen }: FloorPlanViewProps) {
  return (
    <div className="relative w-full h-full">
      <img
        src={floor.floor_plan_url!}
        alt={floor.name}
        className="w-full h-auto max-h-full object-contain"
      />
      
      {/* Sensor Overlays */}
      {positions.map((pos) => (
        <div
          key={pos.id}
          className="absolute transform -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${pos.position_x}%`,
            top: `${pos.position_y}%`,
          }}
        >
          <div className="bg-card/95 backdrop-blur-sm border shadow-lg rounded-lg px-2 py-1 min-w-[80px] text-center">
            <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">
              {pos.sensor_name}
            </p>
            <p className="text-sm font-mono font-bold text-primary">
              {pos.sensorInfo ? `${pos.sensorInfo.value} ${pos.sensorInfo.unit}` : "—"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
