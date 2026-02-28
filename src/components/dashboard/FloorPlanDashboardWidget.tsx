import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, Box, Image, ZoomIn, ZoomOut, RotateCcw, RefreshCw, Gauge, Maximize2, Minimize2 } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useLiveSensorValues } from "@/hooks/useLiveSensorValues";
import { useMeters } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { useFloorSensorPositions } from "@/hooks/useFloorSensorPositions";
import { ENERGY_CARD_CLASSES, ENERGY_ICON_CLASSES } from "@/lib/energyTypeColors";
import { supabase } from "@/integrations/supabase/client";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";

const FloorPlan3DViewer = lazy(() => import("@/components/locations/FloorPlan3DViewer").then(m => ({ default: m.FloorPlan3DViewer })));

interface FloorPlanDashboardWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

interface FloorOption {
  id: string;
  name: string;
  location_id: string;
  location_name: string;
  floor_plan_url: string | null;
  floor_number: number;
  model_3d_url: string | null;
  model_3d_mtl_url: string | null;
  model_3d_rotation: number | null;
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-2 z-10">
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
  );
}

const FloorPlanDashboardWidget = ({ locationId, onExpand, onCollapse }: FloorPlanDashboardWidgetProps) => {
  const { locations } = useLocations();
  const [allFloors, setAllFloors] = useState<FloorOption[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  const transformRef = useRef<any>(null);
  const { positions, sensorValuesMap, sensorValues, loadingValues, lastRefresh, refreshSensorValues } = useLiveSensorValues(selectedFloorId || undefined);
  const { meters } = useMeters(locationId || undefined);
  const { readings } = useMeterReadings();
  const { positions: sensorPositions } = useFloorSensorPositions(selectedFloorId || undefined);

  // Meters assigned to the selected floor that have sensor positions placed
  const placedFloorMeters = useMemo(() => {
    if (!selectedFloorId) return [];
    const floorMeters = meters.filter(m => !m.is_archived && m.floor_id === selectedFloorId);
    const placedUuids = new Set(sensorPositions.map(p => p.sensor_uuid));
    return floorMeters.filter(m => m.sensor_uuid && placedUuids.has(m.sensor_uuid));
  }, [meters, selectedFloorId, sensorPositions]);

  // Latest reading per meter
  const meterLatestValues = useMemo(() => {
    const values: Record<string, number | null> = {};
    placedFloorMeters.forEach(m => {
      const meterReadings = readings
        .filter(r => r.meter_id === m.id)
        .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
      values[m.id] = meterReadings.length > 0 ? meterReadings[0].value : null;
    });
    return values;
  }, [placedFloorMeters, readings]);

  // Map sensor_uuid -> position for meter overlay
  const meterPositionMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    sensorPositions.forEach(p => map.set(p.sensor_uuid, { x: p.position_x, y: p.position_y }));
    return map;
  }, [sensorPositions]);

  // Fetch all floors across all locations (or for selected location)
  const fetchFloors = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from("floors").select("*").order("floor_number", { ascending: true });
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      const { data } = await query;
      if (data) {
        const options: FloorOption[] = data.map((f: any) => {
          const loc = locations.find(l => l.id === f.location_id);
          return {
            id: f.id,
            name: f.name,
            location_id: f.location_id,
            location_name: loc?.name || "",
            floor_plan_url: f.floor_plan_url,
            floor_number: f.floor_number,
            model_3d_url: f.model_3d_url,
            model_3d_mtl_url: f.model_3d_mtl_url,
            model_3d_rotation: f.model_3d_rotation,
          };
        });
        setAllFloors(options);
        // Always auto-select when floors change (selectedFloorId was reset to null on location switch)
        setSelectedFloorId(prev => {
          if (prev && options.some(o => o.id === prev)) return prev;
          if (options.length === 0) return null;
          const mainLoc = locations.find(l => l.is_main_location);
          const mainFloor0 = mainLoc ? options.find(f => f.location_id === mainLoc.id && f.floor_number === 0) : null;
          const anyFloor0 = options.find(f => f.floor_number === 0);
          return (mainFloor0 || anyFloor0 || options[0]).id;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [locationId, locations]);

  useEffect(() => {
    if (locations.length > 0) fetchFloors();
  }, [fetchFloors, locations]);

  useEffect(() => {
    setSelectedFloorId(null);
  }, [locationId]);

  const selectedFloor = allFloors.find(f => f.id === selectedFloorId);

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full p-6">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (allFloors.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full p-6">
          <div className="text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Keine Grundrisse vorhanden</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Select value={selectedFloorId || ""} onValueChange={setSelectedFloorId}>
            <SelectTrigger className="h-7 text-xs bg-background flex-1 min-w-0">
              <SelectValue placeholder="Grundriss wählen" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {allFloors.map((f) => (
                <SelectItem key={f.id} value={f.id} className="text-xs">
                  {!locationId && f.location_name ? `${f.location_name} – ` : ""}
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {viewMode === "2d" && lastRefresh && (
            <span className="text-[10px] text-muted-foreground mr-1">
              {lastRefresh.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {viewMode === "2d" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Ansicht zurücksetzen und Daten aktualisieren"
              onClick={() => { refreshSensorValues(); transformRef.current?.resetTransform(); }}
              disabled={loadingValues || positions.length === 0}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingValues ? "animate-spin" : ""}`} />
            </Button>
          )}
          <Button
            variant={viewMode === "2d" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode("2d")}
          >
            <Image className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === "3d" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode("3d")}
          >
            <Box className="h-3.5 w-3.5" />
          </Button>
          {onExpand && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Vergrößern"
              onClick={onExpand}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Verkleinern"
              onClick={onCollapse}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <CardContent className="relative flex-1 p-0 min-h-0 overflow-hidden" style={{ minHeight: 400, height: 400 }}>
        {selectedFloor && viewMode === "2d" && selectedFloor.floor_plan_url ? (
          <div className="relative w-full h-full">
            <TransformWrapper ref={transformRef} initialScale={1} minScale={0.5} maxScale={4} centerOnInit wheel={{ disabled: true }} pinch={{ disabled: true }}>
              <ZoomControls />
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%", touchAction: "pan-y" }} contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", touchAction: "pan-y" }}>
                <div className="relative inline-block">
                  <img src={selectedFloor.floor_plan_url} alt={selectedFloor.name} className="max-w-full max-h-full object-contain" draggable={false} />

                  {/* Sensor Overlays */}
                  {positions.map((pos) => {
                    const sensorValue = sensorValuesMap.get(pos.sensor_uuid);
                    const scale = (pos as any).label_scale ?? 1.0;
                    // For water/gas meters the live value is a flow rate – override unit to m³/h
                    const linkedMeter = meters.find((m) => m.sensor_uuid === pos.sensor_uuid);
                    const isFlowType = linkedMeter?.energy_type === "wasser" || linkedMeter?.energy_type === "gas";
                    const displayUnit = sensorValue ? (isFlowType ? "m³/h" : sensorValue.unit) : "";
                    return (
                      <div
                        key={pos.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                        style={{ left: `${pos.position_x}%`, top: `${pos.position_y}%` }}
                      >
                        <div
                          className="bg-card/95 backdrop-blur-sm border shadow-lg rounded-lg px-2 py-1 min-w-[80px] text-center whitespace-nowrap"
                          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
                        >
                          <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">
                            {pos.sensor_name}
                          </p>
                          <p className="text-sm font-mono font-bold text-primary">
                            {sensorValue ? `${sensorValue.value} ${displayUnit}` : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Meter Overlays */}
                  {placedFloorMeters.map((meter) => {
                    const pos = meterPositionMap.get(meter.sensor_uuid!);
                    if (!pos) return null;
                    if (sensorValuesMap.has(meter.sensor_uuid!)) return null;
                    const value = meterLatestValues[meter.id];
                    const borderClass = ENERGY_CARD_CLASSES[meter.energy_type] || "border-border bg-card";
                    const iconClass = ENERGY_ICON_CLASSES[meter.energy_type] || "text-primary";
                    return (
                      <div
                        key={meter.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      >
                        <div className={`border shadow-lg rounded-lg px-2 py-1 min-w-[80px] text-center whitespace-nowrap ${borderClass}`}>
                          <div className="flex items-center justify-center gap-1">
                            <Gauge className={`h-3 w-3 ${iconClass}`} />
                            <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">
                              {meter.name}
                            </p>
                          </div>
                          <p className="text-sm font-mono font-bold text-primary">
                            {value != null ? `${value.toLocaleString("de-DE")} ${meter.unit}` : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TransformComponent>
            </TransformWrapper>
          </div>
        ) : selectedFloor && viewMode === "3d" ? (
          <div style={{ width: "100%", height: 400 }}>
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <FloorPlan3DViewer
                key={selectedFloor.id}
                floor={{ id: selectedFloor.id, location_id: selectedFloor.location_id, name: selectedFloor.name, floor_number: selectedFloor.floor_number, floor_plan_url: selectedFloor.floor_plan_url, description: null, area_sqm: null, model_3d_url: selectedFloor.model_3d_url, model_3d_mtl_url: selectedFloor.model_3d_mtl_url, model_3d_rotation: selectedFloor.model_3d_rotation, created_at: "", updated_at: "" }}
                locationId={selectedFloor.location_id}
                sensors={sensorValues}
                isAdmin={false}
                compact
                readOnly
              />
            </Suspense>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Kein Grundriss für diese Etage</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FloorPlanDashboardWidget;
