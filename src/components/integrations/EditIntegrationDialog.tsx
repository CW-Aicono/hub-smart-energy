import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Settings, Wifi, AlertTriangle } from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { getGatewayDefinition } from "@/lib/gatewayRegistry";
import { AiconoGatewayCredentials } from "./gateway/AiconoGatewayCredentials";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EditIntegrationDialogProps {
  locationIntegration: LocationIntegration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<LocationIntegration>) => Promise<{ error: Error | null }>;
}

export function EditIntegrationDialog({
  locationIntegration,
  open,
  onOpenChange,
  onUpdate,
}: EditIntegrationDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [baseConfig, setBaseConfig] = useState<Record<string, any>>({});
  const [pollIntervalMin, setPollIntervalMin] = useState<number>(5);
  const [customName, setCustomName] = useState<string>("");
  const [savingName, setSavingName] = useState(false);
  const [enablingWs, setEnablingWs] = useState(false);
  const [disableWsConfirmOpen, setDisableWsConfirmOpen] = useState(false);
  const [disablingWs, setDisablingWs] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const integrationType = locationIntegration?.integration?.type;
  const gatewayDef = integrationType ? getGatewayDefinition(integrationType) : undefined;
  const isAiconoGateway = integrationType === "aicono_gateway";
  const isLoxone = integrationType === "loxone" || integrationType === "loxone_miniserver";

  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {};
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        shape[field.name] = field.required
          ? z.string().min(1, `${field.label}`)
          : z.string().optional();
      }
    }
    return z.object(shape);
  }, [gatewayDef]);

  const form = useForm<Record<string, string>>({
    resolver: zodResolver(formSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!locationIntegration || !open) return;
    setCustomName(locationIntegration.custom_name ?? "");
    if (!gatewayDef) return;

    const nextConfig = (locationIntegration.config as Record<string, any> | undefined) ?? {};
    const vals: Record<string, string> = {};
    for (const field of gatewayDef.configFields) {
      vals[field.name] = (nextConfig[field.name] as string) || "";
    }

    setBaseConfig(nextConfig);
    const raw = Number(nextConfig.poll_interval_minutes);
    setPollIntervalMin(Number.isFinite(raw) && raw >= 5 && raw <= 60 ? Math.floor(raw) : 15);
    form.reset(vals);
  }, [locationIntegration, gatewayDef, form, open]);

  const handleSaveName = async () => {
    if (!locationIntegration) return;
    setSavingName(true);
    const trimmed = customName.trim();
    const { error } = await onUpdate(locationIntegration.id, {
      custom_name: trimmed ? trimmed : null,
    } as any);
    setSavingName(false);
    if (error) {
      toast({
        title: t("common.error" as any),
        description: "Name konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Name gespeichert",
        description: trimmed
          ? `Anzeigename: ${trimmed}`
          : "Anzeigename zurückgesetzt (Vorlagenname wird verwendet).",
      });
    }
  };

  const onSubmit = async (data: Record<string, string>) => {
    if (!locationIntegration) return;

    setIsSaving(true);
    const newConfig: Record<string, any> = { ...baseConfig };
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        newConfig[field.name] = data[field.name] || "";
      }
    }
    if (isLoxone) {
      const clamped = Math.min(60, Math.max(5, Math.floor(Number(pollIntervalMin) || 15)));
      newConfig.poll_interval_minutes = clamped;
    }

    const { error } = await onUpdate(locationIntegration.id, { config: newConfig });
    setIsSaving(false);

    if (error) {
      toast({
        title: t("common.error" as any),
        description: t("editIntegration.updatedDesc" as any),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("editIntegration.updated" as any),
        description: t("editIntegration.updatedDesc" as any),
      });
      onOpenChange(false);
    }
  };

  const handleEnableWs = async () => {
    if (!locationIntegration) return;
    setEnablingWs(true);
    const { error } = await onUpdate(locationIntegration.id, {
      loxone_remote_connect_ws_enabled: true,
    });
    setEnablingWs(false);
    if (error) {
      toast({
        title: t("common.error" as any),
        description: "Fehler beim Aktivieren von Remote Connect WebSocket.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Remote Connect WebSocket aktiviert",
        description: "Echtzeit-Daten sind jetzt für diesen Standort freigeschaltet.",
      });
    }
  };

  const handleDisableWs = async () => {
    if (!locationIntegration) return;
    setDisablingWs(true);
    const { error } = await onUpdate(locationIntegration.id, {
      loxone_remote_connect_ws_enabled: false,
    });
    setDisablingWs(false);
    setDisableWsConfirmOpen(false);
    if (error) {
      toast({
        title: t("common.error" as any),
        description: "Fehler beim Deaktivieren von Remote Connect WebSocket.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Remote Connect WebSocket deaktiviert",
        description: "Live-Daten sind für diesen Standort deaktiviert. Werte kommen nur noch über HTTP-Pull.",
      });
    }
  };

  const hasConfigFields = (gatewayDef?.configFields.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("editIntegration.title" as any)}
          </DialogTitle>
          <DialogDescription>
            {t("editIntegration.changeCredentials" as any)} {locationIntegration?.integration?.name || ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            <Label htmlFor="custom-name">Anzeigename</Label>
            <div className="flex gap-2">
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={locationIntegration?.integration?.name || "z. B. Miniserver Keller"}
              />
              <Button
                type="button"
                onClick={handleSaveName}
                disabled={savingName || (customName ?? "") === (locationIntegration?.custom_name ?? "")}
              >
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save" as any)}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Eigener Name für diese Integration an diesem Standort. Leer lassen, um den Vorlagenname „{locationIntegration?.integration?.name || ""}" zu verwenden.
            </p>
          </div>

          {isAiconoGateway && locationIntegration && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <AiconoGatewayCredentials
                locationIntegrationId={locationIntegration.id}
                onSaved={() => onOpenChange(false)}
              />
            </div>
          )}

          {hasConfigFields && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {gatewayDef?.configFields.map((fieldDef) => (
                  <FormField
                    key={fieldDef.name}
                    control={form.control}
                    name={fieldDef.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{fieldDef.label}</FormLabel>
                        <FormControl>
                          <Input
                            type={fieldDef.type === "password" ? "password" : "text"}
                            placeholder={fieldDef.placeholder}
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        {fieldDef.description && (
                          <FormDescription>{fieldDef.description}</FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}

                {isLoxone && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <Label htmlFor="poll-interval">Abfrage-Intervall (Minuten)</Label>
                    <Input
                      id="poll-interval"
                      type="number"
                      min={5}
                      max={60}
                      step={1}
                      value={pollIntervalMin}
                      onChange={(e) => setPollIntervalMin(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Wie oft AICONO neue Sensorwerte vom Miniserver abruft. Erlaubt: 5–60 Minuten. Niedriger = aktuellere Werte (höhere Schreiblast), höher = weniger Datenbank-Last. Empfehlung: 15 Minuten.
                    </p>
                  </div>
                )}

                {isLoxone && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-primary" />
                        <span className="font-medium">Remote Connect WebSocket</span>
                      </div>
                      {locationIntegration?.loxone_remote_connect_ws_enabled ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-500/30 text-xs">Aktiviert</Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDisableWsConfirmOpen(true)}
                            disabled={disablingWs}
                          >
                            Deaktivieren
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" size="sm" onClick={handleEnableWs} disabled={enablingWs}>
                          {enablingWs ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Aktiviere…
                            </>
                          ) : (
                            "Aktivieren"
                          )}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Empfohlen: WebSocket (Realtime, geringere Server-Last). Neue Miniserver werden ab sofort standardmäßig mit aktivem WebSocket angelegt. Ohne WebSocket kommen Werte nur alle {pollIntervalMin} Min per HTTP-Pull — keine Live-Anzeige, verzögerte Automationen.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {t("common.cancel" as any)}
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("common.saving" as any)}
                      </>
                    ) : (
                      t("common.save" as any)
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {!hasConfigFields && !isAiconoGateway && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.close" as any)}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={disableWsConfirmOpen} onOpenChange={setDisableWsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remote Connect WebSocket wirklich deaktivieren?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Nach dem Deaktivieren gilt für diese Loxone-Integration:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Keine Live-Werte mehr</strong> im Dashboard und Energie-Fluss.</li>
                  <li>Zählerwerte kommen nur noch alle {pollIntervalMin} Min per HTTP-Pull.</li>
                  <li>Automationen reagieren <strong>bis zu {pollIntervalMin} Min verzögert</strong> statt in Sekunden.</li>
                  <li>Die 5-Minuten-Aggregate werden gröber (nur noch aus HTTP-Fallback).</li>
                </ul>
                <p className="pt-2">
                  Tagessummen, Steuerbefehle und Geräteerkennung bleiben unverändert (laufen ohnehin über HTTP).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disablingWs}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDisableWs(); }}
              disabled={disablingWs}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disablingWs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
