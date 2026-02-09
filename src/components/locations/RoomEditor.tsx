import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Floor } from "@/hooks/useFloors";
import { FloorRoom, FloorRoomInsert, useFloorRooms } from "@/hooks/useFloorRooms";
import { toast } from "sonner";

interface RoomEditorProps {
  floor: Floor;
  onClose: () => void;
}

const DEFAULT_ROOM: Omit<FloorRoomInsert, "floor_id"> = {
  name: "Neuer Raum",
  position_x: 0,
  position_y: 0,
  width: 4,
  depth: 4,
  wall_height: 2.8,
  color: "#f0f0f0",
};

export function RoomEditor({ floor, onClose }: RoomEditorProps) {
  const { rooms, loading, addRoom, updateRoom, deleteRoom } = useFloorRooms(floor.id);
  const [selectedRoom, setSelectedRoom] = useState<FloorRoom | null>(null);
  const [editValues, setEditValues] = useState<Partial<FloorRoom>>({});
  const [saving, setSaving] = useState(false);

  const handleSelectRoom = (room: FloorRoom) => {
    setSelectedRoom(room);
    setEditValues({
      name: room.name,
      position_x: room.position_x,
      position_y: room.position_y,
      width: room.width,
      depth: room.depth,
      wall_height: room.wall_height,
      color: room.color,
    });
  };

  const handleAddRoom = async () => {
    setSaving(true);
    
    // Calculate position for new room (offset from existing rooms)
    const offsetX = rooms.length * 5;
    
    const { error } = await addRoom({
      ...DEFAULT_ROOM,
      floor_id: floor.id,
      name: `Raum ${rooms.length + 1}`,
      position_x: offsetX,
    });

    if (error) {
      toast.error("Fehler beim Erstellen des Raums");
    } else {
      toast.success("Raum erstellt");
    }
    setSaving(false);
  };

  const handleSaveRoom = async () => {
    if (!selectedRoom) return;
    
    setSaving(true);
    const { error } = await updateRoom(selectedRoom.id, editValues);
    
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Änderungen gespeichert");
      setSelectedRoom(null);
      setEditValues({});
    }
    setSaving(false);
  };

  const handleDeleteRoom = async (roomId: string, roomName: string) => {
    if (!confirm(`Raum "${roomName}" wirklich löschen?`)) return;
    
    setSaving(true);
    const { error } = await deleteRoom(roomId);
    
    if (error) {
      toast.error("Fehler beim Löschen");
    } else {
      toast.success("Raum gelöscht");
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null);
        setEditValues({});
      }
    }
    setSaving(false);
  };

  const updateEditValue = (key: keyof FloorRoom, value: string | number) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-muted/30 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
        <div className="flex-1">
          <h3 className="font-medium">Räume bearbeiten – {floor.name}</h3>
          <p className="text-sm text-muted-foreground">
            Definieren Sie rechteckige Räume für die 3D-Ansicht
          </p>
        </div>
        <Button onClick={handleAddRoom} disabled={saving}>
          <Plus className="h-4 w-4 mr-2" />
          Raum hinzufügen
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Room List */}
        <div className="w-64 border-r flex flex-col">
          <div className="p-3 border-b bg-muted/20">
            <h4 className="font-medium text-sm">{rooms.length} Räume</h4>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Noch keine Räume definiert
                </p>
              ) : (
                rooms.map((room) => (
                  <div
                    key={room.id}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                      selectedRoom?.id === room.id 
                        ? "bg-primary/10 border border-primary" 
                        : "hover:bg-muted border border-transparent"
                    }`}
                    onClick={() => handleSelectRoom(room)}
                  >
                    <div 
                      className="w-4 h-4 rounded border flex-shrink-0" 
                      style={{ backgroundColor: room.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{room.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {room.width}m × {room.depth}m
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoom(room.id, room.name);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Room Editor Form */}
        <div className="flex-1 p-4 overflow-auto">
          {selectedRoom ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Raum bearbeiten</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={editValues.name || ""}
                      onChange={(e) => updateEditValue("name", e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="position_x">Position X (m)</Label>
                    <Input
                      id="position_x"
                      type="number"
                      step="0.5"
                      value={editValues.position_x ?? 0}
                      onChange={(e) => updateEditValue("position_x", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="position_y">Position Y (m)</Label>
                    <Input
                      id="position_y"
                      type="number"
                      step="0.5"
                      value={editValues.position_y ?? 0}
                      onChange={(e) => updateEditValue("position_y", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="width">Breite (m)</Label>
                    <Input
                      id="width"
                      type="number"
                      step="0.5"
                      min="1"
                      value={editValues.width ?? 4}
                      onChange={(e) => updateEditValue("width", parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="depth">Tiefe (m)</Label>
                    <Input
                      id="depth"
                      type="number"
                      step="0.5"
                      min="1"
                      value={editValues.depth ?? 4}
                      onChange={(e) => updateEditValue("depth", parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="wall_height">Wandhöhe (m)</Label>
                    <Input
                      id="wall_height"
                      type="number"
                      step="0.1"
                      min="2"
                      max="10"
                      value={editValues.wall_height ?? 2.8}
                      onChange={(e) => updateEditValue("wall_height", parseFloat(e.target.value) || 2.8)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="color">Wandfarbe</Label>
                    <div className="flex gap-2">
                      <Input
                        id="color"
                        type="color"
                        value={editValues.color || "#f0f0f0"}
                        onChange={(e) => updateEditValue("color", e.target.value)}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={editValues.color || "#f0f0f0"}
                        onChange={(e) => updateEditValue("color", e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSelectedRoom(null);
                      setEditValues({});
                    }}
                  >
                    Abbrechen
                  </Button>
                  <Button onClick={handleSaveRoom} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p className="text-lg mb-2">Kein Raum ausgewählt</p>
              <p className="text-sm">
                Wählen Sie einen Raum aus der Liste oder erstellen Sie einen neuen
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
