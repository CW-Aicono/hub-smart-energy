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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Server, Cloud, Copy, CheckCircle2 } from "lucide-react";
import { useLocationIntegrations, useIntegrations } from "@/hooks/useIntegrations";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getGatewayTypes, getGatewayDefinition } from "@/lib/gatewayRegistry";
import { supabase } from "@/integrations/supabase/client";

interface AddIntegrationDialogProps {
  locationId: string;
  onSuccess?: () => void;
}

interface TunnelResult {
  tunnel_id: string;
  public_url: string;
  tunnel_token: string;
}

const normalizeMacAddress = (value: string) => value.toLowerCase().replace(/[^0-9a-f]/g, "");

const emptyFormValues: Record<string, string> = {
  name: "",
  type: "",
  description: "",
  mac_address: "",
  gateway_username: "",
  gateway_password: "",
};

export function AddIntegrationDialog({ locationId, onSuccess }: AddIntegrationDialogProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelResult, setTunnelResult] = useState<TunnelResult | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const { toast } = useToast();
  const { createIntegration } = useIntegrations();
  const { addIntegration, testConnection } = useLocationIntegrations(locationId);

  const [selectedType, setSelectedType] = useState("");
  const gatewayDef = selectedType ? getGatewayDefinition(selectedType) : undefined;
  const isHomeAssistant = selectedType === "home_assistant";

  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {
      name: z.string().min(1, "Name ist erforderlich"),
      type: z.string().min(1, "Bitte wählen Sie einen Gateway-Typ"),
      description: z.string().optional(),
    };
    if (gatewayDef) {
      for (const field of gatewayDef.configFields) {
        // For HA, api_url becomes optional when tunnel is auto-provisioned
        const required = field.required && !(isHomeAssistant && field.name === "api_url");
        shape[field.name] = required
          ? z.string().min(1, `${field.label} ist erforderlich`)
          : z.string().optional();
      }
    }
    if (isHomeAssistant) {
      shape.mac_address = z.string().trim().transform(normalizeMacAddress);
      shape.gateway_username = z.string().trim();
      shape.gateway_password = z.string();
    }

    return z.object(shape).superRefine((values, ctx) => {
      if (!isHomeAssistant) return;

      const macAddress = typeof values.mac_address === "string" ? values.mac_address : "";
      const gatewayUsername = typeof values.gateway_username === "string" ? values.gateway_username.trim() : "";
      const gatewayPassword = typeof values.gateway_password === "string" ? values.gateway_password : "";
      const hasGatewayIdentity = Boolean(macAddress || gatewayUsername || gatewayPassword);

      if (!hasGatewayIdentity) return;

      if (macAddress.length !== 12) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MAC muss 12 Hex-Zeichen sein (z. B. aabbccddeeff)",
          path: ["mac_address"],
        });
      }

      if (gatewayUsername.length < 3 || gatewayUsername.length > 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Benutzername muss 3 bis 32 Zeichen lang sein",
          path: ["gateway_username"],
        });
      }

      if (gatewayPassword.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Passwort muss mindestens 8 Zeichen lang sein",
          path: ["gateway_password"],
        });
      }
    });
  }, [gatewayDef, isHomeAssistant]);

  const form = useForm<Record<string, string>>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyFormValues,
  });

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    setTunnelResult(null);
    const current = form.getValues();
    const resetVals: Record<string, string> = {
      ...emptyFormValues,
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

  const handleProvisionTunnel = async (locationIntegrationId: string) => {
    setTunnelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cf-tunnel-provision", {
        body: { location_integration_id: locationIntegrationId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Tunnel-Erstellung fehlgeschlagen");
      setTunnelResult({
        tunnel_id: data.tunnel_id,
        public_url: data.public_url,
        tunnel_token: data.tunnel_token,
      });
      // Auto-fill api_url field
      form.setValue("api_url", data.public_url);
      toast({
        title: "Tunnel erstellt",
        description: "Bitte Token kopieren und im Add-on hinterlegen.",
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
    const { data: linkData, error: linkErr } = await addIntegration(
      locationId, newIntegration.id, buildConfig(data),
    );

    if (linkErr || !linkData) {
      toast({ title: "Fehler", description: "Die Integration konnte nicht mit der Liegenschaft verknüpft werden.", variant: "destructive" });
      return;
    }

    let gatewayAssignmentWarning: string | null = null;

    if (isHomeAssistant && data.mac_address && data.gateway_username && data.gateway_password) {
      const { data: assignmentData, error: assignmentError } = await supabase.functions.invoke("gateway-credentials", {
        body: {
          mac_address: data.mac_address,
          gateway_username: data.gateway_username,
          gateway_password: data.gateway_password,
          location_integration_id: linkData.id,
        },
      });

      if (assignmentError) {
        gatewayAssignmentWarning = assignmentError.message;
      } else if ((assignmentData as { error?: string } | null)?.error) {
        gatewayAssignmentWarning = (assignmentData as { error: string }).error;
      }
    }

    toast({
      title: gatewayAssignmentWarning ? "Integration hinzugefügt, Gateway-Zuordnung offen" : "Integration hinzugefügt",
      description: gatewayAssignmentWarning
        ? `Die Integration wurde angelegt. MAC/Benutzername/Passwort konnten noch nicht gespeichert werden: ${gatewayAssignmentWarning}`
        : "Die Integration wurde erfolgreich angelegt.",
      variant: gatewayAssignmentWarning ? "destructive" : undefined,
    });

    // For HA without manual api_url → offer immediate tunnel provisioning
    if (isHomeAssistant && !data.api_url) {
      await handleProvisionTunnel(linkData.id);
      // Keep dialog open so user can copy token
      onSuccess?.();
      return;
    }

    form.reset(emptyFormValues);
    setSelectedType("");
    setTunnelResult(null);
    setOpen(false);
    onSuccess?.();
  };

  const copyToken = async () => {
    if (!tunnelResult) return;
    await navigator.clipboard.writeText(tunnelResult.tunnel_token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const closeDialog = () => {
    form.reset(emptyFormValues);
    setSelectedType("");
    setTunnelResult(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
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

        {tunnelResult ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Tunnel erfolgreich erstellt</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Öffentliche URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{tunnelResult.public_url}</code>
                </p>
                <div>
                  <p className="text-sm font-medium mb-1">Tunnel-Token (einmalig sichtbar):</p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={tunnelResult.tunnel_token}
                      className="font-mono text-xs"
                    />
                    <Button type="button" size="icon" variant="outline" onClick={copyToken}>
                      {tokenCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <ol className="text-sm list-decimal list-inside space-y-1">
                  <li>Token kopieren (Button rechts).</li>
                  <li>In der installierten AICONO-EMS-Gateway-Komponente hinterlegen.</li>
                  <li>Falls ein neuer Tunnel benötigt wird: später in der Edit-Maske auf <strong>„Tunnel-Token neu generieren“</strong> klicken.</li>
                  <li>Gateway/Add-on neu starten.</li>
                </ol>
              </AlertDescription>
            </Alert>
            <div className="flex justify-end">
              <Button onClick={closeDialog}>Fertig</Button>
            </div>
          </div>
        ) : (
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

            {isHomeAssistant && (
              <Alert>
                <Cloud className="h-4 w-4" />
                <AlertTitle className="text-sm">AICONO Tunnel statt Nabu Casa</AlertTitle>
                <AlertDescription className="text-xs">
                  Lassen Sie das Feld "API URL" leer und nach dem Hinzufügen wird automatisch ein
                  kostenfreier AICONO-Cloudflare-Tunnel eingerichtet. Alternativ tragen Sie eine
                  bestehende Nabu-Casa- oder Reverse-Proxy-URL manuell ein.
                </AlertDescription>
              </Alert>
            )}

            {gatewayDef && (
              <div className="space-y-4 pt-2 border-t">
                {gatewayDef.configFields.map((fieldDef) => (
                  <FormField
                    key={fieldDef.name}
                    control={form.control}
                    name={fieldDef.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {fieldDef.label}
                          {isHomeAssistant && fieldDef.name === "api_url" && (
                            <span className="ml-1 text-xs text-muted-foreground font-normal">(optional bei Tunnel-Nutzung)</span>
                          )}
                        </FormLabel>
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
              <Button type="submit" disabled={form.formState.isSubmitting || tunnelLoading || !gatewayDef}>
                {form.formState.isSubmitting || tunnelLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{tunnelLoading ? "Tunnel wird erstellt..." : "Speichern..."}</>
                ) : (isHomeAssistant && !form.watch("api_url") ? "Hinzufügen + Tunnel einrichten" : "Hinzufügen")}
              </Button>
            </div>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
