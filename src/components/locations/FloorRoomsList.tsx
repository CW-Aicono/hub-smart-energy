import { useState } from "react";
import { useFloorRooms, FloorRoomInsert } from "@/hooks/useFloorRooms";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DoorOpen, Plus, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";

interface FloorRoomsListProps {
  floorId: string;
}

export function FloorRoomsList({ floorId }: FloorRoomsListProps) {
  const { rooms, loading, addRoom, deleteRoom } = useFloorRooms(floorId);
  const { isAdmin } = useUserRole();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

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

  if (loading) {
    return <Skeleton className="h-8 w-full" />;
  }

  return (
    <div className="pl-16 pr-4 pb-3 space-y-2">
      {rooms.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Keine Räume vorhanden</p>
      )}

      {rooms.map((room) => (
        <div
          key={room.id}
          className="flex items-center gap-2 text-sm py-1.5 px-3 rounded-md bg-muted/40 group"
        >
          <DoorOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{room.name}</span>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
              onClick={() => handleDelete(room.id, room.name)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

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
