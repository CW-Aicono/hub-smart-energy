import { useState } from "react";
import { useLocations, Location } from "@/hooks/useLocations";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
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
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface DeleteLocationDialogProps {
  location: Location;
  onSuccess: () => void;
}

export function DeleteLocationDialog({ location, onSuccess }: DeleteLocationDialogProps) {
  const { t } = useTranslation();
  const { deleteLocation } = useLocations();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const hasChildren = location.children && location.children.length > 0;

  const handleDelete = async () => {
    if (hasChildren) {
      toast({
        title: t("common.error"),
        description: t("locations.cannotDeleteWithChildren"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await deleteLocation(location.id);
    setLoading(false);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("locations.deleteError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: t("locations.deleted"),
      });
      onSuccess();
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={hasChildren}
          title={hasChildren ? t("locations.cannotDeleteWithChildren") : undefined}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {t("common.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("locations.deleteLocationTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("locations.deleteLocationConfirmation")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? t("common.loading") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
