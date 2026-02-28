import { useState } from "react";
import { Floor, useFloors } from "@/hooks/useFloors";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface DeleteFloorDialogProps {
  floor: Floor;
  onSuccess?: () => void;
}

export function DeleteFloorDialog({ floor, onSuccess }: DeleteFloorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { deleteFloor } = useFloors(floor.location_id);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await deleteFloor(floor.id);
      if (error) { toast.error(T("common.errorDelete")); return; }
      toast.success(T("floor.deleted"));
      setOpen(false);
      onSuccess?.();
    } catch {
      toast.error(T("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{T("fl.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {T("fl.deleteDesc").replace("{name}", floor.name)}
            {floor.floor_plan_url && (
              <span className="block mt-2 text-amber-600">
                {T("fl.deleteFloorPlanWarning")}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{T("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? T("common.loading") : T("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
