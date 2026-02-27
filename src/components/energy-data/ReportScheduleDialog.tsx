import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { ReportScheduleInsert } from "@/hooks/useReportSchedules";
import type { Location } from "@/hooks/useLocations";

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom", gas: "Gas", waerme: "Wärme", wasser: "Wasser",
};
const FREQ_LABELS: Record<string, string> = {
  daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich", quarterly: "Quartalsweise", yearly: "Jährlich",
};
const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF", csv: "CSV", both: "PDF & CSV",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ReportScheduleInsert) => Promise<boolean>;
  locations: Location[];
  initial?: Partial<ReportScheduleInsert>;
  title?: string;
}

export default function ReportScheduleDialog({ open, onOpenChange, onSubmit, locations, initial, title }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? []);
  const [newEmail, setNewEmail] = useState("");
  const [frequency, setFrequency] = useState<string>(initial?.frequency ?? "monthly");
  const [format, setFormat] = useState<string>(initial?.format ?? "pdf");
  const [energyTypes, setEnergyTypes] = useState<string[]>(initial?.energy_types ?? ["strom", "gas", "waerme", "wasser"]);
  const [locationIds, setLocationIds] = useState<string[]>(initial?.location_ids ?? []);
  const [saving, setSaving] = useState(false);

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (email && email.includes("@") && !recipients.includes(email)) {
      setRecipients([...recipients, email]);
      setNewEmail("");
    }
  };

  const removeRecipient = (email: string) => setRecipients(recipients.filter((r) => r !== email));

  const toggleEnergy = (type: string) =>
    setEnergyTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);

  const toggleLocation = (id: string) =>
    setLocationIds((prev) => prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!name.trim() || recipients.length === 0 || energyTypes.length === 0) return;
    setSaving(true);
    const ok = await onSubmit({ name, recipients, frequency: frequency as any, format: format as any, energy_types: energyTypes, location_ids: locationIds });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? "Neues Report-Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Monatlicher Energiebericht" />
          </div>

          {/* Recipients */}
          <div>
            <Label>Empfänger *</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="E-Mail-Adresse"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())}
              />
              <Button type="button" size="icon" variant="outline" onClick={addRecipient}><Plus className="h-4 w-4" /></Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {recipients.map((r) => (
                  <Badge key={r} variant="secondary" className="gap-1">
                    {r}
                    <button onClick={() => removeRecipient(r)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Frequency */}
          <div>
            <Label>Frequenz</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FREQ_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Format */}
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FORMAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Energy Types */}
          <div>
            <Label>Energiearten</Label>
            <div className="space-y-2 mt-1">
              {Object.entries(ENERGY_LABELS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <Checkbox id={`rs-e-${k}`} checked={energyTypes.includes(k)} onCheckedChange={() => toggleEnergy(k)} />
                  <Label htmlFor={`rs-e-${k}`} className="text-sm cursor-pointer">{v}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* Locations */}
          <div>
            <Label>Standorte <span className="text-muted-foreground font-normal">(leer = alle)</span></Label>
            <div className="space-y-2 mt-1 max-h-40 overflow-y-auto">
              {locations.map((loc) => (
                <div key={loc.id} className="flex items-center gap-2">
                  <Checkbox id={`rs-l-${loc.id}`} checked={locationIds.includes(loc.id)} onCheckedChange={() => toggleLocation(loc.id)} />
                  <Label htmlFor={`rs-l-${loc.id}`} className="text-sm cursor-pointer">{loc.name}</Label>
                </div>
              ))}
              {locations.length === 0 && <p className="text-sm text-muted-foreground">Keine Standorte vorhanden</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim() || recipients.length === 0 || energyTypes.length === 0}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
