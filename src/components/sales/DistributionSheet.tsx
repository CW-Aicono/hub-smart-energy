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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Distribution {
  id: string;
  name: string;
  typ: string;
  standort: string | null;
  notizen: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projektId: string;
  editing: Distribution | null;
  onSaved: () => void;
}

export function DistributionSheet({ open, onOpenChange, projektId, editing, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", typ: "NSHV", standort: "", notizen: "" });

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? "",
        typ: editing?.typ ?? "NSHV",
        standort: editing?.standort ?? "",
        notizen: editing?.notizen ?? "",
      });
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    setLoading(true);
    if (editing) {
      const { error } = await supabase
        .from("sales_distributions")
        .update({
          name: form.name.trim(),
          typ: form.typ,
          standort: form.standort.trim() || null,
          notizen: form.notizen.trim() || null,
        })
        .eq("id", editing.id);
      setLoading(false);
      if (error) {
        toast.error("Speichern fehlgeschlagen", { description: error.message });
        return;
      }
      toast.success("Verteilung aktualisiert");
    } else {
      const { error } = await supabase.from("sales_distributions").insert({
        project_id: projektId,
        name: form.name.trim(),
        typ: form.typ,
        standort: form.standort.trim() || null,
        notizen: form.notizen.trim() || null,
      });
      setLoading(false);
      if (error) {
        toast.error("Speichern fehlgeschlagen", { description: error.message });
        return;
      }
      toast.success("Verteilung angelegt");
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] sm:h-auto sm:max-w-lg sm:mx-auto rounded-t-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Verteilung bearbeiten" : "Neue Verteilung"}</SheetTitle>
          <SheetDescription>NSHV (Hauptverteilung) oder UV (Unterverteilung).</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="dist_name">Bezeichnung *</Label>
            <Input
              id="dist_name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z. B. NSHV EG"
            />
          </div>
          <div>
            <Label htmlFor="dist_typ">Typ</Label>
            <select
              id="dist_typ"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.typ}
              onChange={(e) => setForm({ ...form, typ: e.target.value })}
            >
              <option value="NSHV">NSHV (Hauptverteilung)</option>
              <option value="UV">UV (Unterverteilung)</option>
              <option value="ZS">Zählerschrank</option>
              <option value="MS">MS (Mittelspannung)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="dist_standort">Standort</Label>
            <Input
              id="dist_standort"
              value={form.standort}
              onChange={(e) => setForm({ ...form, standort: e.target.value })}
              placeholder="z. B. Keller, Raum 0.12"
            />
          </div>
          <div>
            <Label htmlFor="dist_notizen">Hinweise</Label>
            <Textarea
              id="dist_notizen"
              value={form.notizen}
              onChange={(e) => setForm({ ...form, notizen: e.target.value })}
              placeholder="Zugänglichkeit, Auffälligkeiten..."
              rows={3}
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
