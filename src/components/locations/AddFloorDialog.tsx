import { useState } from "react";
import { useFloors } from "@/hooks/useFloors";
import { supabase } from "@/integrations/supabase/client";
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
  const [model3dFile, setModel3dFile] = useState<File | null>(null);
  const [mtlFile, setMtlFile] = useState<File | null>(null);

  const resetForm = () => {
    setName("");
    setFloorNumber("0");
    setDescription("");
    setAreaSqm("");
    setFloorPlanFile(null);
    setModel3dFile(null);
    setMtlFile(null);
  };

  const isObjSelected = model3dFile?.name.toLowerCase().endsWith(".obj");

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
          await supabase.from("floors").update({ floor_plan_url: url } as any).eq("id", floor.id);
        }
      }

      // Upload 3D model if provided
      if (model3dFile && floor) {
        const mainExt = model3dFile.name.split('.').pop()?.toLowerCase();
        const mainPath = `${locationId}/${floor.id}.${mainExt}`;

        const { error: modelUploadError } = await supabase.storage
          .from('floor-3d-models')
          .upload(mainPath, model3dFile, { upsert: true });

        if (!modelUploadError) {
          const { data: { publicUrl: mainUrl } } = supabase.storage
            .from('floor-3d-models')
            .getPublicUrl(mainPath);

          let mtlUrl: string | null = null;
          if (mtlFile) {
            const mtlPath = `${locationId}/${floor.id}.mtl`;
            await supabase.storage.from('floor-3d-models').upload(mtlPath, mtlFile, { upsert: true });
            const { data: { publicUrl } } = supabase.storage.from('floor-3d-models').getPublicUrl(mtlPath);
            mtlUrl = publicUrl;
          }

          await supabase.from("floors").update({ model_3d_url: mainUrl, model_3d_mtl_url: mtlUrl } as any).eq("id", floor.id);
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

          <div className="space-y-2">
            <Label htmlFor="model3d">3D-Modell (optional)</Label>
            <Input
              id="model3d"
              type="file"
              accept=".glb,.obj"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setModel3dFile(file);
                if (file && !file.name.toLowerCase().endsWith(".obj")) {
                  setMtlFile(null);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Unterstützte Formate: GLB (empfohlen), OBJ
            </p>
          </div>

          {isObjSelected && (
            <div className="space-y-2">
              <Label htmlFor="mtlFile">Material-Datei (.mtl)</Label>
              <Input
                id="mtlFile"
                type="file"
                accept=".mtl"
                onChange={(e) => setMtlFile(e.target.files?.[0] || null)}
              />
            </div>
          )}

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
