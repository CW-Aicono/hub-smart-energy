import { useState, useMemo } from "react";
import { useFloorRooms, FloorRoomInsert } from "@/hooks/useFloorRooms";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DoorOpen, Plus, Trash2, X, Check, Gauge, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const energyTypeColors: Record<string, string> = {
  strom: "text-amber-600",
  gas: "text-blue-500",
  waerme: "text-red-500",
  wasser: "text-cyan-500",
  solar: "text-yellow-500",
  oel: "text-stone-600",
  pellets: "text-orange-700",
};

interface FloorRoomsListProps {
  floorId: string;
  locationId: string;
}

export function FloorRoomsList({ floorId, locationId }: FloorRoomsListProps) {
  const { rooms, loading, addRoom, updateRoom, deleteRoom } = useFloorRooms(floorId);
  const { meters } = useMeters(locationId);
  const { isAdmin } = useUserRole();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const floorMeters = useMemo(() =>
    meters.filter(m => !m.is_archived && m.floor_id === floorId),
    [meters, floorId]
  );

  const metersByRoom = useMemo(() => {
    const map = new Map<string, Meter[]>();
    floorMeters.forEach(m => {
      if (m.room_id) {
        const existing = map.get(m.room_id) || [];
        existing.push(m);
        map.set(m.room_id, existing);
      }
    });
    return map;
  }, [floorMeters]);

  const unassignedMeters = useMemo(() =>
    floorMeters.filter(m => !m.room_id),
    [floorMeters]
  );

  const toggleRoom = (roomId: string) => {
    setExpandedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await addRoom({
      floor_id: floorId,
      name: newName.trim(),
      position_x: 0,
      position_y: 0,
      width: 4,
      depth: 4,
      wall_height: 2.8,
      color: "#f0f0f0",
    });
    setSaving(false);
    if (error) {
      toast.error("Raum konnte nicht erstellt werden");
    } else {
      toast.success(`Raum "${newName.trim()}" erstellt`);
      setNewName("");
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const { error } = await deleteRoom(id);
    if (error) {
      toast.error("Raum konnte nicht gelöscht werden");
    } else {
      toast.success(`Raum "${name}" gelöscht`);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    setSaving(true);
    const { error } = await updateRoom(id, { name: editingName.trim() });
    setSaving(false);
    if (error) {
      toast.error("Raum konnte nicht umbenannt werden");
    } else {
      toast.success("Raumname aktualisiert");
    }
    setEditingRoomId(null);
    setEditingName("");
  };

  if (loading) {
    return <Skeleton className="h-8 w-full" />;
  }

  return (
    <div className="pl-16 pr-4 pb-3 space-y-2">
      {rooms.length === 0 && unassignedMeters.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Keine Räume oder Zähler vorhanden</p>
      )}

      {rooms.map((room) => {
        const roomMeters = metersByRoom.get(room.id) || [];
        const hasMeters = roomMeters.length > 0;
        const isExpanded = expandedRooms.has(room.id);

        return (
          <div key={room.id}>
            <div
              className={cn(
                "flex items-center gap-2 text-sm py-1.5 px-3 rounded-md bg-muted/40 group",
                hasMeters && "cursor-pointer"
              )}
              onClick={hasMeters ? () => toggleRoom(room.id) : undefined}
            >
              {hasMeters && (
                <button className="p-0.5 hover:bg-muted-foreground/20 rounded shrink-0">
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
              )}
              <DoorOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {editingRoomId === room.id ? (
                <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-6 text-sm py-0 px-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(room.id);
                      if (e.key === "Escape") { setEditingRoomId(null); setEditingName(""); }
                    }}
                  />
                  <Button size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRename(room.id)} disabled={!editingName.trim() || saving}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => { setEditingRoomId(null); setEditingName(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <span className="flex-1 truncate">{room.name}</span>
              )}
              {hasMeters && editingRoomId !== room.id && (
                <span className="text-xs text-muted-foreground">{roomMeters.length} Zähler</span>
              )}
              {isAdmin && editingRoomId !== room.id && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setEditingRoomId(room.id); setEditingName(room.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(room.id, room.name); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
            {isExpanded && hasMeters && (
              <div className="ml-8 space-y-1 mt-1">
                {roomMeters.map(meter => (
                  <div key={meter.id} className="flex items-center gap-2 text-xs py-1 px-3 rounded bg-muted/20">
                    <Gauge className={cn("h-3 w-3 shrink-0", energyTypeColors[meter.energy_type] || "text-muted-foreground")} />
                    <span className="truncate">{meter.name}</span>
                    {meter.meter_number && (
                      <span className="text-muted-foreground/50">#{meter.meter_number}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {unassignedMeters.length > 0 && (
        <div className="space-y-1 pt-1">
          {rooms.length > 0 && (
            <p className="text-xs text-muted-foreground/60 px-3">Ohne Raumzuordnung</p>
          )}
          {unassignedMeters.map(meter => (
            <div key={meter.id} className="flex items-center gap-2 text-xs py-1 px-3 rounded bg-muted/20">
              <Gauge className={cn("h-3 w-3 shrink-0", energyTypeColors[meter.energy_type] || "text-muted-foreground")} />
              <span className="truncate">{meter.name}</span>
              {meter.meter_number && (
                <span className="text-muted-foreground/50">#{meter.meter_number}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Raumname"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleAdd} disabled={!newName.trim() || saving}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setAdding(false); setNewName(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        isAdmin && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Raum hinzufügen
          </Button>
        )
      )}
    </div>
  );
}
