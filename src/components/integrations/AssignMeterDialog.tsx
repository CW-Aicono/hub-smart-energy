import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
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
  /** Pre-classified device type from the discovery dialog */
  deviceType?: "meter" | "sensor" | "actuator";
}

interface AssignMeterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Support single or multiple sensors */
  sensor?: AssignMeterSensor;
  sensors?: AssignMeterSensor[];
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
  sensors: sensorsProp,
  locationIntegrationId,
  currentLocationId,
}: AssignMeterDialogProps) {
  // Support both single sensor (legacy) and multiple sensors
  const sensorList = sensorsProp || (sensor ? [sensor] : []);

  const { locations } = useLocations();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { addMeter } = useMeters();

  const [energyType, setEnergyType] = useState("strom");
  // Whether all selected devices share the same pre-classified type.
  // If they do, we skip the manual device-type picker entirely – the
  // assignment then preserves the per-device classification from the
  // "Gefundene Geräte"-Dialog.
  const uniformDeviceType: "meter" | "sensor" | "actuator" | null = (() => {
    if (sensorList.length === 0) return null;
    const first = sensorList[0].deviceType;
    if (!first) return null;
    return sensorList.every((s) => s.deviceType === first) ? first : null;
  })();
  const allMeters = sensorList.length > 0 && sensorList.every((s) => s.deviceType === "meter");
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId);
  const [selectedFloorId, setSelectedFloorId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [saving, setSaving] = useState(false);

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
      const floorList = (data as Floor[]) || [];
      setFloors(floorList);
      // Auto-select if only one floor exists
      if (floorList.length === 1) {
        setSelectedFloorId(floorList[0].id);
      } else {
        setSelectedFloorId("");
      }
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

  useEffect(() => {
    setSelectedLocationId(currentLocationId);
  }, [currentLocationId]);

  const handleSubmit = async () => {
    if (!selectedLocationId || sensorList.length === 0) return;
    setSaving(true);

    try {
      for (const s of sensorList) {
        const dt: "meter" | "sensor" | "actuator" = s.deviceType ?? "sensor";
        await addMeter({
          name: s.name.trim(),
          location_id: selectedLocationId,
          energy_type: energyType,
          unit: s.unit || (dt === "meter" ? "kWh" : ""),
          capture_type: "automatic",
          device_type: dt,
          location_integration_id: locationIntegrationId,
          sensor_uuid: s.id,
        });

        // If floor or room was selected, update the meter
        if (selectedFloorId || selectedRoomId) {
          const { data: createdMeter } = await supabase
            .from("meters")
            .select("id")
            .eq("sensor_uuid", s.id)
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
      }

      const count = sensorList.length;
      const typeLabel = uniformDeviceType === "meter"
        ? "Zähler"
        : uniformDeviceType === "actuator"
          ? "Aktor"
          : uniformDeviceType === "sensor"
            ? "Sensor"
            : "Gerät";
      const pluralLabel = uniformDeviceType === "meter"
        ? "Zähler"
        : uniformDeviceType === "actuator"
          ? "Aktoren"
          : uniformDeviceType === "sensor"
            ? "Sensoren"
            : "Geräte";
      toast.success(count === 1
        ? `${typeLabel} "${sensorList[0].name}" erfolgreich zugeordnet`
        : `${count} ${pluralLabel} erfolgreich zugeordnet`
      );
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
          <DialogTitle>
            {sensorList.length === 1 ? "Gerät zuordnen" : `${sensorList.length} Geräte zuordnen`}
          </DialogTitle>
          <DialogDescription>
            {sensorList.length === 1
              ? `Ordnen Sie „${sensorList[0].name}" einem Standort zu.`
              : `Ordnen Sie ${sensorList.length} ausgewählte Geräte einem Standort zu.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sensor list preview for bulk */}
          {sensorList.length > 1 && (
            <div className="rounded-md border p-3 bg-muted/30 max-h-32 overflow-auto">
              <p className="text-xs font-medium text-muted-foreground mb-1">Ausgewählte Geräte:</p>
              <ul className="text-sm space-y-0.5">
                {sensorList.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Energy type – relevant for meters AND for sensors/actuators
              that measure or switch a specific energy medium */}
          <div>
            <Label>Energieart</Label>
            <Select value={energyType} onValueChange={setEnergyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strom">{T("energy.strom")}</SelectItem>
                <SelectItem value="gas">{T("energy.gas")}</SelectItem>
                <SelectItem value="waerme">{T("energy.waerme")}</SelectItem>
                <SelectItem value="wasser">{T("energy.wasser")}</SelectItem>
                <SelectItem value="none">Keine / Sonstige</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Gilt für alle ausgewählten Geräte. Kann später je Gerät angepasst werden.
            </p>
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
          <Button onClick={handleSubmit} disabled={!selectedLocationId || saving}>
            {saving ? "Wird zugeordnet..." : sensorList.length === 1 ? "Zuordnen" : `${sensorList.length} Zuordnen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
