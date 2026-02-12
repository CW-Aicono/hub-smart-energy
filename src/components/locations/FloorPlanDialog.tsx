import { useState, useRef, useEffect, useCallback, lazy, Suspense, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Trash2, GripVertical, AlertCircle, Image, MapPin, Maximize2, Minimize2, Box, Gauge, DoorOpen, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { ENERGY_SENSOR_CLASSES } from "@/lib/energyTypeColors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Floor } from "@/hooks/useFloors";
import { useFloorSensorPositions, FloorSensorPosition, FloorSensorPositionInsert, LabelSize } from "@/hooks/useFloorSensorPositions";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useUserRole } from "@/hooks/useUserRole";
import { useMeters } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Lazy load 3D viewer and room editor for performance
const FloorPlan3DViewer = lazy(() => import("./FloorPlan3DViewer").then(m => ({ default: m.FloorPlan3DViewer })));

import { MeterOverlay2D } from "./MeterOverlay2D";
import { RoomOverlay2D } from "./RoomOverlay2D";
import { RoomPolygonEditor } from "./RoomPolygonEditor";
import { useFloorRooms } from "@/hooks/useFloorRooms";

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
  const { meters } = useMeters(locationId);
  const { readings } = useMeterReadings();
  const { rooms: floorRooms } = useFloorRooms(floor.id);

  // Only meters explicitly assigned to this floor
  const floorMeters = useMemo(() => 
    meters.filter(m => !m.is_archived && m.floor_id === floor.id),
    [meters, floor.id]
  );

  // Only meters that have a sensor position placed on the floor plan
  const placedFloorMeters = useMemo(() => {
    const placedUuids = new Set(positions.map(p => p.sensor_uuid));
    return floorMeters.filter(m => m.sensor_uuid && placedUuids.has(m.sensor_uuid));
  }, [floorMeters, positions]);

  // Latest reading per meter
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

  const energyTypeColors = ENERGY_SENSOR_CLASSES;

  // Point-in-polygon test (ray casting) for auto-assigning sensors to rooms
  const findRoomAtPosition = useCallback((px: number, py: number): string | null => {
    for (const room of floorRooms) {
      const pts = room.polygon_points;
      if (!pts || !Array.isArray(pts) || pts.length < 3) continue;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      if (inside) return room.id;
    }
    return null;
  }, [floorRooms]);
  
  const [availableSensors, setAvailableSensors] = useState<(Sensor & { integrationId: string })[]>([]);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("view");
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Drag state
  const [draggingSensor, setDraggingSensor] = useState<(Sensor & { integrationId: string }) | null>(null);
  const [draggingPosition, setDraggingPosition] = useState<FloorSensorPosition | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);

  // Resize state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartRef = useRef<{ startX: number; startScale: number } | null>(null);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const viewImageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const editOverlayRef = useRef<HTMLDivElement>(null);
  const [viewOverlayStyle, setViewOverlayStyle] = useState<React.CSSProperties>({ position: 'absolute', inset: 0 });
  const [editOverlayStyle, setEditOverlayStyle] = useState<React.CSSProperties>({ position: 'absolute', inset: 0 });

  // Generic overlay calculator for object-contain images
  const calcOverlayStyle = useCallback((img: HTMLImageElement | null): React.CSSProperties | null => {
    if (!img || !img.naturalWidth) return null;
    const container = img.parentElement;
    if (!container) return null;
    const cr = container.getBoundingClientRect();
    if (cr.width === 0 || cr.height === 0) return null;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const cRatio = cr.width / cr.height;
    let w: number, h: number, ox: number, oy: number;
    if (imgRatio > cRatio) {
      w = cr.width; h = cr.width / imgRatio; ox = 0; oy = (cr.height - h) / 2;
    } else {
      h = cr.height; w = cr.height * imgRatio; ox = (cr.width - w) / 2; oy = 0;
    }
    return { position: 'absolute', left: `${ox}px`, top: `${oy}px`, width: `${w}px`, height: `${h}px` };
  }, []);

  // Calculate overlay position to match object-contain image
  const updateViewOverlay = useCallback(() => {
    const style = calcOverlayStyle(viewImageRef.current);
    if (style) setViewOverlayStyle(style);
  }, [calcOverlayStyle]);

  const updateEditOverlay = useCallback(() => {
    const style = calcOverlayStyle(imageRef.current);
    if (style) setEditOverlayStyle(style);
  }, [calcOverlayStyle]);

  useEffect(() => {
    if (activeTab === 'view') {
      updateViewOverlay();
      const t1 = setTimeout(updateViewOverlay, 100);
      const t2 = setTimeout(updateViewOverlay, 300);
      const t3 = setTimeout(updateViewOverlay, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    if (activeTab === 'edit') {
      updateEditOverlay();
      const t1 = setTimeout(updateEditOverlay, 100);
      const t2 = setTimeout(updateEditOverlay, 300);
      const t3 = setTimeout(updateEditOverlay, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [activeTab, isFullscreen, updateViewOverlay, updateEditOverlay]);

  // Use ResizeObserver for reliable recalculation on container size changes
  useEffect(() => {
    const handleResize = () => { updateViewOverlay(); updateEditOverlay(); };
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      updateViewOverlay();
      updateEditOverlay();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    if (viewContainerRef.current) observer.observe(viewContainerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [updateViewOverlay, updateEditOverlay]);

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

  // Only show sensors that are assigned as meters to this location
  const assignedSensors = useMemo(() => {
    const assignedUuids = new Set(
      meters.filter(m => !m.is_archived && m.sensor_uuid).map(m => m.sensor_uuid!)
    );
    return availableSensors.filter(s => assignedUuids.has(s.id));
  }, [availableSensors, meters]);

  // Filter out already placed sensors
  const unplacedSensors = assignedSensors.filter(
    (sensor) => !positions.some((p) => p.sensor_uuid === sensor.id)
  );

  // Get position info for placed sensors
  const placedSensorsWithInfo = positions.map((pos) => {
    const sensor = assignedSensors.find((s) => s.id === pos.sensor_uuid);
    return { ...pos, sensorInfo: sensor };
  });

  const calculatePosition = (e: React.DragEvent | React.MouseEvent) => {
    // Use the edit overlay ref which matches the actual image area
    const el = editOverlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
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
      const roomId = findRoomAtPosition(pos.x, pos.y);
      const { error } = await updatePosition(draggingPosition.id, {
        position_x: pos.x,
        position_y: pos.y,
        room_id: roomId,
      } as any);
      
      if (error) {
        toast.error("Fehler beim Verschieben des Sensors");
        console.error("Failed to update position:", error);
      } else {
        const roomName = roomId ? floorRooms.find(r => r.id === roomId)?.name : null;
        toast.success(roomName 
          ? `${draggingPosition.sensor_name} verschoben → ${roomName}`
          : `${draggingPosition.sensor_name} verschoben`
        );
      }
      resetDragState();
      return;
    }

    // Adding new sensor
    if (draggingSensor) {
      const roomId = findRoomAtPosition(pos.x, pos.y);
      const positionData: any = {
        floor_id: floor.id,
        location_integration_id: draggingSensor.integrationId,
        sensor_uuid: draggingSensor.id,
        sensor_name: draggingSensor.name,
        position_x: pos.x,
        position_y: pos.y,
        room_id: roomId,
      };

      const { error } = await addPosition(positionData);
      
      if (error) {
        toast.error("Fehler beim Platzieren des Sensors");
        console.error("Failed to add position:", error);
      } else {
        const roomName = roomId ? floorRooms.find(r => r.id === roomId)?.name : null;
        toast.success(roomName
          ? `${draggingSensor.name} platziert → ${roomName}`
          : `${draggingSensor.name} platziert`
        );
      }
    }

    resetDragState();
  };

  const resetDragState = () => {
    setDraggingSensor(null);
    setDraggingPosition(null);
    setDragPreview(null);
  };

  // Resize handlers for continuous label scaling
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, positionId: string, currentScale: number) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingId(positionId);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    resizeStartRef.current = { startX: clientX, startScale: currentScale };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!resizeStartRef.current) return;
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const dx = cx - resizeStartRef.current.startX;
      const newScale = Math.max(0.4, Math.min(3.0, resizeStartRef.current.startScale + dx / 150));
      // Optimistic local update via DOM
      const el = document.querySelector(`[data-resize-id="${positionId}"]`) as HTMLElement;
      if (el) el.style.transform = `scale(${newScale})`;
      // Debounced DB save
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(() => {
        updatePosition(positionId, { label_scale: newScale } as any);
      }, 400);
    };

    const handleEnd = () => {
      setResizingId(null);
      resizeStartRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
  }, [updatePosition]);

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

  // Calculate dialog height based on content
  const dialogHeight = isFullscreen ? "h-[90vh]" : "h-[70vh]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isFullscreen ? "max-w-[95vw]" : "max-w-5xl"} p-0 gap-0 overflow-hidden`}>
        <DialogHeader className="p-4 pb-2 flex-shrink-0">
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
              className="h-8 w-8 mr-8"
              title={isFullscreen ? "Verkleinern" : "Vollbild"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mx-4 flex-shrink-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className={`px-4 pb-4 ${dialogHeight}`}>
          {isAdmin ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="flex-shrink-0 w-fit mb-3">
                <TabsTrigger value="view" className="gap-2">
                  <Image className="h-4 w-4" />
                  Ansicht
                </TabsTrigger>
                <TabsTrigger value="rooms" className="gap-2">
                  <DoorOpen className="h-4 w-4" />
                  Räume
                </TabsTrigger>
                <TabsTrigger value="edit" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  Messgeräte bearbeiten
                </TabsTrigger>
                <TabsTrigger value="3d" className="gap-2">
                  <Box className="h-4 w-4" />
                  3D-Begehung
                </TabsTrigger>
              </TabsList>

              <TabsContent value="view" className="flex-1 m-0 overflow-hidden">
                <div ref={viewContainerRef} className="relative w-full h-full border rounded-lg overflow-hidden bg-muted/10">
                  <TransformWrapper
                    initialScale={1}
                    minScale={0.5}
                    maxScale={6}
                    centerOnInit
                    limitToBounds={false}
                    wheel={{ step: 0.1 }}
                  >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                      <>
                        <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-20">
                          <Button variant="secondary" size="icon" className="h-8 w-8 bg-card/90 backdrop-blur-sm shadow-md" onClick={() => zoomIn()}>
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <Button variant="secondary" size="icon" className="h-8 w-8 bg-card/90 backdrop-blur-sm shadow-md" onClick={() => zoomOut()}>
                            <ZoomOut className="h-4 w-4" />
                          </Button>
                          <Button variant="secondary" size="icon" className="h-8 w-8 bg-card/90 backdrop-blur-sm shadow-md" onClick={() => resetTransform()}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                        <TransformComponent
                          wrapperStyle={{ width: "100%", height: "100%" }}
                          contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
                        >
                          <div className="relative inline-block" style={{ maxWidth: "100%", maxHeight: "100%" }}>
                            <img
                              ref={viewImageRef}
                              src={floor.floor_plan_url!}
                              alt={floor.name}
                              className="block max-w-full max-h-[calc(70vh-140px)] object-contain"
                              onLoad={updateViewOverlay}
                              draggable={false}
                            />
                            {/* Sensor Overlays - inside zoomable area */}
                            {placedSensorsWithInfo.map((pos) => {
                              const scale = (pos as any).label_scale ?? 1.0;
                              return (
                                <div
                                  key={pos.id}
                                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                                  style={{
                                    left: `${pos.position_x}%`,
                                    top: `${pos.position_y}%`,
                                  }}
                                >
                                  <div
                                    className="bg-card/95 backdrop-blur-sm border shadow-lg rounded-lg text-center min-w-[80px] px-2 py-1"
                                    style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
                                  >
                                    <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">
                                      {pos.sensor_name}
                                    </p>
                                    <p className="text-sm font-mono font-bold text-primary">
                                      {pos.sensorInfo ? `${pos.sensorInfo.value} ${pos.sensorInfo.unit}` : "—"}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                            <RoomOverlay2D rooms={floorRooms} />
                          </div>
                        </TransformComponent>
                      </>
                    )}
                  </TransformWrapper>
                </div>
              </TabsContent>

              <TabsContent value="edit" className="flex-1 m-0 overflow-hidden">
                <div className="flex gap-4 h-full">
                  {/* Sensor List */}
                  <div className="w-56 flex-shrink-0 border rounded-lg bg-muted/30 flex flex-col h-full">
                    <div className="p-3 border-b bg-muted/50 flex-shrink-0">
                      <h3 className="font-medium text-sm">Verfügbare Sensoren</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {unplacedSensors.length} von {assignedSensors.length}
                      </p>
                    </div>
                    <ScrollArea className="flex-1 min-h-0">
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
                    className="flex-1 relative border rounded-lg overflow-hidden bg-muted/20 min-h-0"
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
                      onLoad={updateEditOverlay}
                    />
                    
                    {/* Image-aligned overlay for correct positioning */}
                    <div ref={editOverlayRef} style={editOverlayStyle}>
                    
                    {/* Placed Sensors */}
                    {placedSensorsWithInfo.map((placed) => {
                      const scale = (placed as any).label_scale ?? 1.0;
                      return (
                        <div
                          key={placed.id}
                          draggable={resizingId !== placed.id}
                          onDragStart={(e) => handlePositionDragStart(e, placed)}
                          className={`absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-grab active:cursor-grabbing ${
                            draggingPosition?.id === placed.id ? "opacity-50" : ""
                          }`}
                          style={{
                            left: `${placed.position_x}%`,
                            top: `${placed.position_y}%`,
                          }}
                        >
                          <div
                            data-resize-id={placed.id}
                            className="bg-card border-2 border-primary shadow-lg rounded-lg text-center min-w-[80px] px-2 py-1 relative"
                            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
                          >
                            <p className="text-xs font-medium truncate">{placed.sensor_name}</p>
                            {placed.sensorInfo && (
                              <p className="text-sm font-mono font-bold text-primary">
                                {placed.sensorInfo.value} {placed.sensorInfo.unit}
                              </p>
                            )}
                            {/* Resize handle - bottom right corner */}
                            <div
                              className="absolute -bottom-1 -right-1 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-primary rounded-full shadow-md"
                              onMouseDown={(e) => handleResizeStart(e, placed.id, scale)}
                              onTouchStart={(e) => handleResizeStart(e, placed.id, scale)}
                              draggable={false}
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" className="text-primary-foreground">
                                <path d="M7 1L1 7M7 4L4 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </div>
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
                      );
                    })}

                    {/* Room overlay in edit mode */}
                    <RoomOverlay2D rooms={floorRooms} />

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
                </div>
              </TabsContent>

              {/* 3D Walkthrough Tab */}
              <TabsContent value="3d" className="flex-1 m-0 overflow-hidden">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                }>
                  <FloorPlan3DViewer 
                    floor={floor} 
                    locationId={locationId}
                    sensors={availableSensors.map(s => ({
                      id: s.id,
                      name: s.name,
                      value: s.value,
                      unit: s.unit,
                    }))}
                    isAdmin={isAdmin}
                  />
                </Suspense>
              </TabsContent>

              {/* Room Polygon Editor Tab */}
              <TabsContent value="rooms" className="flex-1 m-0 overflow-hidden">
                <RoomPolygonEditor floorId={floor.id} floorPlanUrl={floor.floor_plan_url!} />
              </TabsContent>

            </Tabs>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="flex-shrink-0 w-fit mb-3">
                <TabsTrigger value="view" className="gap-2">
                  <Image className="h-4 w-4" />
                  Ansicht
                </TabsTrigger>
                <TabsTrigger value="3d" className="gap-2">
                  <Box className="h-4 w-4" />
                  3D-Begehung
                </TabsTrigger>
              </TabsList>

              <TabsContent value="view" className="flex-1 m-0 overflow-hidden">
                <div className="relative w-full h-full border rounded-lg overflow-hidden bg-muted/10">
                  <img
                    src={floor.floor_plan_url!}
                    alt={floor.name}
                    className="w-full h-full object-contain"
                  />
                  {placedSensorsWithInfo.map((pos) => (
                    <div
                      key={pos.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${pos.position_x}%`, top: `${pos.position_y}%` }}
                    >
                      <div className="bg-card/95 backdrop-blur-sm border shadow-lg rounded-lg px-2 py-1 min-w-[80px] text-center">
                        <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">{pos.sensor_name}</p>
                        <p className="text-sm font-mono font-bold text-primary">
                          {pos.sensorInfo ? `${pos.sensorInfo.value} ${pos.sensorInfo.unit}` : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                  <RoomOverlay2D rooms={floorRooms} />
                  
                </div>
              </TabsContent>

              <TabsContent value="3d" className="flex-1 m-0 overflow-hidden">
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                  <FloorPlan3DViewer floor={floor} locationId={locationId} sensors={[]} isAdmin={false} />
                </Suspense>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
