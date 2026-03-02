import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { EnergyMeasureInsert } from "@/hooks/useEnergyMeasures";

interface AddMeasureDialogProps {
  locationId: string;
  onSave: (measure: EnergyMeasureInsert) => void;
}

const CATEGORIES = [
  { value: "daemmung", label: "Dämmung" },
  { value: "beleuchtung", label: "Beleuchtung (LED)" },
  { value: "heizung", label: "Heizungsmodernisierung" },
  { value: "pv", label: "Photovoltaik" },
  { value: "steuerung", label: "Regelungstechnik" },
  { value: "fenster", label: "Fenster/Verglasung" },
  { value: "sonstiges", label: "Sonstiges" },
];

export function AddMeasureDialog({ locationId, onSave }: AddMeasureDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("sonstiges");
  const [status, setStatus] = useState("planned");
  const [implDate, setImplDate] = useState("");
  const [investCost, setInvestCost] = useState("");
  const [savingsKwh, setSavingsKwh] = useState("");
  const [savingsEur, setSavingsEur] = useState("");

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      location_id: locationId,
      title: title.trim(),
      description: description.trim() || null,
      category,
      status,
      implementation_date: implDate || null,
      investment_cost: investCost ? parseFloat(investCost) : null,
      estimated_annual_savings_kwh: savingsKwh ? parseFloat(savingsKwh) : null,
      estimated_annual_savings_eur: savingsEur ? parseFloat(savingsEur) : null,
      energy_type: null,
    });
    setOpen(false);
    setTitle(""); setDescription(""); setCategory("sonstiges"); setStatus("planned");
    setImplDate(""); setInvestCost(""); setSavingsKwh(""); setSavingsEur("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Maßnahme hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Energetische Maßnahme erfassen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label>Titel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. LED-Umrüstung Sporthalle" />
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Kategorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Geplant</SelectItem>
                  <SelectItem value="in_progress">In Umsetzung</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Umsetzungsdatum</Label>
            <Input type="date" value={implDate} onChange={(e) => setImplDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Investition (€)</Label>
              <Input type="number" value={investCost} onChange={(e) => setInvestCost(e.target.value)} />
            </div>
            <div>
              <Label>Einsparung (kWh/a)</Label>
              <Input type="number" value={savingsKwh} onChange={(e) => setSavingsKwh(e.target.value)} />
            </div>
            <div>
              <Label>Einsparung (€/a)</Label>
              <Input type="number" value={savingsEur} onChange={(e) => setSavingsEur(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleSave} disabled={!title.trim()}>Speichern</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
