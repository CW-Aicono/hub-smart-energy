import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings } from "lucide-react";
import { LocationIntegration, LoxoneConfig } from "@/hooks/useIntegrations";

const loxoneConfigSchema = z.object({
  serial_number: z.string().min(1, "Seriennummer ist erforderlich"),
  username: z.string().min(1, "Benutzername ist erforderlich"),
  password: z.string().min(1, "Passwort ist erforderlich"),
});

type LoxoneFormData = z.infer<typeof loxoneConfigSchema>;

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

  const config = locationIntegration?.config as LoxoneConfig | undefined;

  const form = useForm<LoxoneFormData>({
    resolver: zodResolver(loxoneConfigSchema),
    defaultValues: {
      serial_number: "",
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (locationIntegration && config) {
      form.reset({
        serial_number: config.serial_number || "",
        username: config.username || "",
        password: config.password || "",
      });
    }
  }, [locationIntegration, config, form]);

  const onSubmit = async (data: LoxoneFormData) => {
    if (!locationIntegration) return;

    setIsSaving(true);
    const newConfig: LoxoneConfig = {
      serial_number: data.serial_number,
      username: data.username,
      password: data.password,
    };

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
      <DialogContent className="sm:max-w-[450px]">
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
                onClick={() => onOpenChange(false)}
              >
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
