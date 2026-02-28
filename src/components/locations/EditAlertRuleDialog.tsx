import { useState, useEffect } from "react";
import { AlertRule } from "@/hooks/useAlertRules";
import { useTranslation } from "@/hooks/useTranslation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditAlertRuleDialogProps {
  rule: AlertRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<AlertRule>) => Promise<void>;
}

const UNIT_OPTIONS: Record<string, { label: string; units: { value: string; label: string }[] }> = {
  strom: { label: "Strom", units: [{ value: "kWh", label: "kWh" }, { value: "MWh", label: "MWh" }, { value: "W", label: "W" }, { value: "kW", label: "kW" }] },
  gas: { label: "Gas", units: [{ value: "kWh", label: "kWh" }, { value: "m³", label: "m³" }] },
  waerme: { label: "Wärme", units: [{ value: "kWh", label: "kWh" }, { value: "MWh", label: "MWh" }] },
  wasser: { label: "Wasser", units: [{ value: "m³", label: "m³" }, { value: "l", label: "Liter" }] },
};

const TIME_UNITS = [
  { value: "hour", label: "Stunde" },
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
];

export const EditAlertRuleDialog = ({ rule, open, onOpenChange, onSave }: EditAlertRuleDialogProps) => {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [name, setName] = useState(rule.name);
  const [energyType, setEnergyType] = useState(rule.energy_type);
  const [thresholdValue, setThresholdValue] = useState(String(rule.threshold_value));
  const [thresholdType, setThresholdType] = useState(rule.threshold_type);
  const [thresholdUnit, setThresholdUnit] = useState(rule.threshold_unit || "kWh");
  const [timeUnit, setTimeUnit] = useState(rule.time_unit || "month");
  const [email, setEmail] = useState(rule.notification_email || "");

  useEffect(() => {
    setName(rule.name);
    setEnergyType(rule.energy_type);
    setThresholdValue(String(rule.threshold_value));
    setThresholdType(rule.threshold_type);
    setThresholdUnit(rule.threshold_unit || "kWh");
    setTimeUnit(rule.time_unit || "month");
    setEmail(rule.notification_email || "");
  }, [rule]);

  const availableUnits = UNIT_OPTIONS[energyType]?.units || [{ value: "kWh", label: "kWh" }];

  const handleEnergyTypeChange = (val: string) => {
    setEnergyType(val);
    const units = UNIT_OPTIONS[val]?.units || [];
    if (!units.find((u) => u.value === thresholdUnit)) {
      setThresholdUnit(units[0]?.value || "kWh");
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !thresholdValue) return;
    await onSave(rule.id, {
      name: name.trim(),
      energy_type: energyType,
      threshold_value: parseFloat(thresholdValue),
      threshold_type: thresholdType,
      threshold_unit: thresholdUnit,
      time_unit: timeUnit,
      notification_email: email || null,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alarmregel bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Energieart</Label>
              <Select value={energyType} onValueChange={handleEnergyTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strom">{T("energy.strom")}</SelectItem>
                  <SelectItem value="gas">{T("energy.gas")}</SelectItem>
                  <SelectItem value="waerme">{T("energy.waerme")}</SelectItem>
                  <SelectItem value="wasser">{T("energy.wasser")}</SelectItem>
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Schwellenwert *</Label>
              <Input type="number" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} />
            </div>
            <div>
              <Label>Einheit</Label>
              <Select value={thresholdUnit} onValueChange={setThresholdUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableUnits.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zeiteinheit</Label>
              <Select value={timeUnit} onValueChange={setTimeUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_UNITS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Benachrichtigungs-E-Mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !thresholdValue}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
