import { useState } from "react";
import { Floor } from "@/hooks/useFloors";
import { useUserRole } from "@/hooks/useUserRole";
import { EditFloorDialog } from "./EditFloorDialog";
import { DeleteFloorDialog } from "./DeleteFloorDialog";
import { FloorPlanEditor } from "./FloorPlanEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Image, SquareStack, MapPin } from "lucide-react";

interface FloorListProps {
  floors: Floor[];
  loading: boolean;
  locationId: string;
  onRefresh: () => void;
}

export function FloorList({ floors, loading, locationId, onRefresh }: FloorListProps) {
  const { isAdmin } = useUserRole();
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [editorFloor, setEditorFloor] = useState<Floor | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (floors.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <SquareStack className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">Keine Etagen vorhanden</p>
        <p className="text-sm">Fügen Sie Etagen hinzu, um Grundrisspläne zu verwalten</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {floors.map((floor) => (
        <div
          key={floor.id}
          className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 text-primary font-bold">
            {floor.floor_number >= 0 ? floor.floor_number : `U${Math.abs(floor.floor_number)}`}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{floor.name}</p>
            {floor.description && (
              <p className="text-sm text-muted-foreground truncate">{floor.description}</p>
            )}
            {floor.area_sqm && (
              <p className="text-sm text-muted-foreground">{floor.area_sqm} m²</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && floor.floor_plan_url && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setEditorFloor(floor)}
              >
                <MapPin className="h-4 w-4" />
                Messgeräte
              </Button>
            )}
            
            {floor.floor_plan_url ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Image className="h-4 w-4" />
                    Grundriss
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{floor.name} - Grundriss</DialogTitle>
                  </DialogHeader>
                  <div className="relative overflow-auto">
                    <img
                      src={floor.floor_plan_url}
                      alt={`Grundriss ${floor.name}`}
                      className="w-full h-auto"
                    />
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <span className="text-sm text-muted-foreground">Kein Grundriss</span>
            )}

            {isAdmin && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <EditFloorDialog floor={floor} locationId={locationId} onSuccess={onRefresh} />
                <DeleteFloorDialog floor={floor} onSuccess={onRefresh} />
              </div>
            )}
          </div>
        </div>
      ))}
      
      {/* Floor Plan Editor Dialog */}
      {editorFloor && (
        <FloorPlanEditor
          floor={editorFloor}
          locationId={locationId}
          open={!!editorFloor}
          onOpenChange={(open) => !open && setEditorFloor(null)}
        />
      )}
    </div>
  );
}
