import { useState, useEffect } from "react";
import { useMeters } from "@/hooks/useMeters";
import { useLocationIntegrations, LocationIntegration } from "@/hooks/useIntegrations";
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
import { AlertCircle } from "lucide-react";

interface AddMeterDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SensorOption {
  uuid: string;
  name: string;
  integrationName: string;
  locationIntegrationId: string;
}

export const AddMeterDialog = ({ locationId, open, onOpenChange }: AddMeterDialogProps) => {
  const { addMeter, meters } = useMeters(locationId);
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(locationId);
  const [name, setName] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [energyType, setEnergyType] = useState("strom");
  const [unit, setUnit] = useState("kWh");
  const [medium, setMedium] = useState("");
  const [notes, setNotes] = useState("");
  const [captureType, setCaptureType] = useState<"manual" | "automatic">("manual");
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState("");
  const [parentMeterId, setParentMeterId] = useState("");
  const [isMainMeter, setIsMainMeter] = useState(false);
  const [meterFunction, setMeterFunction] = useState("consumption");

  const activeMeters = meters.filter((m) => !m.is_archived);

  const enabledIntegrations = locationIntegrations.filter((li) => li.is_enabled);

  // Fetch sensors when an integration is selected
  useEffect(() => {
    if (!selectedIntegration || captureType !== "automatic") {
      setSensors([]);
      setSelectedSensor("");
      return;
    }

    const li = enabledIntegrations.find((i) => i.id === selectedIntegration);
    if (!li) return;

    const fetchSensors = async () => {
      setSensorsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("loxone-api", {
          body: {
            action: "structure",
            config: li.config,
          },
        });

        if (error || !data?.controls) {
          setSensors([]);
        } else {
          const sensorList: SensorOption[] = [];
          const controls = data.controls as Record<string, { name: string; uuidAction: string }>;
          Object.values(controls).forEach((ctrl) => {
            if (ctrl.name && ctrl.uuidAction) {
              sensorList.push({
                uuid: ctrl.uuidAction,
                name: ctrl.name,
                integrationName: li.integration?.name || "Gateway",
                locationIntegrationId: li.id,
              });
            }
          });
          setSensors(sensorList.sort((a, b) => a.name.localeCompare(b.name)));
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
    await addMeter({
      name: name.trim(),
      location_id: locationId,
      meter_number: meterNumber || undefined,
      energy_type: energyType,
      unit,
      medium: medium || undefined,
      notes: notes || undefined,
      capture_type: captureType,
      location_integration_id: captureType === "automatic" && selectedIntegration ? selectedIntegration : undefined,
      sensor_uuid: captureType === "automatic" && selectedSensor ? selectedSensor : undefined,
    } as any, parentMeterId && parentMeterId !== "none" ? parentMeterId : null, isMainMeter, meterFunction);
    resetAndClose();
  };

  const resetAndClose = () => {
    setName("");
    setMeterNumber("");
    setEnergyType("strom");
    setUnit("kWh");
    setMedium("");
    setNotes("");
    setCaptureType("manual");
    setSelectedIntegration("");
    setSelectedSensor("");
    setSensors([]);
    setParentMeterId("");
    setIsMainMeter(false);
    setMeterFunction("consumption");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zähler anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Capture Type */}
          <div>
            <Label className="mb-2 block">Erfassungsart *</Label>
            <RadioGroup
              value={captureType}
              onValueChange={(v) => setCaptureType(v as "manual" | "automatic")}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="capture-manual" />
                <Label htmlFor="capture-manual" className="cursor-pointer font-normal">
                  Manuelle Erfassung
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="automatic" id="capture-automatic" />
                <Label htmlFor="capture-automatic" className="cursor-pointer font-normal">
                  Automatische Erfassung
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Automatic: Integration + Sensor selection */}
          {captureType === "automatic" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div>
                <Label>Datengateway *</Label>
                {integrationsLoading ? (
                  <Skeleton className="h-9 w-full mt-1" />
                ) : enabledIntegrations.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <span>Kein aktives Gateway für diesen Standort konfiguriert.</span>
                  </div>
                ) : (
                  <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Gateway auswählen" /></SelectTrigger>
                    <SelectContent>
                      {enabledIntegrations.map((li) => (
                        <SelectItem key={li.id} value={li.id}>
                          {li.integration?.name || "Gateway"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedIntegration && (
                <div>
                  <Label>Sensor zuordnen *</Label>
                  {sensorsLoading ? (
                    <Skeleton className="h-9 w-full mt-1" />
                  ) : sensors.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">Keine Sensoren gefunden.</p>
                  ) : (
                    <Select value={selectedSensor} onValueChange={setSelectedSensor}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Sensor auswählen" /></SelectTrigger>
                      <SelectContent>
                        {sensors.map((s) => (
                          <SelectItem key={s.uuid} value={s.uuid}>
                            {s.name}
                          </SelectItem>
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Hauptzähler Strom" />
          </div>
          <div>
            <Label>Zählernummer</Label>
            <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} placeholder="z.B. 12345678" />
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
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kWh" />
            </div>
          </div>
          <div>
            <Label>Medium</Label>
            <Input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="z.B. Fernwärme" />
          </div>
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
                  {activeMeters.map((m) => (
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
          <Button variant="outline" onClick={resetAndClose}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || (captureType === "automatic" && (!selectedIntegration || !selectedSensor))}
          >
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
