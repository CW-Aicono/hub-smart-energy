import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Server } from "lucide-react";
import { useLocationIntegrations, useIntegrations, LoxoneConfig } from "@/hooks/useIntegrations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const loxoneConfigSchema = z.object({
  integration_id: z.string().min(1, "Bitte wählen Sie eine Integration"),
  serial_number: z.string().min(1, "Seriennummer ist erforderlich"),
  username: z.string().min(1, "Benutzername ist erforderlich"),
  password: z.string().min(1, "Passwort ist erforderlich"),
});

type LoxoneFormData = z.infer<typeof loxoneConfigSchema>;

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

  const form = useForm<LoxoneFormData>({
    resolver: zodResolver(loxoneConfigSchema),
    defaultValues: {
      integration_id: "",
      serial_number: "",
      username: "",
      password: "",
    },
  });

  const availableIntegrations = integrations.filter(
    (integration) => !locationIntegrations.some((li) => li.integration_id === integration.id)
  );

  const handleTestConnection = async () => {
    const values = form.getValues();
    setTesting(true);

    const config: LoxoneConfig = {
      serial_number: values.serial_number,
      username: values.username,
      password: values.password,
    };

    const result = await testConnection(config);
    setTesting(false);

    if (result.success) {
      toast({
        title: "Verbindung erfolgreich",
        description: "Die Verbindung zum Loxone Miniserver wurde hergestellt.",
      });
    } else {
      toast({
        title: "Verbindung fehlgeschlagen",
        description: result.error || "Die Verbindung konnte nicht hergestellt werden.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: LoxoneFormData) => {
    const config: LoxoneConfig = {
      serial_number: data.serial_number,
      username: data.username,
      password: data.password,
    };

    const { error } = await addIntegration(locationId, data.integration_id, config);

    if (error) {
      toast({
        title: "Fehler",
        description: "Die Integration konnte nicht hinzugefügt werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Integration hinzugefügt",
        description: "Die Integration wurde erfolgreich hinzugefügt.",
      });
      form.reset();
      setOpen(false);
      onSuccess?.();
    }
  };

  if (integrationsLoading) {
    return null;
  }

  if (availableIntegrations.length === 0) {
    return null;
  }

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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Integration auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableIntegrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          {integration.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="serial_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seriennummer</FormLabel>
                  <FormControl>
                    <Input placeholder="504F94A0XXXX" {...field} />
                  </FormControl>
                  <FormDescription>
                    Die Seriennummer des Loxone Miniservers
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Benutzername</FormLabel>
                    <FormControl>
                      <Input placeholder="admin" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passwort</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Teste...
                  </>
                ) : (
                  "Verbindung testen"
                )}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  "Hinzufügen"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
