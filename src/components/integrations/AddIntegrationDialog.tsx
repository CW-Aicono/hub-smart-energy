import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Server } from "lucide-react";
import { useLocationIntegrations, useIntegrations } from "@/hooks/useIntegrations";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GATEWAY_DEFINITIONS, getGatewayDefinition } from "@/lib/gatewayRegistry";

interface AddIntegrationDialogProps {
  locationId: string;
  onSuccess?: () => void;
}

export function AddIntegrationDialog({ locationId, onSuccess }: AddIntegrationDialogProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();
  const { integrations, loading: integrationsLoading } = useIntegrations();
  const { addIntegration, testConnection, locationIntegrations } = useLocationIntegrations(locationId);

  // Build a dynamic zod schema that always requires integration_id and then
  // all required config fields for the currently selected gateway type
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("");

  const selectedIntegration = integrations.find(i => i.id === selectedIntegrationId);
  const gatewayDef = selectedIntegration ? getGatewayDefinition(selectedIntegration.type) : undefined;

  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {
      integration_id: z.string().min(1, "Bitte wählen Sie eine Integration"),
    };
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
    defaultValues: { integration_id: "" },
  });

  const availableIntegrations = integrations.filter(
    (integration) => !locationIntegrations.some((li) => li.integration_id === integration.id)
  );

  const handleIntegrationChange = (value: string) => {
    setSelectedIntegrationId(value);
    // Reset all fields except integration_id
    const resetVals: Record<string, string> = { integration_id: value };
    const newIntegration = integrations.find(i => i.id === value);
    const newDef = newIntegration ? getGatewayDefinition(newIntegration.type) : undefined;
    if (newDef) {
      for (const field of newDef.configFields) {
        resetVals[field.name] = "";
      }
    }
    form.reset(resetVals);
  };

  const handleTestConnection = async () => {
    const values = form.getValues();
    setTesting(true);

    // Build config object from all config fields
    const config: Record<string, string> = {};
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        config[field.name] = values[field.name] || "";
      }
    }

    const result = await testConnection(config);
    setTesting(false);

    if (result.success) {
      toast({ title: "Verbindung erfolgreich", description: "Die Verbindung wurde hergestellt." });
    } else {
      toast({ title: "Verbindung fehlgeschlagen", description: result.error || "Fehler bei der Verbindung.", variant: "destructive" });
    }
  };

  const onSubmit = async (data: Record<string, string>) => {
    const config: Record<string, string> = {};
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        config[field.name] = data[field.name] || "";
      }
    }

    const { error } = await addIntegration(locationId, data.integration_id, config);

    if (error) {
      toast({ title: "Fehler", description: "Die Integration konnte nicht hinzugefügt werden.", variant: "destructive" });
    } else {
      toast({ title: "Integration hinzugefügt", description: "Die Integration wurde erfolgreich hinzugefügt." });
      form.reset({ integration_id: "" });
      setSelectedIntegrationId("");
      setOpen(false);
      onSuccess?.();
    }
  };

  if (integrationsLoading || availableIntegrations.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Integration hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Integration hinzufügen
          </DialogTitle>
          <DialogDescription>
            Verbinden Sie diesen Standort mit einer Gebäudeautomation
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="integration_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Integration</FormLabel>
                  <Select
                    onValueChange={(v) => { field.onChange(v); handleIntegrationChange(v); }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Integration auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableIntegrations.map((integration) => {
                        const def = getGatewayDefinition(integration.type);
                        return (
                          <SelectItem key={integration.id} value={integration.id}>
                            {integration.name}{def ? ` (${def.label})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dynamic config fields based on gateway type */}
            {gatewayDef && (
              <div className="space-y-4">
                {gatewayDef.configFields.map((fieldDef) => {
                  // Group password / text fields into grid where sensible
                  return (
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
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testing || !gatewayDef}>
                {testing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Teste...</>) : "Verbindung testen"}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Speichern...</>) : "Hinzufügen"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
