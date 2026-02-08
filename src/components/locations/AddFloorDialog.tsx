import { useState } from "react";
import { useFloors } from "@/hooks/useFloors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";

interface AddFloorDialogProps {
  locationId: string;
  onSuccess?: () => void;
}

export function AddFloorDialog({ locationId, onSuccess }: AddFloorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { createFloor, uploadFloorPlan } = useFloors(locationId);
  
  const [name, setName] = useState("");
  const [floorNumber, setFloorNumber] = useState("0");
  const [description, setDescription] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);

  const resetForm = () => {
    setName("");
    setFloorNumber("0");
    setDescription("");
    setAreaSqm("");
    setFloorPlanFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein");
      return;
    }

    setLoading(true);

    try {
      const { data: floor, error } = await createFloor({
        location_id: locationId,
        name: name.trim(),
        floor_number: parseInt(floorNumber) || 0,
        description: description.trim() || null,
        area_sqm: areaSqm ? parseFloat(areaSqm) : null,
        floor_plan_url: null,
      });

      if (error) {
        toast.error("Fehler beim Erstellen der Etage");
        return;
      }

      // Upload floor plan if provided
      if (floorPlanFile && floor) {
        const { url, error: uploadError } = await uploadFloorPlan(
          floorPlanFile,
          locationId,
          floor.id
        );

        if (uploadError) {
          toast.error("Etage erstellt, aber Grundriss konnte nicht hochgeladen werden");
        } else if (url) {
          // Update floor with the URL
          const { useFloors } = await import("@/hooks/useFloors");
          const { supabase } = await import("@/integrations/supabase/client");
          await supabase.from("floors").update({ floor_plan_url: url }).eq("id", floor.id);
        }
      }

      toast.success("Etage erfolgreich erstellt");
      resetForm();
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error("Unerwarteter Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Etage hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Etage hinzufügen</DialogTitle>
          <DialogDescription>
            Fügen Sie eine neue Etage mit optionalem Grundrissplan hinzu
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Erdgeschoss"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floorNumber">Etage (Nummer)</Label>
              <Input
                id="floorNumber"
                type="number"
                value={floorNumber}
                onChange={(e) => setFloorNumber(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Negative Zahlen für Untergeschosse
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="areaSqm">Fläche (m²)</Label>
            <Input
              id="areaSqm"
              type="number"
              step="0.01"
              value={areaSqm}
              onChange={(e) => setAreaSqm(e.target.value)}
              placeholder="z.B. 150.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="floorPlan">Grundrissplan</Label>
            <div className="flex items-center gap-2">
              <Input
                id="floorPlan"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFloorPlanFile(e.target.files?.[0] || null)}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Unterstützte Formate: JPG, PNG, PDF
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Erstelle..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
