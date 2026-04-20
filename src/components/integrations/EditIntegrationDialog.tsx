import { useState, useEffect, useMemo, useRef } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { CheckCircle2, Copy, Loader2, RefreshCw, Settings } from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { getGatewayDefinition } from "@/lib/gatewayRegistry";
import { supabase } from "@/integrations/supabase/client";
import { AiconoGatewayCredentials } from "./gateway/AiconoGatewayCredentials";

interface EditIntegrationDialogProps {
  locationIntegration: LocationIntegration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<LocationIntegration>) => Promise<{ error: Error | null }>;
}

interface TunnelResult {
  tunnel_id: string;
  public_url: string;
  tunnel_token: string;
}

export function EditIntegrationDialog({
  locationIntegration,
  open,
  onOpenChange,
  onUpdate,
}: EditIntegrationDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelResult, setTunnelResult] = useState<TunnelResult | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [baseConfig, setBaseConfig] = useState<Record<string, string>>({});
  const previousOpenRef = useRef(false);
  const previousIntegrationIdRef = useRef<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  const integrationType = locationIntegration?.integration?.type;
  const gatewayDef = integrationType ? getGatewayDefinition(integrationType) : undefined;
  const isHomeAssistant = integrationType === "home_assistant";

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
    if (!locationIntegration || !gatewayDef || !open) {
      previousOpenRef.current = open;
      return;
    }

    const nextConfig = (locationIntegration.config as Record<string, string> | undefined) ?? {};
    const vals: Record<string, string> = {};
    for (const field of gatewayDef.configFields) {
      vals[field.name] = nextConfig[field.name] || "";
    }

    const dialogJustOpened = !previousOpenRef.current && open;
    const integrationChanged = previousIntegrationIdRef.current !== locationIntegration.id;

    setBaseConfig(nextConfig);
    form.reset(vals);

    if (dialogJustOpened || integrationChanged) {
      setTunnelResult(null);
      setTokenCopied(false);
    }

    previousOpenRef.current = open;
    previousIntegrationIdRef.current = locationIntegration.id;
  }, [locationIntegration, gatewayDef, form, open]);

  const handleProvisionTunnel = async () => {
    if (!locationIntegration) return;

    setTunnelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cf-tunnel-provision", {
        body: { location_integration_id: locationIntegration.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Tunnel-Erstellung fehlgeschlagen");

      const { data: refreshedRow, error: refreshError } = await supabase
        .from("location_integrations")
        .select("config")
        .eq("id", locationIntegration.id)
        .single();
      if (refreshError) throw refreshError;

      const refreshedConfig = (refreshedRow?.config as Record<string, string> | undefined) ?? {};
      setBaseConfig(refreshedConfig);
      form.setValue("api_url", data.public_url, { shouldDirty: true, shouldValidate: true });
      setTunnelResult({
        tunnel_id: data.tunnel_id,
        public_url: data.public_url,
        tunnel_token: data.tunnel_token,
      });

      // NOTE: Intentionally NOT calling onUpdate() here. The Edge Function already
      // persisted the new config in the DB. Calling onUpdate would trigger a parent
      // refetch that re-renders this dialog and wipes the one-time-visible token.

      toast({
        title: "Tunnel-Token neu erstellt",
        description: "Der bisherige Tunnel-Token ist jetzt ungültig.",
      });
    } catch (e) {
      toast({
        title: "Tunnel-Fehler",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setTunnelLoading(false);
    }
  };

  const copyToken = async () => {
    if (!tunnelResult) return;
    try {
      await navigator.clipboard.writeText(tunnelResult.tunnel_token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      toast({
        title: "Kopieren fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: Record<string, string>) => {
    if (!locationIntegration) return;

    setIsSaving(true);
    const newConfig: Record<string, string> = { ...baseConfig };
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        newConfig[field.name] = data[field.name] || "";
      }
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isHomeAssistant && locationIntegration && (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <AiconoGatewayCredentials
                  locationIntegrationId={locationIntegration.id}
                  onSaved={() => onOpenChange(false)}
                />
              </div>
            )}

            {isHomeAssistant && (
              <Alert>
                <RefreshCw className="h-4 w-4" />
                <AlertTitle>Tunnel-Token neu generieren (optional)</AlertTitle>
                <AlertDescription className="space-y-3 text-sm">
                  <p>
                    Erzeugt einen neuen Cloudflare-Tunnel-Token für diese Integration. Der bisherige Token wird sofort ungültig.
                  </p>
                  <Button type="button" variant="outline" onClick={handleProvisionTunnel} disabled={tunnelLoading || isSaving}>
                    {tunnelLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Tunnel wird erstellt...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Tunnel-Token neu generieren
                      </>
                    )}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {tunnelResult && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Neuer Tunnel aktiv</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Öffentliche URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{tunnelResult.public_url}</code>
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Tunnel-Token (einmalig sichtbar):</p>
                    <div className="flex gap-2">
                      <Input readOnly value={tunnelResult.tunnel_token} className="font-mono text-xs" />
                      <Button type="button" size="icon" variant="outline" onClick={copyToken} title="Token kopieren">
                        {tokenCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

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

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel" as any)}
              </Button>
              <Button type="submit" disabled={isSaving || tunnelLoading}>
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
      </DialogContent>
    </Dialog>
  );
}
