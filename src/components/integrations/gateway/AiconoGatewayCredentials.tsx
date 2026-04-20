import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Cpu, Loader2, ShieldCheck, RefreshCw, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PendingDevice {
  id: string;
  mac_address: string;
  gateway_username: string | null;
  last_heartbeat_at: string | null;
  local_ip: string | null;
}

const formSchema = z.object({
  mac_address: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase().replace(/[^0-9a-f]/g, ""))
    .refine((v) => v.length === 12, "MAC muss 12 Hex-Zeichen sein (z.B. aabbccddeeff)"),
  gateway_username: z
    .string()
    .trim()
    .min(3, "Mindestens 3 Zeichen")
    .max(32, "Maximal 32 Zeichen"),
  gateway_password: z
    .string()
    .min(8, "Mindestens 8 Zeichen"),
});

type FormValues = z.infer<typeof formSchema>;

interface AiconoGatewayCredentialsProps {
  locationIntegrationId: string;
  onSaved?: () => void;
}

/**
 * Loxone-style credential form for the AICONO EMS Gateway.
 * Three fields: MAC + username + password. Posted via gateway-credentials
 * Edge Function which bcrypts the password and binds the device to the
 * current tenant + location_integration.
 */
export function AiconoGatewayCredentials({ locationIntegrationId, onSaved }: AiconoGatewayCredentialsProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { mac_address: "", gateway_username: "", gateway_password: "" },
  });

  const fetchPending = async () => {
    setLoadingPending(true);
    try {
      const { data, error } = await supabase.functions.invoke("gateway-credentials", {
        method: "GET" as any,
        body: undefined,
      });
      // Edge functions invoked with GET use query string; fall back to direct fetch
      if (error || !data) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/gateway-credentials?action=pending`,
          { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } },
        );
        const j = await res.json();
        setPending(j?.devices || []);
      } else {
        setPending((data as any)?.devices || []);
      }
    } catch (e) {
      console.warn("[gateway-credentials] pending fetch failed", e);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("gateway-credentials", {
        body: {
          mac_address: values.mac_address,
          gateway_username: values.gateway_username,
          gateway_password: values.gateway_password,
          location_integration_id: locationIntegrationId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Gateway zugeordnet",
        description: "Innerhalb von ~60 Sekunden meldet sich der Pi mit Status 'Online'.",
      });
      form.reset({ mac_address: "", gateway_username: "", gateway_password: "" });
      onSaved?.();
      fetchPending();
    } catch (e) {
      toast({
        title: "Fehler bei Zuordnung",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const fillFromPending = (d: PendingDevice) => {
    form.setValue("mac_address", d.mac_address, { shouldDirty: true, shouldValidate: true });
    if (d.gateway_username) {
      form.setValue("gateway_username", d.gateway_username, { shouldDirty: true, shouldValidate: true });
    }
  };

  const copyMac = async (mac: string) => {
    try {
      await navigator.clipboard.writeText(mac);
      toast({ title: "MAC kopiert", description: mac });
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Cpu className="h-4 w-4" />
        <AlertTitle>AICONO EMS Gateway zuordnen</AlertTitle>
        <AlertDescription className="text-sm">
          Tragen Sie die MAC-Adresse des Pi (in der lokalen Add-on UI sichtbar) sowie den
          Benutzernamen und das Passwort aus der Add-on-Konfiguration ein.
        </AlertDescription>
      </Alert>

      {pending.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-foreground">
              Unzugeordnete Geräte ({pending.length})
            </Label>
            <Button type="button" variant="ghost" size="sm" onClick={fetchPending} disabled={loadingPending}>
              <RefreshCw className={`h-3.5 w-3.5 ${loadingPending ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Diese Pis haben sich gemeldet, sind aber noch keiner Liegenschaft zugeordnet.
          </p>
          <div className="space-y-1.5">
            {pending.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{d.mac_address}</code>
                  {d.gateway_username && (
                    <span className="text-xs text-muted-foreground truncate">user: {d.gateway_username}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => copyMac(d.mac_address)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => fillFromPending(d)}>
                    Übernehmen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="mac_address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>MAC-Adresse</FormLabel>
                <FormControl>
                  <Input
                    placeholder="aabbccddeeff"
                    className="font-mono"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormDescription>12 Hex-Zeichen ohne Doppelpunkte. In der Add-on UI sichtbar.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gateway_username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Benutzername</FormLabel>
                <FormControl>
                  <Input placeholder="buero-pi" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gateway_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Passwort</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                </FormControl>
                <FormDescription>
                  Wird nur als bcrypt-Hash gespeichert. Muss mit dem Wert in der Add-on-Konfiguration übereinstimmen.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gespeichert…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Gateway zuordnen
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
