import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocations, LocationType } from "@/hooks/useLocations";
import { useUserRole } from "@/hooks/useUserRole";
import { useGeocode } from "@/hooks/useGeocode";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, MapPin, LocateFixed, Loader2 } from "lucide-react";

const ENERGY_SOURCES = [
  { id: "strom", label: "Strom" },
  { id: "gas", label: "Gas" },
  { id: "waerme", label: "Fernwärme" },
  { id: "solar", label: "Solar/Photovoltaik" },
  { id: "wasser", label: "Wasser" },
  { id: "oel", label: "Heizöl" },
] as const;

const locationSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(100, "Name darf maximal 100 Zeichen haben"),
  type: z.enum(["standort", "gebaeude", "bereich"] as const),
  usage_type: z.enum(["verwaltungsgebaeude", "universitaet", "schule", "kindertageseinrichtung", "sportstaette", "jugendzentrum", "sonstiges"] as const),
  address: z.string().trim().max(200, "Adresse darf maximal 200 Zeichen haben").optional(),
  postal_code: z.string().trim().max(10, "PLZ darf maximal 10 Zeichen haben").optional(),
  city: z.string().trim().max(100, "Stadt darf maximal 100 Zeichen haben").optional(),
  contact_person: z.string().trim().max(100, "Ansprechpartner darf maximal 100 Zeichen haben").optional(),
  contact_email: z.string().trim().email("Ungültige E-Mail-Adresse").max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(30, "Telefonnummer darf maximal 30 Zeichen haben").optional(),
  energy_sources: z.array(z.string()).default([]),
  show_on_map: z.boolean().default(true),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
  description: z.string().trim().max(500, "Beschreibung darf maximal 500 Zeichen haben").optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

interface AddLocationDialogProps {
  parentId?: string;
}

export function AddLocationDialog({ parentId }: AddLocationDialogProps) {
  const [open, setOpen] = useState(false);
  const { createLocation } = useLocations();
  const { isAdmin } = useUserRole();
  const { geocodeAddress, isLoading: isGeocoding } = useGeocode();
  const { toast } = useToast();

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "",
      type: "standort",
      usage_type: "sonstiges",
      address: "",
      postal_code: "",
      city: "",
      contact_person: "",
      contact_email: "",
      contact_phone: "",
      energy_sources: [],
      show_on_map: true,
      description: "",
    },
  });

  const onSubmit = async (data: LocationFormData) => {
    const locationData = {
      name: data.name,
      type: data.type as LocationType,
      usage_type: data.usage_type as any,
      address: data.address || null,
      postal_code: data.postal_code || null,
      city: data.city || null,
      country: "Deutschland",
      contact_person: data.contact_person || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      energy_sources: data.energy_sources,
      show_on_map: data.show_on_map,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      description: data.description || null,
      parent_id: parentId || null,
    };

    const { error } = await createLocation(locationData);

    if (error) {
      toast({
        title: "Fehler",
        description: "Standort konnte nicht angelegt werden.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Erfolgreich",
        description: "Standort wurde angelegt.",
      });
      form.reset();
      setOpen(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Standort anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Neuen Standort anlegen
          </DialogTitle>
          <DialogDescription>
            Erfassen Sie die Daten für den neuen Standort.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Hauptstandort Berlin" {...field} />
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
                    <FormLabel>Typ</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Typ wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="standort">Standort</SelectItem>
                        <SelectItem value="gebaeude">Gebäude</SelectItem>
                        <SelectItem value="bereich">Bereich</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Usage Type */}
            <FormField
              control={form.control}
              name="usage_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nutzungsart</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nutzungsart wählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="verwaltungsgebaeude">Verwaltungsgebäude</SelectItem>
                      <SelectItem value="universitaet">Universität</SelectItem>
                      <SelectItem value="schule">Schule</SelectItem>
                      <SelectItem value="kindertageseinrichtung">Kindertageseinrichtung</SelectItem>
                      <SelectItem value="sportstaette">Sportstätte</SelectItem>
                      <SelectItem value="jugendzentrum">Jugendzentrum</SelectItem>
                      <SelectItem value="sonstiges">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Address */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Adresse</h4>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Straße & Hausnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Musterstraße 123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PLZ</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. 10115" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stadt</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Berlin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Ansprechpartner</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Max Mustermann" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Mail</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@beispiel.de" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input placeholder="+49 30 123456" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Energy Sources */}
            <FormField
              control={form.control}
              name="energy_sources"
              render={() => (
                <FormItem>
                  <FormLabel>Energiequellen</FormLabel>
                  <FormDescription>
                    Wählen Sie die verfügbaren Energiequellen für diesen Standort.
                  </FormDescription>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                    {ENERGY_SOURCES.map((source) => (
                      <FormField
                        key={source.id}
                        control={form.control}
                        name="energy_sources"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(source.id)}
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  if (checked) {
                                    field.onChange([...current, source.id]);
                                  } else {
                                    field.onChange(current.filter((v) => v !== source.id));
                                  }
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {source.label}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Coordinates */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Koordinaten (optional)</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isGeocoding}
                  onClick={async () => {
                    const address = form.getValues("address") || "";
                    const postalCode = form.getValues("postal_code") || "";
                    const city = form.getValues("city") || "";
                    const result = await geocodeAddress(address, postalCode, city);
                    if (result) {
                      form.setValue("latitude", result.latitude);
                      form.setValue("longitude", result.longitude);
                    }
                  }}
                >
                  {isGeocoding ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LocateFixed className="h-4 w-4 mr-2" />
                  )}
                  Aus Adresse ermitteln
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Breitengrad</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="any" 
                          placeholder="z.B. 52.5200" 
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Längengrad</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="any" 
                          placeholder="z.B. 13.4050" 
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Show on Map */}
            <FormField
              control={form.control}
              name="show_on_map"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Auf Karte anzeigen</FormLabel>
                    <FormDescription>
                      Standort wird auf der interaktiven Karte dargestellt.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Zusätzliche Informationen zum Standort..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Wird gespeichert..." : "Standort anlegen"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
