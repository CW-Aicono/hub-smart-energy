import { useState, useEffect } from "react";
import { Meter, MeterInsert } from "@/hooks/useMeters";
import { useMeters } from "@/hooks/useMeters";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Layers, DoorOpen } from "lucide-react";

interface Floor {
  id: string;
  name: string;
  floor_number: number;
}

interface Room {
  id: string;
  name: string;
}

interface EditMeterDialogProps {
  meter: Meter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<MeterInsert>) => Promise<void>;
}

interface SensorOption {
  uuid: string;
  name: string;
}

export const EditMeterDialog = ({ meter, open, onOpenChange, onSave }: EditMeterDialogProps) => {
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(meter.location_id);
  const { meters: allMeters } = useMeters(meter.location_id);
  const [name, setName] = useState(meter.name);
  const [meterNumber, setMeterNumber] = useState(meter.meter_number || "");
  const [energyType, setEnergyType] = useState(meter.energy_type);
  const [unit, setUnit] = useState(meter.unit);
  const [medium, setMedium] = useState(meter.medium || "");
  const [notes, setNotes] = useState(meter.notes || "");
  const [captureType, setCaptureType] = useState<"manual" | "automatic">(meter.capture_type as "manual" | "automatic");
  const [selectedIntegration, setSelectedIntegration] = useState(meter.location_integration_id || "");
  const [selectedSensor, setSelectedSensor] = useState(meter.sensor_uuid || "");
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parentMeterId, setParentMeterId] = useState(meter.parent_meter_id || "none");
  const [isMainMeter, setIsMainMeter] = useState(meter.is_main_meter);
  const [meterFunction, setMeterFunction] = useState(meter.meter_function || "consumption");
  const [selectedFloorId, setSelectedFloorId] = useState(meter.floor_id || "");
  const [selectedRoomId, setSelectedRoomId] = useState(meter.room_id || "");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  // Available parents: all active meters except self and descendants
  const availableParents = allMeters.filter((m) => !m.is_archived && m.id !== meter.id);

  const enabledIntegrations = locationIntegrations.filter((li) => li.is_enabled);

  // Resolve sensor display name from fetched list or meter name as fallback
  const sensorDisplayName = sensors.find((s) => s.uuid === selectedSensor)?.name || meter.name || selectedSensor;

  // Reset form when meter changes
  useEffect(() => {
    setName(meter.name);
    setMeterNumber(meter.meter_number || "");
    setEnergyType(meter.energy_type);
    setUnit(meter.unit);
    setMedium(meter.medium || "");
    setNotes(meter.notes || "");
    setCaptureType(meter.capture_type as "manual" | "automatic");
    setSelectedIntegration(meter.location_integration_id || "");
    setSelectedSensor(meter.sensor_uuid || "");
    setParentMeterId(meter.parent_meter_id || "none");
    setIsMainMeter(meter.is_main_meter);
    setMeterFunction(meter.meter_function || "consumption");
    setSelectedFloorId(meter.floor_id || "");
    setSelectedRoomId(meter.room_id || "");
  }, [meter]);

  // Fetch floors for the location
  useEffect(() => {
    if (!meter.location_id) { setFloors([]); return; }
    const fetchFloors = async () => {
      const { data } = await supabase
        .from("floors")
        .select("id, name, floor_number")
        .eq("location_id", meter.location_id)
        .order("floor_number");
      const list = (data as Floor[]) || [];
      setFloors(list);
      // Auto-select if only one floor and no floor set
      if (list.length === 1 && !meter.floor_id) {
        setSelectedFloorId(list[0].id);
      }
    };
    fetchFloors();
  }, [meter.location_id, meter.floor_id]);

  // Fetch rooms when floor changes
  useEffect(() => {
    if (!selectedFloorId) { setRooms([]); setSelectedRoomId((prev) => prev ? "" : prev); return; }
    const fetchRooms = async () => {
      const { data } = await supabase
        .from("floor_rooms")
        .select("id, name")
        .eq("floor_id", selectedFloorId)
        .order("name");
      const list = (data as Room[]) || [];
      setRooms(list);
      // Auto-select if only one room and no room previously set
      if (list.length === 1 && !meter.room_id) {
        setSelectedRoomId(list[0].id);
      } else if (!list.find((r) => r.id === selectedRoomId)) {
        setSelectedRoomId("");
      }
    };
    fetchRooms();
  }, [selectedFloorId]);

  // Fetch sensors when integration selected
  useEffect(() => {
    if (!selectedIntegration || captureType !== "automatic") {
      setSensors([]);
      return;
    }
    const li = enabledIntegrations.find((i) => i.id === selectedIntegration);
    if (!li) return;

    const fetchSensors = async () => {
      setSensorsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("loxone-api", {
          body: { action: "structure", config: li.config },
        });
        if (error || !data?.controls) {
          setSensors([]);
        } else {
          const list: SensorOption[] = [];
          const controls = data.controls as Record<string, { name: string; uuidAction: string }>;
          Object.values(controls).forEach((ctrl) => {
            if (ctrl.name && ctrl.uuidAction) list.push({ uuid: ctrl.uuidAction, name: ctrl.name });
          });
          setSensors(list.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        setSensors([]);
      } finally {
        setSensorsLoading(false);
      }
    };
    fetchSensors();
  }, [selectedIntegration, captureType]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(meter.id, {
      name: name.trim(),
      meter_number: meterNumber || undefined,
      energy_type: energyType,
      unit,
      medium: medium || undefined,
      notes: notes || undefined,
      capture_type: captureType,
      location_integration_id: captureType === "automatic" && selectedIntegration ? selectedIntegration : undefined,
      sensor_uuid: captureType === "automatic" && selectedSensor ? selectedSensor : undefined,
      parent_meter_id: parentMeterId && parentMeterId !== "none" ? parentMeterId : null,
      is_main_meter: isMainMeter,
      meter_function: meterFunction,
      floor_id: selectedFloorId || null,
      room_id: selectedRoomId || null,
    } as any);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Zähler bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div>
            <Label className="mb-2 block">Erfassungsart *</Label>
            <RadioGroup
              value={captureType}
              onValueChange={(v) => setCaptureType(v as "manual" | "automatic")}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="edit-capture-manual" />
                <Label htmlFor="edit-capture-manual" className="cursor-pointer font-normal">Manuelle Erfassung</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="automatic" id="edit-capture-automatic" />
                <Label htmlFor="edit-capture-automatic" className="cursor-pointer font-normal">Automatische Erfassung</Label>
              </div>
            </RadioGroup>
          </div>

          {captureType === "automatic" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div>
                <Label>Datengateway *</Label>
                {integrationsLoading ? (
                  <Skeleton className="h-9 w-full mt-1" />
                ) : enabledIntegrations.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <span>Kein aktives Gateway konfiguriert.</span>
                  </div>
                ) : (
                  <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Gateway auswählen" /></SelectTrigger>
                    <SelectContent>
                      {enabledIntegrations.map((li) => (
                        <SelectItem key={li.id} value={li.id}>{li.integration?.name || "Gateway"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedIntegration && (
                <div>
                  <Label>Sensor *</Label>
                  {sensorsLoading ? (
                    <Skeleton className="h-9 w-full mt-1" />
                  ) : sensors.length === 0 && selectedSensor ? (
                    <p className="text-sm mt-1">{sensorDisplayName}</p>
                  ) : sensors.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">Keine Sensoren gefunden.</p>
                  ) : (
                    <Select value={selectedSensor} onValueChange={setSelectedSensor}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Sensor auswählen" /></SelectTrigger>
                      <SelectContent>
                        {sensors.map((s) => (
                          <SelectItem key={s.uuid} value={s.uuid}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Zählernummer</Label>
            <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Energieart</Label>
              <Select value={energyType} onValueChange={setEnergyType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Medium</Label>
            <Input value={medium} onChange={(e) => setMedium(e.target.value)} />
          </div>
          {/* Floor & Room assignment */}
          {floors.length > 0 && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <p className="text-sm font-medium text-muted-foreground">Zuordnung</p>
              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Layers className="h-3.5 w-3.5" />
                  Etage
                </Label>
                <Select value={selectedFloorId} onValueChange={(v) => { setSelectedFloorId(v); setSelectedRoomId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Etage wählen" /></SelectTrigger>
                  <SelectContent>
                    {floors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {rooms.length > 0 && selectedFloorId && (
                <div>
                  <Label className="flex items-center gap-1.5 mb-1">
                    <DoorOpen className="h-3.5 w-3.5" />
                    Raum
                  </Label>
                  <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                    <SelectTrigger><SelectValue placeholder="Optional: Raum wählen" /></SelectTrigger>
                    <SelectContent>
                      {rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {/* Hierarchy */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label>Hauptzähler (Netzübergabepunkt)</Label>
              <Switch checked={isMainMeter} onCheckedChange={setIsMainMeter} />
            </div>
            <div>
              <Label>Zählerfunktion</Label>
              <Select value={meterFunction} onValueChange={setMeterFunction}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumption">Verbrauch</SelectItem>
                  <SelectItem value="generation">Erzeugung (z.B. PV)</SelectItem>
                  <SelectItem value="technical">Technisch (z.B. Wärmepumpe)</SelectItem>
                  <SelectItem value="bidirectional">Bidirektional (Bezug & Einspeisung)</SelectItem>
                  <SelectItem value="submeter">Unterzähler</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Übergeordneter Zähler</Label>
              <Select value={parentMeterId} onValueChange={setParentMeterId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Kein (Hauptzähler)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein übergeordneter Zähler</SelectItem>
                  {availableParents.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || saving || (captureType === "automatic" && (!selectedIntegration || !selectedSensor))}
          >
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
