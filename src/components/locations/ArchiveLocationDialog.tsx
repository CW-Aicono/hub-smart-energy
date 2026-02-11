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
import { Archive } from "lucide-react";

interface ArchiveLocationDialogProps {
  location: Location;
  onSuccess: () => void;
}

export function ArchiveLocationDialog({ location, onSuccess }: ArchiveLocationDialogProps) {
  const { t } = useTranslation();
  const { updateLocation } = useLocations();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const hasChildren = location.children && location.children.length > 0;

  const handleArchive = async () => {
    if (hasChildren) {
      toast({
        title: t("common.error"),
        description: "Standorte mit Untergebäuden können nicht archiviert werden.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await updateLocation(location.id, { is_archived: true } as any);
    setLoading(false);

    if (error) {
      toast({
        title: t("common.error"),
        description: "Fehler beim Archivieren des Standorts.",
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: `„${location.name}" wurde archiviert.`,
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
          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          disabled={hasChildren}
          title={hasChildren ? "Standorte mit Untergebäuden können nicht archiviert werden" : "Standort archivieren"}
        >
          <Archive className="h-4 w-4 mr-1" />
          Archivieren
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Standort archivieren</AlertDialogTitle>
          <AlertDialogDescription>
            Möchten Sie den Standort <strong>„{location.name}"</strong> wirklich archivieren? 
            Der Standort wird aus der aktiven Übersicht entfernt, kann aber später wiederhergestellt werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchive}
            disabled={loading}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {loading ? t("common.loading") : "Archivieren"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
