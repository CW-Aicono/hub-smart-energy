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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Server } from "lucide-react";
import { useLocationIntegrations, useIntegrations } from "@/hooks/useIntegrations";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getGatewayTypes, getGatewayDefinition } from "@/lib/gatewayRegistry";

interface AddIntegrationDialogProps {
  locationId: string;
  onSuccess?: () => void;
}

export function AddIntegrationDialog({ locationId, onSuccess }: AddIntegrationDialogProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();
  const { createIntegration } = useIntegrations();
  const { addIntegration, testConnection } = useLocationIntegrations(locationId);

  const [selectedType, setSelectedType] = useState("");
  const gatewayDef = selectedType ? getGatewayDefinition(selectedType) : undefined;

  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {
      name: z.string().min(1, "Name ist erforderlich"),
      type: z.string().min(1, "Bitte wählen Sie einen Gateway-Typ"),
      description: z.string().optional(),
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
    defaultValues: { name: "", type: "", description: "" },
  });

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    const current = form.getValues();
    const resetVals: Record<string, string> = {
      name: current.name || "",
      type: value,
      description: current.description || "",
    };
    const newDef = getGatewayDefinition(value);
    if (newDef) {
      for (const field of newDef.configFields) {
        resetVals[field.name] = "";
      }
    }
    form.reset(resetVals);
  };

  const buildConfig = (values: Record<string, string>): Record<string, string> => {
    const config: Record<string, string> = {};
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        config[field.name] = values[field.name] || "";
      }
    }
    return config;
  };

  const handleTestConnection = async () => {
    setTesting(true);
    const result = await testConnection(buildConfig(form.getValues()));
    setTesting(false);
    if (result.success) {
      toast({ title: "Verbindung erfolgreich", description: "Die Verbindung wurde hergestellt." });
    } else {
      toast({ title: "Verbindung fehlgeschlagen", description: result.error || "Fehler bei der Verbindung.", variant: "destructive" });
    }
  };

  const onSubmit = async (data: Record<string, string>) => {
    if (!gatewayDef) return;

    // 1. Create tenant-level integration
    const { data: newIntegration, error: createErr } = await createIntegration({
      name: data.name,
      type: data.type,
      category: "gateways",
      description: data.description || null,
      icon: gatewayDef.icon || "server",
      config: { connection_status: "disconnected" },
      is_active: true,
    });

    if (createErr || !newIntegration) {
      toast({ title: "Fehler", description: "Die Integration konnte nicht erstellt werden.", variant: "destructive" });
      return;
    }

    // 2. Link to location with config
    const { error: linkErr } = await addIntegration(locationId, newIntegration.id, buildConfig(data));

    if (linkErr) {
      toast({ title: "Fehler", description: "Die Integration konnte nicht mit der Liegenschaft verknüpft werden.", variant: "destructive" });
    } else {
      toast({ title: "Integration hinzugefügt", description: "Die Integration wurde erfolgreich angelegt." });
      form.reset({ name: "", type: "", description: "" });
      setSelectedType("");
      setOpen(false);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Integration hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Integration hinzufügen
          </DialogTitle>
          <DialogDescription>
            Legen Sie eine neue Integration für diese Liegenschaft an
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="z.B. Hauptgebäude Loxone" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gateway-Typ</FormLabel>
                  <Select
                    onValueChange={(v) => { field.onChange(v); handleTypeChange(v); }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Gateway-Typ auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {getGatewayTypes().map((gw) => (
                        <SelectItem key={gw.type} value={gw.type}>{gw.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {gatewayDef && <FormDescription>{gatewayDef.description}</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Kurze Beschreibung..." {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {gatewayDef && (
              <div className="space-y-4 pt-2 border-t">
                {gatewayDef.configFields.map((fieldDef) => (
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
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testing || !gatewayDef}>
                {testing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Teste...</>) : "Verbindung testen"}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || !gatewayDef}>
                {form.formState.isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Speichern...</>) : "Hinzufügen"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
