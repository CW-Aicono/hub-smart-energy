import { useState, useEffect, useRef } from "react";
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
import { AlertCircle, Layers, DoorOpen, Upload, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { VirtualMeterFormulaBuilder, VirtualMeterSource } from "./VirtualMeterFormulaBuilder";

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
  const [captureType, setCaptureType] = useState<"manual" | "automatic" | "virtual">(meter.capture_type as "manual" | "automatic" | "virtual");
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
  const [installationDate, setInstallationDate] = useState(meter.installation_date || "");
  const [meterOperator, setMeterOperator] = useState((meter as any).meter_operator || "");
  const [photoUrl, setPhotoUrl] = useState(meter.photo_url || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [virtualSources, setVirtualSources] = useState<VirtualMeterSource[]>([]);
  const [gasType, setGasType] = useState((meter as any).gas_type || "H");
  const [zustandszahl, setZustandszahl] = useState((meter as any).zustandszahl != null ? String((meter as any).zustandszahl).replace(".", ",") : "0,9636");
  const [brennwertVal, setBrennwertVal] = useState((meter as any).brennwert != null ? String((meter as any).brennwert).replace(".", ",") : "");
  const photoInputRef = useRef<HTMLInputElement>(null);
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
    setCaptureType(meter.capture_type as "manual" | "automatic" | "virtual");
    setSelectedIntegration(meter.location_integration_id || "");
    setSelectedSensor(meter.sensor_uuid || "");
    setParentMeterId(meter.parent_meter_id || "none");
    setIsMainMeter(meter.is_main_meter);
    setMeterFunction(meter.meter_function || "consumption");
    setSelectedFloorId(meter.floor_id || "");
    setSelectedRoomId(meter.room_id || "");
    setInstallationDate(meter.installation_date || "");
    setMeterOperator((meter as any).meter_operator || "");
    setPhotoUrl(meter.photo_url || "");
    setGasType((meter as any).gas_type || "H");
    setZustandszahl((meter as any).zustandszahl != null ? String((meter as any).zustandszahl).replace(".", ",") : "0,9636");
    setBrennwertVal((meter as any).brennwert != null ? String((meter as any).brennwert).replace(".", ",") : "");
    // Load virtual sources
    if (meter.capture_type === "virtual") {
      supabase
        .from("virtual_meter_sources")
        .select("source_meter_id, operator")
        .eq("virtual_meter_id", meter.id)
        .order("sort_order")
        .then(({ data }) => {
          setVirtualSources((data as VirtualMeterSource[]) || []);
        });
    } else {
      setVirtualSources([]);
    }
  }, [meter]);

  // Auto-set unit when energy type changes (user interaction, not initial load)
  const initialEnergyTypeRef = useRef(meter.energy_type);
  useEffect(() => {
    // Only auto-set if user actively changed the energy type (not on initial render)
    if (energyType === initialEnergyTypeRef.current) return;
    initialEnergyTypeRef.current = energyType;
    if (energyType === "gas") setUnit("m³");
    else if (energyType === "wasser") setUnit("m³");
    else setUnit("kWh");
  }, [energyType]);

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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fileName = `${meter.id}-${Date.now()}.${file.name.split(".").pop()}`;
      const { data, error } = await supabase.storage.from("meter-photos").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("meter-photos").getPublicUrl(data.path);
      setPhotoUrl(`${urlData.publicUrl}?t=${Date.now()}`);
      toast.success("Foto hochgeladen");
    } catch {
      toast.error("Foto-Upload fehlgeschlagen");
    }
    setUploadingPhoto(false);
  };

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
      installation_date: installationDate || undefined,
      meter_operator: meterOperator || undefined,
      photo_url: photoUrl || undefined,
      ...(energyType === "gas" ? {
        gas_type: gasType,
        zustandszahl: zustandszahl ? parseFloat(zustandszahl.replace(",", ".")) : null,
        brennwert: brennwertVal ? parseFloat(brennwertVal.replace(",", ".")) : null,
      } : { gas_type: null, zustandszahl: null, brennwert: null }),
    } as any);

    // Update virtual sources
    if (captureType === "virtual") {
      await supabase.from("virtual_meter_sources").delete().eq("virtual_meter_id", meter.id);
      if (virtualSources.length > 0) {
        const rows = virtualSources.map((s, i) => ({
          virtual_meter_id: meter.id,
          source_meter_id: s.source_meter_id,
          operator: s.operator,
          sort_order: i,
        }));
        await supabase.from("virtual_meter_sources").insert(rows as any);
      }
    } else {
      // Clean up old virtual sources if switching away from virtual
      await supabase.from("virtual_meter_sources").delete().eq("virtual_meter_id", meter.id);
    }

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
              onValueChange={(v) => setCaptureType(v as "manual" | "automatic" | "virtual")}
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="edit-capture-manual" />
                <Label htmlFor="edit-capture-manual" className="cursor-pointer font-normal">Manuelle Erfassung</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="automatic" id="edit-capture-automatic" />
                <Label htmlFor="edit-capture-automatic" className="cursor-pointer font-normal">Automatische Erfassung</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="virtual" id="edit-capture-virtual" />
                <Label htmlFor="edit-capture-virtual" className="cursor-pointer font-normal">Virtueller Zähler</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Virtual: Formula builder */}
          {captureType === "virtual" && (
            <VirtualMeterFormulaBuilder
              sources={virtualSources}
              onSourcesChange={setVirtualSources}
              availableMeters={allMeters.filter((m) => !m.is_archived && m.id !== meter.id)}
            />
          )}

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
              {energyType === "gas" ? (
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="m³">m³</SelectItem>
                    <SelectItem value="kWh">kWh</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
              )}
            </div>
          </div>
          <div>
            <Label>Medium</Label>
            <Input value={medium} onChange={(e) => setMedium(e.target.value)} />
          </div>
          {/* Gas-specific fields */}
          {energyType === "gas" && unit === "m³" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <p className="text-sm font-medium text-muted-foreground">Gas-Parameter</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Gasart *</Label>
                  <Select value={gasType} onValueChange={setGasType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="H">H-Gas (hochkalorisch)</SelectItem>
                      <SelectItem value="L">L-Gas (niederkalorisch)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Zustandszahl</Label>
                  <Input value={zustandszahl} onChange={(e) => setZustandszahl(e.target.value)} placeholder="0,9636" className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-0.5">In der Regel &lt; 1</p>
                </div>
              </div>
              <div>
                <Label>Brennwert (kWh/m³)</Label>
                <Input value={brennwertVal} onChange={(e) => setBrennwertVal(e.target.value)} placeholder={gasType === "H" ? "11,5" : "8,9"} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Leer = Standardwert ({gasType === "H" ? "11,5" : "8,9"} kWh/m³)</p>
              </div>
            </div>
          )}
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
          {/* Photo, Installation Date, Operator */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <p className="text-sm font-medium text-muted-foreground">Zusatzinformationen</p>
            <div>
              <Label>Foto</Label>
              {photoUrl && (
                <div className="mt-1 mb-2 rounded-lg overflow-hidden border">
                  <img src={photoUrl} alt="Zählerfoto" className="w-full h-32 object-cover" />
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {photoUrl ? "Foto ändern" : "Foto hochladen"}
                </Button>
                {photoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl("")}>Entfernen</Button>
                )}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
            <div>
              <Label>Installationsdatum</Label>
              <Input type="date" value={installationDate} onChange={(e) => setInstallationDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Messstellenbetreiber</Label>
              <Input value={meterOperator} onChange={(e) => setMeterOperator(e.target.value)} placeholder="z.B. Netzbetreiber GmbH" className="mt-1" />
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
