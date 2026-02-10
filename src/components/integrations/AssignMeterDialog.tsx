import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Layers, DoorOpen, MapPin } from "lucide-react";

interface AssignMeterSensor {
  id: string;
  name: string;
  controlType?: string;
  unit: string;
}

interface AssignMeterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor: AssignMeterSensor;
  locationIntegrationId: string;
  currentLocationId: string;
}

interface Floor {
  id: string;
  name: string;
  floor_number: number;
}

interface Room {
  id: string;
  name: string;
}

export function AssignMeterDialog({
  open,
  onOpenChange,
  sensor,
  locationIntegrationId,
  currentLocationId,
}: AssignMeterDialogProps) {
  const { locations } = useLocations();
  const { addMeter } = useMeters();

  const [name, setName] = useState(sensor.name);
  const [energyType, setEnergyType] = useState("strom");
  const [unit, setUnit] = useState(sensor.unit || "kWh");
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId);
  const [selectedFloorId, setSelectedFloorId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [saving, setSaving] = useState(false);

  // Build hierarchical location list: complexes with their children
  const locationOptions = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    type: loc.type,
    parentId: loc.parent_id,
  }));

  // Fetch floors when location changes
  useEffect(() => {
    if (!selectedLocationId) {
      setFloors([]);
      setSelectedFloorId("");
      setRooms([]);
      setSelectedRoomId("");
      return;
    }

    const fetchFloors = async () => {
      const { data } = await supabase
        .from("floors")
        .select("id, name, floor_number")
        .eq("location_id", selectedLocationId)
        .order("floor_number");
      setFloors((data as Floor[]) || []);
      setSelectedFloorId("");
      setRooms([]);
      setSelectedRoomId("");
    };
    fetchFloors();
  }, [selectedLocationId]);

  // Fetch rooms when floor changes
  useEffect(() => {
    if (!selectedFloorId) {
      setRooms([]);
      setSelectedRoomId("");
      return;
    }

    const fetchRooms = async () => {
      const { data } = await supabase
        .from("floor_rooms")
        .select("id, name")
        .eq("floor_id", selectedFloorId)
        .order("name");
      setRooms((data as Room[]) || []);
      setSelectedRoomId("");
    };
    fetchRooms();
  }, [selectedFloorId]);

  // Reset form when sensor changes
  useEffect(() => {
    setName(sensor.name);
    setUnit(sensor.unit || "kWh");
    setSelectedLocationId(currentLocationId);
  }, [sensor, currentLocationId]);

  const handleSubmit = async () => {
    if (!name.trim() || !selectedLocationId) return;
    setSaving(true);

    try {
      await addMeter({
        name: name.trim(),
        location_id: selectedLocationId,
        energy_type: energyType,
        unit,
        capture_type: "automatic",
        location_integration_id: locationIntegrationId,
        sensor_uuid: sensor.id,
      });

      // If floor or room was selected, update the meter with those values
      if (selectedFloorId || selectedRoomId) {
        // Find the just-created meter by sensor_uuid
        const { data: createdMeter } = await supabase
          .from("meters")
          .select("id")
          .eq("sensor_uuid", sensor.id)
          .eq("location_integration_id", locationIntegrationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (createdMeter) {
          const updates: Record<string, string | null> = {};
          if (selectedFloorId) updates.floor_id = selectedFloorId;
          if (selectedRoomId) updates.room_id = selectedRoomId;
          await supabase.from("meters").update(updates).eq("id", createdMeter.id);
        }
      }

      toast.success(`Zähler "${name}" erfolgreich zugeordnet`);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to assign meter:", err);
      toast.error("Zuordnung fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zähler zuordnen</DialogTitle>
          <DialogDescription>
            Ordnen Sie den Zähler „{sensor.name}" einer Messstelle zu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label>Bezeichnung *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Hauptzähler Strom"
            />
          </div>

          {/* Energy type + Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Energieart</Label>
              <Select value={energyType} onValueChange={setEnergyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strom">Strom</SelectItem>
                  <SelectItem value="gas">Gas</SelectItem>
                  <SelectItem value="waerme">Wärme</SelectItem>
                  <SelectItem value="wasser">Wasser</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Einheit</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kWh"
              />
            </div>
          </div>

          {/* Hierarchical assignment */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <p className="text-sm font-medium text-muted-foreground">Zuordnung</p>

            {/* Location */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1">
                <MapPin className="h-3.5 w-3.5" />
                Liegenschaft *
              </Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Liegenschaft wählen" />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.parentId ? "  └ " : ""}{loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Floor */}
            {floors.length > 0 && (
              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Layers className="h-3.5 w-3.5" />
                  Etage
                </Label>
                <Select value={selectedFloorId} onValueChange={setSelectedFloorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional: Etage wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Room */}
            {rooms.length > 0 && selectedFloorId && (
              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <DoorOpen className="h-3.5 w-3.5" />
                  Raum
                </Label>
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional: Raum wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !selectedLocationId || saving}>
            {saving ? "Wird zugeordnet..." : "Zuordnen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
