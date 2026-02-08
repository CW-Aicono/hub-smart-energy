import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Layers } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useFloors, Floor } from "@/hooks/useFloors";
import { useFloorSensorPositions, FloorSensorPosition } from "@/hooks/useFloorSensorPositions";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";

interface FloorPlanWidgetProps {
  locationId: string | null;
}

interface SensorValue {
  id: string;
  value: string;
  unit: string;
}

const FloorPlanWidget = ({ locationId }: FloorPlanWidgetProps) => {
  const { locations } = useLocations();
  const { floors, loading: floorsLoading } = useFloors(locationId || undefined);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const { positions, loading: positionsLoading } = useFloorSensorPositions(selectedFloorId || undefined);
  const { locationIntegrations } = useLocationIntegrations(locationId || undefined);
  
  const [sensorValues, setSensorValues] = useState<Map<string, SensorValue>>(new Map());
  const [loadingValues, setLoadingValues] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const selectedFloor = floors.find((f) => f.id === selectedFloorId);

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

  // Fetch sensor values
  const fetchSensorValues = useCallback(async () => {
    if (!positions.length || !locationIntegrations.length) return;

    setLoadingValues(true);
    const newValues = new Map<string, SensorValue>();

    try {
      // Group positions by integration
      const positionsByIntegration = new Map<string, FloorSensorPosition[]>();
      positions.forEach((pos) => {
        const existing = positionsByIntegration.get(pos.location_integration_id) || [];
        existing.push(pos);
        positionsByIntegration.set(pos.location_integration_id, existing);
      });

      // Fetch sensors for each integration
      for (const [integrationId, intPositions] of positionsByIntegration) {
        const integration = locationIntegrations.find((li) => li.id === integrationId);
        if (!integration?.is_enabled) continue;

        try {
          const { data, error } = await supabase.functions.invoke("loxone-api", {
            body: {
              locationIntegrationId: integrationId,
              action: "getSensors",
            },
          });

          if (error || !data?.success) continue;

          // Map sensor values
          for (const pos of intPositions) {
            const sensor = data.sensors?.find((s: any) => s.id === pos.sensor_uuid);
            if (sensor) {
              newValues.set(pos.sensor_uuid, {
                id: sensor.id,
                value: sensor.value,
                unit: sensor.unit,
              });
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch sensors for integration ${integrationId}:`, err);
        }
      }

      setSensorValues(newValues);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch sensor values:", err);
    } finally {
      setLoadingValues(false);
    }
  }, [positions, locationIntegrations]);

  // Auto-fetch values when positions change
  useEffect(() => {
    if (positions.length > 0) {
      fetchSensorValues();
    }
  }, [positions, fetchSensorValues]);

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
              onClick={fetchSensorValues}
              disabled={loadingValues || positions.length === 0}
            >
              <RefreshCw className={`h-4 w-4 ${loadingValues ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Floor Plan with Sensors */}
        <div className="relative h-[350px] bg-muted/10">
          {floorsLoading || positionsLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedFloor?.floor_plan_url ? (
            <>
              <img
                src={selectedFloor.floor_plan_url}
                alt={selectedFloor.name}
                className="w-full h-full object-contain"
              />
              
              {/* Sensor Overlays */}
              {positions.map((pos) => {
                const sensorValue = sensorValues.get(pos.sensor_uuid);
                return (
                  <div
                    key={pos.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${pos.position_x}%`,
                      top: `${pos.position_y}%`,
                    }}
                  >
                    <div className="bg-card/95 backdrop-blur-sm border shadow-lg rounded-lg px-2 py-1 min-w-[80px] text-center hover:scale-105 transition-transform">
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

              {positions.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <p className="text-sm text-muted-foreground">
                    Keine Messgeräte auf dieser Etage platziert
                  </p>
                </div>
              )}
            </>
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
