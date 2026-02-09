import { useState } from "react";
import { useAlertRules } from "@/hooks/useAlertRules";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddAlertRuleDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddAlertRuleDialog = ({ locationId, open, onOpenChange }: AddAlertRuleDialogProps) => {
  const { addAlertRule } = useAlertRules(locationId);
  const [name, setName] = useState("");
  const [energyType, setEnergyType] = useState("strom");
  const [thresholdValue, setThresholdValue] = useState("");
  const [thresholdType, setThresholdType] = useState("above");
  const [email, setEmail] = useState("");

  const handleSubmit = async () => {
    if (!name.trim() || !thresholdValue) return;
    await addAlertRule({
      name: name.trim(),
      location_id: locationId,
      energy_type: energyType,
      threshold_value: parseFloat(thresholdValue),
      threshold_type: thresholdType,
      notification_email: email || undefined,
    });
    resetAndClose();
  };

  const resetAndClose = () => {
    setName("");
    setEnergyType("strom");
    setThresholdValue("");
    setThresholdType("above");
    setEmail("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alarmregel anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Stromverbrauch zu hoch" />
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
              <Label>Schwellenwert-Typ</Label>
              <Select value={thresholdType} onValueChange={setThresholdType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Über</SelectItem>
                  <SelectItem value="below">Unter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Schwellenwert *</Label>
            <Input type="number" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} placeholder="z.B. 5000" />
          </div>
          <div>
            <Label>Benachrichtigungs-E-Mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alarm@example.de" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !thresholdValue}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
