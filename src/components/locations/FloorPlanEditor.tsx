import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Trash2, GripVertical, Activity, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Floor } from "@/hooks/useFloors";
import { useFloorSensorPositions, FloorSensorPosition, FloorSensorPositionInsert } from "@/hooks/useFloorSensorPositions";
import { useLocationIntegrations, LocationIntegration } from "@/hooks/useIntegrations";
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

interface FloorPlanEditorProps {
  floor: Floor;
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FloorPlanEditor({ floor, locationId, open, onOpenChange }: FloorPlanEditorProps) {
  const { positions, loading: positionsLoading, addPosition, deletePosition } = useFloorSensorPositions(floor.id);
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(locationId);
  
  const [availableSensors, setAvailableSensors] = useState<(Sensor & { integrationId: string })[]>([]);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingSensor, setDraggingSensor] = useState<(Sensor & { integrationId: string }) | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  
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
    if (open && locationIntegrations.length > 0) {
      fetchAllSensors();
    }
  }, [open, locationIntegrations, fetchAllSensors]);

  // Filter out already placed sensors
  const unplacedSensors = availableSensors.filter(
    (sensor) => !positions.some((p) => p.sensor_uuid === sensor.id)
  );

  // Get position info for placed sensors
  const placedSensorsWithInfo = positions.map((pos) => {
    const sensor = availableSensors.find((s) => s.id === pos.sensor_uuid);
    return { ...pos, sensorInfo: sensor };
  });

  const handleDragStart = (e: React.DragEvent, sensor: Sensor & { integrationId: string }) => {
    setDraggingSensor(sensor);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    
    if (containerRef.current && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setDragPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
    }
  };

  const handleDragLeave = () => {
    setDragPosition(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggingSensor || !imageRef.current) {
      setDraggingSensor(null);
      setDragPosition(null);
      return;
    }

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const positionData: FloorSensorPositionInsert = {
      floor_id: floor.id,
      location_integration_id: draggingSensor.integrationId,
      sensor_uuid: draggingSensor.id,
      sensor_name: draggingSensor.name,
      position_x: Math.max(0, Math.min(100, x)),
      position_y: Math.max(0, Math.min(100, y)),
    };

    const { error } = await addPosition(positionData);
    
    if (error) {
      toast.error("Fehler beim Platzieren des Sensors");
      console.error("Failed to add position:", error);
    } else {
      toast.success(`${draggingSensor.name} platziert`);
    }

    setDraggingSensor(null);
    setDragPosition(null);
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Messgeräte platzieren – {floor.name}</DialogTitle>
          <DialogDescription>
            Ziehen Sie Sensoren aus der Liste auf den Grundriss, um sie zu positionieren
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-4 flex-1 overflow-hidden">
          {/* Sensor List */}
          <div className="w-64 flex-shrink-0 border rounded-lg bg-muted/30">
            <div className="p-3 border-b bg-muted/50">
              <h3 className="font-medium text-sm">Verfügbare Sensoren</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {unplacedSensors.length} von {availableSensors.length} verfügbar
              </p>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="p-2 space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : unplacedSensors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {availableSensors.length === 0 
                      ? "Keine Sensoren verfügbar" 
                      : "Alle Sensoren wurden platziert"}
                  </p>
                ) : (
                  unplacedSensors.map((sensor) => (
                    <div
                      key={sensor.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, sensor)}
                      className="flex items-center gap-2 p-2 rounded-md bg-card border cursor-grab hover:bg-accent transition-colors"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sensor.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{sensor.room}</p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {sensor.value} {sensor.unit}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Floor Plan */}
          <div 
            ref={containerRef}
            className="flex-1 relative border rounded-lg overflow-hidden bg-muted/20"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {floor.floor_plan_url ? (
              <>
                <img
                  ref={imageRef}
                  src={floor.floor_plan_url}
                  alt={floor.name}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
                
                {/* Placed Sensors */}
                {placedSensorsWithInfo.map((placed) => (
                  <div
                    key={placed.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                    style={{
                      left: `${placed.position_x}%`,
                      top: `${placed.position_y}%`,
                    }}
                  >
                    <div className="bg-card border-2 border-primary shadow-lg rounded-lg px-2 py-1 min-w-[100px] text-center">
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
                      onClick={() => handleRemoveSensor(placed.id, placed.sensor_name)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                {/* Drag Preview */}
                {dragPosition && draggingSensor && (
                  <div
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      left: `${dragPosition.x}%`,
                      top: `${dragPosition.y}%`,
                    }}
                  >
                    <div className="bg-primary/20 border-2 border-primary border-dashed rounded-lg px-2 py-1 min-w-[100px] text-center">
                      <p className="text-xs font-medium">{draggingSensor.name}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Kein Grundriss hochgeladen</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>Fertig</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
