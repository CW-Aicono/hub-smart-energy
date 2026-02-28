import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Floor, useFloors } from "@/hooks/useFloors";
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
import { Pencil } from "lucide-react";

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
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  
  const [name, setName] = useState(floor.name);
  const [floorNumber, setFloorNumber] = useState(floor.floor_number.toString());
  const [description, setDescription] = useState(floor.description || "");
  const [areaSqm, setAreaSqm] = useState(floor.area_sqm?.toString() || "");
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [model3dFile, setModel3dFile] = useState<File | null>(null);
  const [mtlFile, setMtlFile] = useState<File | null>(null);

  const isObjSelected = model3dFile?.name.toLowerCase().endsWith(".obj");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error(T("fl.nameRequired"));
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      let floorPlanUrl = floor.floor_plan_url;

      if (floorPlanFile) {
        setUploadLabel(T("fl.uploadingFloorPlan"));
        const { url, error: uploadError } = await uploadFloorPlan(
          floorPlanFile,
          locationId,
          floor.id,
          (p) => setUploadProgress(p),
        );

        if (uploadError) {
          toast.error(T("fl.floorPlanUploadFailed"));
          setLoading(false);
          setUploadProgress(0);
          setUploadLabel("");
          return;
        }
        floorPlanUrl = url;
      }

      setUploadLabel(T("fl.savingData"));
      setUploadProgress(model3dFile ? 0 : 100);

      const { error } = await updateFloor(floor.id, {
        name: name.trim(),
        floor_number: parseInt(floorNumber) || 0,
        description: description.trim() || null,
        area_sqm: areaSqm ? parseFloat(areaSqm) : null,
        floor_plan_url: floorPlanUrl,
      });

      if (error) {
        toast.error(T("fl.updateError"));
        return;
      }

      if (model3dFile) {
        setUploadLabel(T("fl.uploading3d"));
        setUploadProgress(0);
        const { error: modelError } = await upload3DModel(
          { main: model3dFile, mtl: mtlFile || undefined },
          locationId,
          floor.id,
          (p) => setUploadProgress(p),
        );
        if (modelError) {
          toast.error(T("fl.3dUploadFailed"));
          return;
        }
      }

      toast.success(T("floor.updated"));
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(T("common.error"));
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
          <DialogTitle>{T("fl.editFloor")}</DialogTitle>
          <DialogDescription>
            {T("fl.editFloorDesc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{T("fl.name")} *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-floorNumber">{T("fl.floorNumber")}</Label>
              <Input
                id="edit-floorNumber"
                type="number"
                value={floorNumber}
                onChange={(e) => setFloorNumber(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-description">{T("common.description")}</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-areaSqm">{T("fl.area")}</Label>
            <Input
              id="edit-areaSqm"
              type="number"
              step="0.01"
              value={areaSqm}
              onChange={(e) => setAreaSqm(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-floorPlan">{T("fl.floorPlanChange")}</Label>
            {floor.floor_plan_url && (
              <p className="text-sm text-muted-foreground">
                {T("fl.floorPlanExists")}
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
            <Label htmlFor="edit-model3d">{T("fl.model3dEdit")}</Label>
            {floor.model_3d_url && (
              <p className="text-sm text-muted-foreground">
                {T("fl.model3dExists")}
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
              <Label htmlFor="edit-mtlFile">{T("fl.materialFile")}</Label>
              <Input
                id="edit-mtlFile"
                type="file"
                accept=".mtl"
                onChange={(e) => setMtlFile(e.target.files?.[0] || null)}
              />
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
              {T("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? T("common.loading") : T("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
