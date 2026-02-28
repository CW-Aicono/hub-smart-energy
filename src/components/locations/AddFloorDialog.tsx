import { useState } from "react";
import { useFloors } from "@/hooks/useFloors";
import { useTranslation } from "@/hooks/useTranslation";
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
import { Plus } from "lucide-react";

interface AddFloorDialogProps {
  locationId: string;
  onSuccess?: () => void;
}

export function AddFloorDialog({ locationId, onSuccess }: AddFloorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { createFloor, updateFloor, uploadFloorPlan, upload3DModel } = useFloors(locationId);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  
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
      toast.error(T("fl.nameRequired"));
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
        toast.error(T("fl.createError"));
        return;
      }

      if (floorPlanFile && floor) {
        const { url, error: uploadError } = await uploadFloorPlan(
          floorPlanFile,
          locationId,
          floor.id
        );

        if (uploadError) {
          toast.error(T("fl.floorPlanUploadError"));
        } else if (url) {
          await updateFloor(floor.id, { floor_plan_url: url });
        }
      }

      if (model3dFile && floor) {
        const { error: modelError } = await upload3DModel(
          { main: model3dFile, mtl: mtlFile || undefined },
          locationId,
          floor.id,
        );

        if (modelError) {
          toast.error(T("fl.model3dUploadError"));
        }
      }

      toast.success(T("floor.created"));
      resetForm();
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(T("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {T("fl.addFloor")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{T("fl.addFloorTitle")}</DialogTitle>
          <DialogDescription>
            {T("fl.addFloorDesc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{T("fl.name")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Erdgeschoss"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floorNumber">{T("fl.floorNumber")}</Label>
              <Input
                id="floorNumber"
                type="number"
                value={floorNumber}
                onChange={(e) => setFloorNumber(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {T("fl.negativeHint")}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">{T("common.description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="areaSqm">{T("fl.area")}</Label>
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
            <Label htmlFor="floorPlan">{T("fl.floorPlanUpload")}</Label>
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
              {T("fl.supportedFormats")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model3d">{T("fl.model3d")}</Label>
            <Input
              id="model3d"
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
            <p className="text-xs text-muted-foreground">
              {T("fl.model3dFormats")}
            </p>
          </div>

          {isObjSelected && (
            <div className="space-y-2">
              <Label htmlFor="mtlFile">{T("fl.materialFile")}</Label>
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
              {T("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? T("common.loading") : T("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
