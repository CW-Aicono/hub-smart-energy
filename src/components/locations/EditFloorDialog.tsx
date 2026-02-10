import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Floor, useFloors } from "@/hooks/useFloors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
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
import { Pencil, RotateCw } from "lucide-react";

interface EditFloorDialogProps {
  floor: Floor;
  locationId: string;
  onSuccess?: () => void;
}

export function EditFloorDialog({ floor, locationId, onSuccess }: EditFloorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const { updateFloor, uploadFloorPlan, upload3DModel } = useFloors(locationId);
  
  const [name, setName] = useState(floor.name);
  const [floorNumber, setFloorNumber] = useState(floor.floor_number.toString());
  const [description, setDescription] = useState(floor.description || "");
  const [areaSqm, setAreaSqm] = useState(floor.area_sqm?.toString() || "");
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [model3dFile, setModel3dFile] = useState<File | null>(null);
  const [mtlFile, setMtlFile] = useState<File | null>(null);
  const [modelRotation, setModelRotation] = useState<number>(floor.model_3d_rotation ?? 0);
  const [useManualRotation, setUseManualRotation] = useState(floor.model_3d_rotation !== null);

  const isObjSelected = model3dFile?.name.toLowerCase().endsWith(".obj");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein");
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      let floorPlanUrl = floor.floor_plan_url;

      // Upload new floor plan if provided
      if (floorPlanFile) {
        setUploadLabel("Grundriss wird hochgeladen…");
        const { url, error: uploadError } = await uploadFloorPlan(
          floorPlanFile,
          locationId,
          floor.id,
          (p) => setUploadProgress(p),
        );

        if (uploadError) {
          toast.error("Grundriss konnte nicht hochgeladen werden");
          setLoading(false);
          setUploadProgress(0);
          setUploadLabel("");
          return;
        }
        floorPlanUrl = url;
      }

      setUploadLabel("Etagendaten werden gespeichert…");
      setUploadProgress(model3dFile ? 0 : 100);

      const { error } = await updateFloor(floor.id, {
        name: name.trim(),
        floor_number: parseInt(floorNumber) || 0,
        description: description.trim() || null,
        area_sqm: areaSqm ? parseFloat(areaSqm) : null,
        floor_plan_url: floorPlanUrl,
        model_3d_rotation: useManualRotation ? modelRotation : null,
      });

      if (error) {
        toast.error("Fehler beim Aktualisieren der Etage");
        return;
      }

      // Upload 3D model if provided
      if (model3dFile) {
        setUploadLabel("3D-Modell wird hochgeladen…");
        setUploadProgress(0);
        const { error: modelError } = await upload3DModel(
          { main: model3dFile, mtl: mtlFile || undefined },
          locationId,
          floor.id,
          (p) => setUploadProgress(p),
        );
        if (modelError) {
          toast.error("Etage aktualisiert, aber 3D-Modell konnte nicht hochgeladen werden");
          return;
        }
      }

      toast.success("Etage erfolgreich aktualisiert");
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error("Unerwarteter Fehler beim Speichern");
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setUploadLabel("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label htmlFor="edit-model3d">3D-Modell (.glb, .obj oder .3ds)</Label>
            {floor.model_3d_url && (
              <p className="text-sm text-muted-foreground">
                Aktuelles 3D-Modell vorhanden. Laden Sie eine neue Datei hoch, um es zu ersetzen.
              </p>
            )}
            <Input
              id="edit-model3d"
              type="file"
              accept=".glb,.obj,.3ds"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setModel3dFile(file);
                if (file && !file.name.toLowerCase().endsWith(".obj")) {
                  setMtlFile(null);
                }
              }}
            />
          </div>

          {isObjSelected && (
            <div className="space-y-2">
              <Label htmlFor="edit-mtlFile">Material-Datei (.mtl)</Label>
              <Input
                id="edit-mtlFile"
                type="file"
                accept=".mtl"
                onChange={(e) => setMtlFile(e.target.files?.[0] || null)}
              />
            </div>
          )}

          {/* 3D Model Rotation */}
          {floor.model_3d_url && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">3D-Modell Rotation</Label>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useManualRotation}
                    onChange={(e) => {
                      setUseManualRotation(e.target.checked);
                      if (!e.target.checked) setModelRotation(0);
                    }}
                    className="rounded border-input"
                  />
                  Manuell anpassen
                </label>
              </div>
              {useManualRotation ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[modelRotation]}
                      onValueChange={(v) => setModelRotation(v[0])}
                      min={0}
                      max={360}
                      step={15}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono text-muted-foreground w-12 text-right">
                      {modelRotation}°
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[0, 90, 180, 270].map((deg) => (
                      <Button
                        key={deg}
                        type="button"
                        variant={modelRotation === deg ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setModelRotation(deg)}
                      >
                        {deg}°
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Automatische Erkennung aktiv. Aktivieren Sie die manuelle Anpassung, falls das Modell falsch ausgerichtet ist.
                </p>
              )}
            </div>
          )}

          {loading && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{uploadLabel}</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
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
