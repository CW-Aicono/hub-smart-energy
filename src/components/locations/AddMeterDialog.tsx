import { useState } from "react";
import { useMeters } from "@/hooks/useMeters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface AddMeterDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddMeterDialog = ({ locationId, open, onOpenChange }: AddMeterDialogProps) => {
  const { addMeter } = useMeters(locationId);
  const [name, setName] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [energyType, setEnergyType] = useState("strom");
  const [unit, setUnit] = useState("kWh");
  const [medium, setMedium] = useState("");
  const [notes, setNotes] = useState("");

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
    });
    resetAndClose();
  };

  const resetAndClose = () => {
    setName("");
    setMeterNumber("");
    setEnergyType("strom");
    setUnit("kWh");
    setMedium("");
    setNotes("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zähler anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
          <div>
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
