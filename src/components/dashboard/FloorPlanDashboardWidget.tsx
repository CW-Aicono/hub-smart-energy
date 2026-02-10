import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, Box, Image } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const FloorPlan3DViewer = lazy(() => import("@/components/locations/FloorPlan3DViewer").then(m => ({ default: m.FloorPlan3DViewer })));

interface FloorPlanDashboardWidgetProps {
  locationId: string | null;
}

interface FloorOption {
  id: string;
  name: string;
  location_id: string;
  location_name: string;
  floor_plan_url: string | null;
  floor_number: number;
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

const FloorPlanDashboardWidget = ({ locationId }: FloorPlanDashboardWidgetProps) => {
  const { locations } = useLocations();
  const [allFloors, setAllFloors] = useState<FloorOption[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

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
          };
        });
        setAllFloors(options);
        if (options.length > 0 && !selectedFloorId) {
          setSelectedFloorId(options[0].id);
        }
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
        </div>
      </div>
      <CardContent className="flex-1 p-0 min-h-0 overflow-hidden" style={{ minHeight: 400, height: 400 }}>
        {selectedFloor && viewMode === "2d" && selectedFloor.floor_plan_url ? (
          <div className="relative w-full h-full">
            <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit wheel={{ step: 0.1 }}>
              <ZoomControls />
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <img src={selectedFloor.floor_plan_url} alt={selectedFloor.name} className="max-w-full max-h-full object-contain" draggable={false} />
              </TransformComponent>
            </TransformWrapper>
          </div>
        ) : selectedFloor && viewMode === "3d" ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <FloorPlan3DViewer
              floor={{ id: selectedFloor.id, location_id: selectedFloor.location_id, name: selectedFloor.name, floor_number: selectedFloor.floor_number, floor_plan_url: selectedFloor.floor_plan_url, description: null, area_sqm: null, model_3d_url: null, model_3d_mtl_url: null, model_3d_rotation: null, created_at: "", updated_at: "" }}
              locationId={selectedFloor.location_id}
              sensors={[]}
              isAdmin={true}
              compact
            />
          </Suspense>
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
