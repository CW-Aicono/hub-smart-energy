import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { Server, Trash2, Settings, CheckCircle2, XCircle, Clock, Loader2, Gauge } from "lucide-react";
import { LocationIntegration, LoxoneConfig } from "@/hooks/useIntegrations";
import { SensorsDialog } from "./SensorsDialog";

interface IntegrationCardProps {
  locationIntegration: LocationIntegration;
  onUpdate: (id: string, updates: Partial<LocationIntegration>) => Promise<{ error: Error | null }>;
  onDelete: (id: string) => Promise<{ error: Error | null }>;
  onConfigure?: (locationIntegration: LocationIntegration) => void;
}

export function IntegrationCard({ locationIntegration, onUpdate, onDelete, onConfigure }: IntegrationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [sensorsOpen, setSensorsOpen] = useState(false);
  const { toast } = useToast();

  const integration = locationIntegration.integration;
  const config = locationIntegration.config as LoxoneConfig;

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsToggling(true);
    const { error } = await onUpdate(locationIntegration.id, { is_enabled: enabled });
    setIsToggling(false);

    if (error) {
      toast({
        title: "Fehler",
        description: "Status konnte nicht geändert werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: enabled ? "Aktiviert" : "Deaktiviert",
        description: `Die Integration wurde ${enabled ? "aktiviert" : "deaktiviert"}.`,
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const { error } = await onDelete(locationIntegration.id);
    setIsDeleting(false);

    if (error) {
      toast({
        title: "Fehler",
        description: "Die Integration konnte nicht entfernt werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Integration entfernt",
        description: "Die Integration wurde erfolgreich entfernt.",
      });
    }
  };

  const getSyncStatusBadge = () => {
    switch (locationIntegration.sync_status) {
      case "success":
        return (
          <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20">
            <CheckCircle2 className="h-3 w-3" />
            Verbunden
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="h-3 w-3" />
            Fehler
          </Badge>
        );
      case "syncing":
        return (
          <Badge variant="outline" className="gap-1 bg-secondary text-secondary-foreground border-border">
            <Loader2 className="h-3 w-3 animate-spin" />
            Synchronisiere...
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border">
            <Clock className="h-3 w-3" />
            Ausstehend
          </Badge>
        );
    }
  };

  return (
    <>
      <Card className={`transition-opacity ${!locationIntegration.is_enabled ? "opacity-60" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{integration?.name || "Integration"}</h4>
                  {getSyncStatusBadge()}
                </div>
                <p className="text-sm text-muted-foreground">
                  {config?.serial_number ? `SN: ${config.serial_number}` : "Nicht konfiguriert"}
                </p>
                {integration?.description && (
                  <p className="text-xs text-muted-foreground">{integration.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSensorsOpen(true)}
                title="Sensoren anzeigen"
              >
                <Gauge className="h-4 w-4" />
              </Button>

              <Switch
                checked={locationIntegration.is_enabled}
                onCheckedChange={handleToggleEnabled}
                disabled={isToggling}
              />
              
              {onConfigure && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onConfigure(locationIntegration)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Integration entfernen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Möchten Sie die Integration "{integration?.name}" wirklich entfernen? 
                      Diese Aktion kann nicht rückgängig gemacht werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Entfernen...
                        </>
                      ) : (
                        "Entfernen"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <SensorsDialog
        locationIntegration={locationIntegration}
        open={sensorsOpen}
        onOpenChange={setSensorsOpen}
      />
    </>
  );
}
