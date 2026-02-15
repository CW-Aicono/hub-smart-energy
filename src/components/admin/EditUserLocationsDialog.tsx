import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserLocationAccess } from "@/hooks/useUserLocationAccess";
import { useLocations } from "@/hooks/useLocations";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EditUserLocationsDialogProps {
  userId: string;
  userName: string;
}

const EditUserLocationsDialog = ({ userId, userName }: EditUserLocationsDialogProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { locations } = useLocations();
  const { locationIds, loading, grantAccess, revokeAccess } = useUserLocationAccess(
    open ? userId : null
  );

  const handleToggle = async (locationId: string, checked: boolean) => {
    try {
      if (checked) {
        await grantAccess(locationId);
      } else {
        await revokeAccess(locationId);
      }
      toast({ title: t("users.locationAccessUpdated") });
    } catch {
      toast({
        title: t("common.error"),
        description: t("users.locationAccessError"),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <MapPin className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("users.manageLocations")}</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t("users.locationAccess")}
          </DialogTitle>
          <DialogDescription>
            {t("users.locationAccessDescription")}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground animate-pulse">
            {t("common.loading")}
          </div>
        ) : locations.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {t("locations.noLocations") || "Keine Standorte"}
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3 pr-4">
              {locations.map((loc) => (
                <label
                  key={loc.id}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={locationIds.includes(loc.id)}
                    onCheckedChange={(checked) =>
                      handleToggle(loc.id, checked === true)
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{loc.name}</p>
                    {loc.address && (
                      <p className="text-xs text-muted-foreground truncate">
                        {loc.address}
                        {loc.city ? `, ${loc.city}` : ""}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditUserLocationsDialog;
