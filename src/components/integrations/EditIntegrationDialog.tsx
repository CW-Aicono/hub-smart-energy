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
import { Loader2, Settings } from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { getGatewayDefinition } from "@/lib/gatewayRegistry";

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
  onUpdate 
}: EditIntegrationDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const integrationType = locationIntegration?.integration?.type;
  const gatewayDef = integrationType ? getGatewayDefinition(integrationType) : undefined;
  const config = locationIntegration?.config as Record<string, string> | undefined;

  // Build dynamic zod schema from gateway definition
  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {};
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        shape[field.name] = field.required
          ? z.string().min(1, `${field.label} ist erforderlich`)
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
    if (locationIntegration && config && gatewayDef) {
      const vals: Record<string, string> = {};
      for (const field of gatewayDef.configFields) {
        vals[field.name] = config[field.name] || "";
      }
      form.reset(vals);
    }
  }, [locationIntegration, config, gatewayDef, form]);

  const onSubmit = async (data: Record<string, string>) => {
    if (!locationIntegration) return;

    setIsSaving(true);
    const newConfig: Record<string, string> = {};
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        newConfig[field.name] = data[field.name] || "";
      }
    }

    const { error } = await onUpdate(locationIntegration.id, { config: newConfig });
    setIsSaving(false);

    if (error) {
      toast({
        title: "Fehler",
        description: "Die Integration konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Integration aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Integration bearbeiten
          </DialogTitle>
          <DialogDescription>
            Ändern Sie die Zugangsdaten für {locationIntegration?.integration?.name || "diese Integration"}
          </DialogDescription>
        </DialogHeader>

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
                Abbrechen
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  "Speichern"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
