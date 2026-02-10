import { useState } from "react";
import { Floor, useFloors } from "@/hooks/useFloors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Box } from "lucide-react";

interface Upload3DModelDialogProps {
  floor: Floor;
  locationId: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export function Upload3DModelDialog({ floor, locationId, onSuccess, trigger }: Upload3DModelDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { upload3DModel } = useFloors(locationId);

  const [mainFile, setMainFile] = useState<File | null>(null);
  const [mtlFile, setMtlFile] = useState<File | null>(null);

  const isObjSelected = mainFile?.name.toLowerCase().endsWith(".obj");

  const resetForm = () => {
    setMainFile(null);
    setMtlFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mainFile) {
      toast.error("Bitte wählen Sie eine 3D-Datei aus");
      return;
    }

    setLoading(true);

    try {
      const { error } = await upload3DModel(
        { main: mainFile, mtl: mtlFile || undefined },
        locationId,
        floor.id
      );

      if (error) {
        toast.error("Fehler beim Hochladen des 3D-Modells");
        return;
      }

      toast.success("3D-Modell erfolgreich hochgeladen");
      resetForm();
      setOpen(false);
      onSuccess?.();
    } catch {
      toast.error("Unerwarteter Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Box className="h-4 w-4" />
            3D-Modell
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>3D-Modell hochladen</DialogTitle>
          <DialogDescription>
            Laden Sie ein 3D-Modell für "{floor.name}" hoch. Unterstützte Formate: GLB (empfohlen) und OBJ + MTL.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="main-3d-file">3D-Datei (.glb oder .obj) *</Label>
            <Input
              id="main-3d-file"
              type="file"
              accept=".glb,.obj"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setMainFile(file);
                // Reset MTL if switching away from OBJ
                if (file && !file.name.toLowerCase().endsWith(".obj")) {
                  setMtlFile(null);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              GLB enthält Geometrie + Materialien in einer Datei. Bei OBJ können Sie zusätzlich eine MTL-Datei hochladen.
            </p>
          </div>

          {isObjSelected && (
            <div className="space-y-2">
              <Label htmlFor="mtl-file">Material-Datei (.mtl)</Label>
              <Input
                id="mtl-file"
                type="file"
                accept=".mtl"
                onChange={(e) => setMtlFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Optionale MTL-Datei für Materialien und Farben
              </p>
            </div>
          )}

          {floor.model_3d_url && (
            <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              ⚠️ Ein bestehendes 3D-Modell wird ersetzt.
            </p>
          )}

          {loading && <Progress value={undefined} className="h-2" />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading || !mainFile}>
              {loading ? "Lade hoch..." : "Hochladen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
