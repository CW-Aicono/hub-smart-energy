import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface MeasurementPoint {
  id: string;
  bezeichnung: string;
  energieart: string;
  phasen: number;
  strombereich_a: number | null;
  anwendungsfall: string | null;
  hinweise: string | null;
  montage: string | null;
  bestand: boolean;
  bestand_geraet: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distributionId: string;
  editing: MeasurementPoint | null;
  onSaved: () => void;
}

const DEFAULT_FORM = {
  bezeichnung: "",
  energieart: "electricity",
  phasen: 3,
  strombereich_a: 63,
  anwendungsfall: "Hauptzähler",
  montage: "Hutschiene",
  hinweise: "",
  bestand: false,
  bestand_geraet: "",
};

export function MeasurementPointSheet({ open, onOpenChange, distributionId, editing, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              bezeichnung: editing.bezeichnung,
              energieart: editing.energieart,
              phasen: editing.phasen,
              strombereich_a: editing.strombereich_a ?? 63,
              anwendungsfall: editing.anwendungsfall ?? "Hauptzähler",
              montage: editing.montage ?? "Hutschiene",
              hinweise: editing.hinweise ?? "",
              bestand: editing.bestand,
              bestand_geraet: editing.bestand_geraet ?? "",
            }
          : DEFAULT_FORM
      );
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!form.bezeichnung.trim() || !distributionId) {
      toast.error("Bezeichnung ist erforderlich");
      return;
    }
    setLoading(true);
    const payload = {
      bezeichnung: form.bezeichnung.trim(),
      energieart: form.energieart,
      phasen: form.phasen,
      strombereich_a: form.strombereich_a,
      anwendungsfall: form.anwendungsfall,
      montage: form.montage,
      hinweise: form.hinweise.trim() || null,
      bestand: form.bestand,
      bestand_geraet: form.bestand ? form.bestand_geraet.trim() || null : null,
    };
    if (editing) {
      const { error } = await supabase
        .from("sales_measurement_points")
        .update(payload)
        .eq("id", editing.id);
      setLoading(false);
      if (error) {
        toast.error("Speichern fehlgeschlagen", { description: error.message });
        return;
      }
      toast.success("Messpunkt aktualisiert");
    } else {
      const { error } = await supabase.from("sales_measurement_points").insert({
        ...payload,
        distribution_id: distributionId,
      });
      setLoading(false);
      if (error) {
        toast.error("Speichern fehlgeschlagen", { description: error.message });
        return;
      }
      toast.success("Messpunkt angelegt");
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] sm:h-auto sm:max-w-lg sm:mx-auto rounded-t-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Messpunkt bearbeiten" : "Neuer Messpunkt"}</SheetTitle>
          <SheetDescription>Erfasse die Eigenschaften für die spätere Geräte-Empfehlung.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="mp_bez">Bezeichnung *</Label>
            <Input
              id="mp_bez"
              value={form.bezeichnung}
              onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })}
              placeholder="z. B. Abgang Werkstatt"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mp_energieart">Energieart</Label>
              <select
                id="mp_energieart"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.energieart}
                onChange={(e) => setForm({ ...form, energieart: e.target.value })}
              >
                <option value="electricity">Strom</option>
                <option value="heat">Wärme</option>
                <option value="gas">Gas</option>
                <option value="water">Wasser</option>
              </select>
            </div>
            <div>
              <Label htmlFor="mp_phasen">Phasen</Label>
              <select
                id="mp_phasen"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.phasen}
                onChange={(e) => setForm({ ...form, phasen: parseInt(e.target.value) })}
              >
                <option value={1}>1-phasig</option>
                <option value={3}>3-phasig</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mp_strom">Max. Strom (A)</Label>
              <Input
                id="mp_strom"
                type="number"
                value={form.strombereich_a}
                onChange={(e) => setForm({ ...form, strombereich_a: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="mp_montage">Montage</Label>
              <select
                id="mp_montage"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.montage}
                onChange={(e) => setForm({ ...form, montage: e.target.value })}
              >
                <option value="Hutschiene">Hutschiene</option>
                <option value="Wandlermessung">Wandlermessung</option>
                <option value="Sammelschiene">Sammelschiene</option>
                <option value="Steckdose">Steckdose</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="mp_anwendung">Anwendungsfall</Label>
            <select
              id="mp_anwendung"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.anwendungsfall}
              onChange={(e) => setForm({ ...form, anwendungsfall: e.target.value })}
            >
              <option value="Hauptzähler">Hauptzähler</option>
              <option value="Abgang">Abgang</option>
              <option value="Maschine">Maschine / Anlage</option>
              <option value="PV">PV-Erzeugung</option>
              <option value="Speicher">Speicher</option>
              <option value="Wallbox">Wallbox</option>
              <option value="Wärmepumpe">Wärmepumpe</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="mp_bestand" className="text-sm font-medium">Bestandsgerät vorhanden</Label>
              <p className="text-xs text-muted-foreground">Bereits installierte Messung</p>
            </div>
            <Switch
              id="mp_bestand"
              checked={form.bestand}
              onCheckedChange={(v) => setForm({ ...form, bestand: v })}
            />
          </div>
          {form.bestand && (
            <div>
              <Label htmlFor="mp_bestand_geraet">Bestandsgerät (Hersteller / Modell)</Label>
              <Input
                id="mp_bestand_geraet"
                value={form.bestand_geraet}
                onChange={(e) => setForm({ ...form, bestand_geraet: e.target.value })}
                placeholder="z. B. Janitza UMG 96"
              />
            </div>
          )}
          <div>
            <Label htmlFor="mp_hinweise">Hinweise</Label>
            <Textarea
              id="mp_hinweise"
              value={form.hinweise}
              onChange={(e) => setForm({ ...form, hinweise: e.target.value })}
              placeholder="Sicherungstyp, Auffälligkeiten..."
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
