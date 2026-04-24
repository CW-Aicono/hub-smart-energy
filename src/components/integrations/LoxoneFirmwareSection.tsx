import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/invokeWithRetry";
import { Download, Loader2, MonitorSmartphone } from "lucide-react";

interface LoxoneFirmwareSectionProps {
  locationIntegrationId: string;
}

interface FirmwareInfo {
  version: string;
  versionDate: string;
}

export function LoxoneFirmwareSection({ locationIntegrationId }: LoxoneFirmwareSectionProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [firmwareInfo, setFirmwareInfo] = useState<FirmwareInfo | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleCheckFirmware = async () => {
    setIsChecking(true);
    try {
      const { data, error } = await invokeWithRetry("loxone-api", {
        body: { locationIntegrationId, action: "getVersion" },
      });
      if (error || !data?.success) {
        toast({
          title: t("intCard.error" as any),
          description: data?.error || t("intCard.firmwareCheckError" as any),
          variant: "destructive",
        });
      } else {
        setFirmwareInfo({ version: data.version, versionDate: data.versionDate });
      }
    } catch (e: any) {
      toast({ title: t("intCard.error" as any), description: e.message, variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    try {
      const { data, error } = await invokeWithRetry("loxone-api", {
        body: { locationIntegrationId, action: "triggerUpdate", confirmed: true },
      });
      if (error || !data?.success) {
        toast({
          title: t("intCard.error" as any),
          description: data?.error || t("intCard.updateError" as any),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("intCard.updateStarted" as any),
          description: t("intCard.updateStartedDesc" as any),
        });
      }
    } catch (e: any) {
      toast({ title: t("intCard.error" as any), description: e.message, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCheckFirmware}
        disabled={isChecking}
        className="gap-1.5"
      >
        {isChecking ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("intCard.checking" as any)}</>
        ) : (
          <><MonitorSmartphone className="h-3.5 w-3.5" />{t("intCard.checkFirmware" as any)}</>
        )}
      </Button>

      {firmwareInfo && (
        <>
          <Badge variant="secondary" className="gap-1 text-xs font-normal">
            {t("intCard.firmwareVersion" as any)}: {firmwareInfo.version}
          </Badge>
          {firmwareInfo.versionDate && firmwareInfo.versionDate !== "unbekannt" && (
            <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
              {t("intCard.firmwareDate" as any)}: {firmwareInfo.versionDate}
            </Badge>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isUpdating}>
                {isUpdating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("intCard.updating" as any)}</>
                ) : (
                  <><Download className="h-3.5 w-3.5" />{t("intCard.triggerUpdate" as any)}</>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("intCard.updateTitle" as any)}</AlertDialogTitle>
                <AlertDialogDescription>{t("intCard.updateDesc" as any)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleTriggerUpdate} disabled={isUpdating}>
                  {isUpdating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("intCard.updating" as any)}</>
                  ) : (
                    t("intCard.triggerUpdate" as any)
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
