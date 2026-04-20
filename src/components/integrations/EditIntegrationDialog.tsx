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
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Settings } from "lucide-react";
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
  const [baseConfig, setBaseConfig] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { t } = useTranslation();

  const integrationType = locationIntegration?.integration?.type;
  const gatewayDef = integrationType ? getGatewayDefinition(integrationType) : undefined;
  const isAiconoGateway = integrationType === "aicono_gateway";

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

    const nextConfig = (locationIntegration.config as Record<string, string> | undefined) ?? {};
    const vals: Record<string, string> = {};
    for (const field of gatewayDef.configFields) {
      vals[field.name] = nextConfig[field.name] || "";
    }

    setBaseConfig(nextConfig);
    form.reset(vals);
  }, [locationIntegration, gatewayDef, form, open]);

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
