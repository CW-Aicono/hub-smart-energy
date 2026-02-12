import { useState, useEffect, useMemo } from "react";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Layers, ZoomIn, ZoomOut, RotateCcw, Gauge } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useFloors } from "@/hooks/useFloors";
import { useLiveSensorValues } from "@/hooks/useLiveSensorValues";
import { useMeters } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { useFloorSensorPositions } from "@/hooks/useFloorSensorPositions";
import { ENERGY_CARD_CLASSES, ENERGY_ICON_CLASSES } from "@/lib/energyTypeColors";

interface FloorPlanWidgetProps {
  locationId: string | null;
}

// Zoom controls component
function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  
  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10">
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

const FloorPlanWidget = ({ locationId }: FloorPlanWidgetProps) => {
  const { locations } = useLocations();
  const { floors, loading: floorsLoading } = useFloors(locationId || undefined);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  const { positions, sensorValuesMap, loadingValues, lastRefresh, refreshSensorValues } = useLiveSensorValues(selectedFloorId || undefined);
  const { meters } = useMeters(locationId || undefined);
  const { readings } = useMeterReadings();
  const { positions: sensorPositions } = useFloorSensorPositions(selectedFloorId || undefined);

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const selectedFloor = floors.find((f) => f.id === selectedFloorId);

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

  // Auto-select first floor with floor plan when floors load
  useEffect(() => {
    if (floors.length > 0 && !selectedFloorId) {
      const floorWithPlan = floors.find((f) => f.floor_plan_url);
      if (floorWithPlan) {
        setSelectedFloorId(floorWithPlan.id);
      } else {
        setSelectedFloorId(floors[0].id);
      }
    }
  }, [floors, selectedFloorId]);

  // Reset floor selection when location changes
  useEffect(() => {
    setSelectedFloorId(null);
  }, [locationId]);

  // No location selected - show placeholder
  if (!locationId) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Wählen Sie einen Standort aus, um den Grundriss anzuzeigen</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No floors with plans
  const floorsWithPlans = floors.filter((f) => f.floor_plan_url);
  if (!floorsLoading && floorsWithPlans.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Keine Grundrisse vorhanden</p>
              <p className="text-sm">
                Laden Sie Grundrisse für {selectedLocation?.name || "diesen Standort"} hoch
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header with floor selector */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <Select
              value={selectedFloorId || ""}
              onValueChange={setSelectedFloorId}
              disabled={floorsLoading}
            >
              <SelectTrigger className="w-[200px] h-8 bg-background">
                <SelectValue placeholder="Etage auswählen" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {floors.map((floor) => (
                  <SelectItem key={floor.id} value={floor.id}>
                    {floor.name}
                    {!floor.floor_plan_url && " (kein Grundriss)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Aktualisiert: {lastRefresh.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refreshSensorValues}
              disabled={loadingValues || positions.length === 0}
            >
              <RefreshCw className={`h-4 w-4 ${loadingValues ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Floor Plan with Sensors - Zoomable */}
        <div className="relative h-[350px] bg-muted/10">
          {floorsLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedFloor?.floor_plan_url ? (
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              limitToBounds={false}
              wheel={{ step: 0.1 }}
              panning={{ velocityDisabled: true }}
            >
              <ZoomControls />
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
              >
                <div className="relative inline-block">
                  <img
                    src={selectedFloor.floor_plan_url}
                    alt={selectedFloor.name}
                    className="max-w-full max-h-[350px] object-contain"
                    draggable={false}
                  />
                  
                   {/* Sensor Overlays - positioned relative to image */}
                  {positions.map((pos) => {
                    const sensorValue = sensorValuesMap.get(pos.sensor_uuid);
                    const scale = (pos as any).label_scale ?? 1.0;
                    return (
                      <div
                        key={pos.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                        style={{
                          left: `${pos.position_x}%`,
                          top: `${pos.position_y}%`,
                        }}
                      >
                        <div
                          className="bg-card/95 backdrop-blur-sm border shadow-lg rounded-lg px-2 py-1 min-w-[80px] text-center whitespace-nowrap"
                          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
                        >
                          <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[100px]">
                            {pos.sensor_name}
                          </p>
                          <p className="text-sm font-mono font-bold text-primary">
                            {sensorValue ? `${sensorValue.value} ${sensorValue.unit}` : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Meter Overlays - positioned at their sensor positions */}
                  {placedFloorMeters.map((meter) => {
                    const pos = meterPositionMap.get(meter.sensor_uuid!);
                    if (!pos) return null;
                    // Skip if already shown as a live sensor
                    if (sensorValuesMap.has(meter.sensor_uuid!)) return null;
                    const value = meterLatestValues[meter.id];
                    const borderClass = ENERGY_CARD_CLASSES[meter.energy_type] || "border-border bg-card";
                    const iconClass = ENERGY_ICON_CLASSES[meter.energy_type] || "text-primary";
                    return (
                      <div
                        key={meter.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                        }}
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

              {positions.length === 0 && placedFloorMeters.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 pointer-events-none">
                  <p className="text-sm text-muted-foreground">
                    Keine Messgeräte auf dieser Etage platziert
                  </p>
                </div>
              )}
            </TransformWrapper>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Kein Grundriss für diese Etage</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FloorPlanWidget;
