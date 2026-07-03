import { useState } from "react";
import { Floor, useFloors } from "@/hooks/useFloors";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { EditFloorDialog } from "./EditFloorDialog";
import { DeleteFloorDialog } from "./DeleteFloorDialog";
import { FloorPlanDialog } from "./FloorPlanDialog";
import { FloorRoomsList } from "./FloorRoomsList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Image, SquareStack, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface FloorListProps {
  floors: Floor[];
  loading: boolean;
  locationId: string;
  onRefresh: () => void;
}

interface FloorRowProps {
  floor: Floor;
  locationId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPlan: (f: Floor) => void;
  isAdmin: boolean;
  onRefresh: () => void;
  T: (key: string) => string;
  isDraggable: boolean;
}

function FloorRow({
  floor,
  locationId,
  isExpanded,
  onToggle,
  onOpenPlan,
  isAdmin,
  onRefresh,
  T,
  isDraggable,
}: FloorRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: floor.id,
    disabled: !isDraggable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors group cursor-pointer"
        onClick={onToggle}
      >
        {isDraggable && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            onClick={(e) => e.stopPropagation()}
            aria-label="Reihenfolge ändern"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 p-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

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

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {floor.floor_plan_url ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => onOpenPlan(floor)}>
              <Image className="h-4 w-4" />
              {T("fl.floorPlan")}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">{T("fl.noFloorPlan")}</span>
          )}
          {floor.model_3d_url && <span className="text-xs text-primary font-medium">3D ✓</span>}
          {isAdmin && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <EditFloorDialog floor={floor} locationId={locationId} onSuccess={onRefresh} />
              <DeleteFloorDialog floor={floor} onSuccess={onRefresh} />
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t">
          <FloorRoomsList floorId={floor.id} locationId={locationId} />
        </div>
      )}
    </div>
  );
}

export function FloorList({ floors, loading, locationId, onRefresh }: FloorListProps) {
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { reorderFloors } = useFloors(locationId);
  const [openFloor, setOpenFloor] = useState<Floor | null>(null);
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleExpand = (floorId: string) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = floors.findIndex((f) => f.id === active.id);
    const newIndex = floors.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(floors, oldIndex, newIndex).map((f) => f.id);
    await reorderFloors(nextOrder);
    onRefresh();
  };

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
        <p className="font-medium">{T("fl.noFloors")}</p>
        <p className="text-sm">{T("fl.addHint")}</p>
      </div>
    );
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={floors.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {floors.map((floor) => (
              <FloorRow
                key={floor.id}
                floor={floor}
                locationId={locationId}
                isExpanded={expandedFloors.has(floor.id)}
                onToggle={() => toggleExpand(floor.id)}
                onOpenPlan={setOpenFloor}
                isAdmin={isAdmin}
                onRefresh={onRefresh}
                T={T}
                isDraggable={isAdmin}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {openFloor && (
        <FloorPlanDialog
          floor={openFloor}
          locationId={locationId}
          open={!!openFloor}
          onOpenChange={(open) => !open && setOpenFloor(null)}
        />
      )}
    </>
  );
}
