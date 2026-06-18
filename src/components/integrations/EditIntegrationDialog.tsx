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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Settings, Wifi } from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { getGatewayDefinition } from "@/lib/gatewayRegistry";
import { AiconoGatewayCredentials } from "./gateway/AiconoGatewayCredentials";

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
  const [enablingWs, setEnablingWs] = useState(false);
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
    if (!locationIntegration || !gatewayDef || !open) return;

    const nextConfig = (locationIntegration.config as Record<string, any> | undefined) ?? {};
    const vals: Record<string, string> = {};
    for (const field of gatewayDef.configFields) {
      vals[field.name] = (nextConfig[field.name] as string) || "";
    }

    setBaseConfig(nextConfig);
    const raw = Number(nextConfig.poll_interval_minutes);
    setPollIntervalMin(Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.floor(raw) : 15);
    form.reset(vals);
  }, [locationIntegration, gatewayDef, form, open]);

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
      const clamped = Math.min(60, Math.max(1, Math.floor(Number(pollIntervalMin) || 15)));
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
        description: "Die BETA-Funktion ist jetzt für diesen Standort freigeschaltet.",
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
                    <FormLabel htmlFor="poll-interval">Abfrage-Intervall (Minuten)</FormLabel>
                    <Input
                      id="poll-interval"
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      value={pollIntervalMin}
                      onChange={(e) => setPollIntervalMin(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Wie oft AICONO neue Sensorwerte vom Miniserver abruft. Erlaubt: 1–60 Minuten. Niedriger = aktuellere Werte (höhere Schreiblast), höher = weniger Datenbank-Last. Empfehlung: 15 Minuten.
                    </p>
                  </div>
                )}

                {isLoxone && (
                  <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">Remote Connect WebSocket</span>
                        <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600">BETA</Badge>
                      </div>
                      {locationIntegration?.loxone_remote_connect_ws_enabled ? (
                        <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-500/30 text-xs">Aktiviert</Badge>
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
                      Ermöglicht Echtzeit-Daten über Loxone Remote Connect WebSocket.
                      Nur für Test-Standorte vorgesehen. Bitte nicht auf Produktiv-Systemen aktivieren.
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
    </Dialog>
  );
}
