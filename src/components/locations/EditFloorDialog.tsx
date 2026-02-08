import { useState } from "react";
import { Floor, useFloors } from "@/hooks/useFloors";
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
import { Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EditFloorDialogProps {
  floor: Floor;
  locationId: string;
  onSuccess?: () => void;
}

export function EditFloorDialog({ floor, locationId, onSuccess }: EditFloorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { updateFloor, uploadFloorPlan } = useFloors(locationId);
  
  const [name, setName] = useState(floor.name);
  const [floorNumber, setFloorNumber] = useState(floor.floor_number.toString());
  const [description, setDescription] = useState(floor.description || "");
  const [areaSqm, setAreaSqm] = useState(floor.area_sqm?.toString() || "");
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein");
      return;
    }

    setLoading(true);

    try {
      let floorPlanUrl = floor.floor_plan_url;

      // Upload new floor plan if provided
      if (floorPlanFile) {
        const { url, error: uploadError } = await uploadFloorPlan(
          floorPlanFile,
          locationId,
          floor.id
        );

        if (uploadError) {
          toast.error("Grundriss konnte nicht hochgeladen werden");
          setLoading(false);
          return;
        }
        floorPlanUrl = url;
      }

      const { error } = await updateFloor(floor.id, {
        name: name.trim(),
        floor_number: parseInt(floorNumber) || 0,
        description: description.trim() || null,
        area_sqm: areaSqm ? parseFloat(areaSqm) : null,
        floor_plan_url: floorPlanUrl,
      });

      if (error) {
        toast.error("Fehler beim Aktualisieren der Etage");
        return;
      }

      toast.success("Etage erfolgreich aktualisiert");
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
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Etage bearbeiten</DialogTitle>
          <DialogDescription>
            Bearbeiten Sie die Etagendetails und den Grundrissplan
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Erdgeschoss"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-floorNumber">Etage (Nummer)</Label>
              <Input
                id="edit-floorNumber"
                type="number"
                value={floorNumber}
                onChange={(e) => setFloorNumber(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-description">Beschreibung</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-areaSqm">Fläche (m²)</Label>
            <Input
              id="edit-areaSqm"
              type="number"
              step="0.01"
              value={areaSqm}
              onChange={(e) => setAreaSqm(e.target.value)}
              placeholder="z.B. 150.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-floorPlan">Grundrissplan ändern</Label>
            {floor.floor_plan_url && (
              <p className="text-sm text-muted-foreground">
                Aktueller Grundriss vorhanden. Laden Sie eine neue Datei hoch, um ihn zu ersetzen.
              </p>
            )}
            <Input
              id="edit-floorPlan"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFloorPlanFile(e.target.files?.[0] || null)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
