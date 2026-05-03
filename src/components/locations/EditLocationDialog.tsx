import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Location, LocationType, LocationUsageType, useLocations } from "@/hooks/useLocations";
import { useLocationEnergySources, type LocationEnergySourceInsert } from "@/hooks/useLocationEnergySources";
import { LocationEnergySourcesEditor } from "@/components/locations/LocationEnergySourcesEditor";
import { useTranslation } from "@/hooks/useTranslation";
import { useGeocode } from "@/hooks/useGeocode";
import { Button } from "@/components/ui/button";
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
import { Pencil, MapPin, LocateFixed, Loader2, AlertTriangle, Wand2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FEDERAL_STATES, detectFederalStateFromPostalCode } from "@/lib/federalStates";

// ENERGY_SOURCES constant removed — now using LocationEnergySourcesEditor

const USAGE_TYPES: { value: LocationUsageType; labelKey: string }[] = [
  { value: "verwaltungsgebaeude", labelKey: "locations.usage.verwaltungsgebaeude" },
  { value: "universitaet", labelKey: "locations.usage.universitaet" },
  { value: "schule", labelKey: "locations.usage.schule" },
  { value: "kindertageseinrichtung", labelKey: "locations.usage.kindertageseinrichtung" },
  { value: "sportstaette", labelKey: "locations.usage.sportstaette" },
  { value: "jugendzentrum", labelKey: "locations.usage.jugendzentrum" },
  { value: "gewerbe", labelKey: "locations.usage.gewerbe" },
  { value: "privat", labelKey: "locations.usage.privat" },
  { value: "sonstiges", labelKey: "locations.usage.sonstiges" },
];

const locationSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(100),
  type: z.enum(["einzelgebaeude", "gebaeudekomplex", "sonstiges"] as const),
  usage_type: z.enum(["verwaltungsgebaeude", "universitaet", "schule", "kindertageseinrichtung", "sportstaette", "jugendzentrum", "gewerbe", "privat", "sonstiges"] as const),
  address: z.string().trim().max(200).optional(),
  postal_code: z.string().trim().max(10).optional(),
  city: z.string().trim().max(100).optional(),
  contact_person: z.string().trim().max(100).optional(),
  contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(30).optional(),
  energy_sources: z.array(z.object({ energy_type: z.string(), custom_name: z.string(), sort_order: z.number().optional() })).default([]),
  show_on_map: z.boolean().default(true),
  is_main_location: z.boolean().default(false),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional(),
  construction_year: z.coerce.number().int().min(1800).max(2100).optional().or(z.literal("")),
  renovation_year: z.coerce.number().int().min(1800).max(2100).optional().or(z.literal("")),
  net_floor_area: z.coerce.number().min(0).optional().or(z.literal("")),
  gross_floor_area: z.coerce.number().min(0).optional().or(z.literal("")),
  heating_type: z.string().trim().max(100).optional(),
  grid_limit_kw: z.coerce.number().min(0).max(10000).optional().or(z.literal("")),
  federal_state: z.string().trim().max(2).optional().or(z.literal("")),
});

type LocationFormData = z.infer<typeof locationSchema>;

interface EditLocationDialogProps {
  location: Location;
  onSuccess: () => void;
  trigger?: React.ReactNode;
}

export function EditLocationDialog({ location, onSuccess, trigger }: EditLocationDialogProps) {
  const [open, setOpen] = useState(false);
  const { locations, updateLocation } = useLocations();
  const { sources: existingSources, saveBulk: saveEnergySources } = useLocationEnergySources(location.id);
  const { t } = useTranslation();
  const { geocodeAddress, isLoading: isGeocoding } = useGeocode();
  const { toast } = useToast();

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: location.name,
      type: location.type,
      usage_type: location.usage_type || "sonstiges",
      address: location.address || "",
      postal_code: location.postal_code || "",
      city: location.city || "",
      contact_person: location.contact_person || "",
      contact_email: location.contact_email || "",
      contact_phone: location.contact_phone || "",
      energy_sources: existingSources.map((s) => ({ energy_type: s.energy_type, custom_name: s.custom_name, sort_order: s.sort_order })),
      show_on_map: location.show_on_map,
      is_main_location: location.is_main_location,
      latitude: location.latitude ?? "",
      longitude: location.longitude ?? "",
      description: location.description || "",
      construction_year: location.construction_year ?? "",
      renovation_year: location.renovation_year ?? "",
      net_floor_area: location.net_floor_area ?? "",
      gross_floor_area: location.gross_floor_area ?? "",
      heating_type: location.heating_type || "",
      grid_limit_kw: (location as any).grid_limit_kw ?? "",
      federal_state: (location as any).federal_state ?? "",
    },
  });

  const watchedIsMain = form.watch("is_main_location");
  const currentMainLocation = locations.find(loc => loc.is_main_location && loc.id !== location.id);

  const handleOpen = () => {
    form.reset({
      name: location.name,
      type: location.type,
      usage_type: location.usage_type || "sonstiges",
      address: location.address || "",
      postal_code: location.postal_code || "",
      city: location.city || "",
      contact_person: location.contact_person || "",
      contact_email: location.contact_email || "",
      contact_phone: location.contact_phone || "",
      energy_sources: existingSources.map((s) => ({ energy_type: s.energy_type, custom_name: s.custom_name, sort_order: s.sort_order })),
      show_on_map: location.show_on_map,
      is_main_location: location.is_main_location,
      latitude: location.latitude ?? "",
      longitude: location.longitude ?? "",
      description: location.description || "",
      construction_year: location.construction_year ?? "",
      renovation_year: location.renovation_year ?? "",
      net_floor_area: location.net_floor_area ?? "",
      gross_floor_area: location.gross_floor_area ?? "",
      heating_type: location.heating_type || "",
      grid_limit_kw: (location as any).grid_limit_kw ?? "",
      federal_state: (location as any).federal_state ?? "",
    });
    setOpen(true);
  };

  const onSubmit = async (data: LocationFormData) => {
    const { energy_sources: energySourceItems, ...rest } = data;
    const updates = {
      name: rest.name,
      type: rest.type as LocationType,
      usage_type: rest.usage_type as LocationUsageType,
      address: rest.address || null,
      postal_code: rest.postal_code || null,
      city: rest.city || null,
      contact_person: rest.contact_person || null,
      contact_email: rest.contact_email || null,
      contact_phone: rest.contact_phone || null,
      energy_sources: energySourceItems.map((s) => s.energy_type),
      show_on_map: rest.show_on_map,
      is_main_location: rest.is_main_location,
      latitude: typeof rest.latitude === "number" ? rest.latitude : null,
      longitude: typeof rest.longitude === "number" ? rest.longitude : null,
      description: rest.description || null,
      construction_year: typeof rest.construction_year === "number" ? rest.construction_year : null,
      renovation_year: typeof rest.renovation_year === "number" ? rest.renovation_year : null,
      net_floor_area: typeof rest.net_floor_area === "number" ? rest.net_floor_area : null,
      gross_floor_area: typeof rest.gross_floor_area === "number" ? rest.gross_floor_area : null,
      heating_type: rest.heating_type || null,
      grid_limit_kw: typeof rest.grid_limit_kw === "number" ? rest.grid_limit_kw : null,
      federal_state: rest.federal_state ? rest.federal_state : null,
    } as any;

    const { error } = await updateLocation(location.id, updates);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("locations.updateError"),
        variant: "destructive",
      });
    } else {
      // Save energy sources to new table
      await saveEnergySources(location.id, energySourceItems as LocationEnergySourceInsert[]);
      toast({
        title: t("common.success"),
        description: t("locations.updated"),
      });
      setOpen(false);
      onSuccess();
    }
  };

  return (
    <>
      {trigger ? (
        <span onClick={handleOpen} className="cursor-pointer">
          {trigger}
        </span>
      ) : (
        <Button variant="ghost" size="sm" onClick={handleOpen}>
          <Pencil className="h-4 w-4 mr-1" />
          {t("common.edit")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t("locations.editLocation")}
            </DialogTitle>
            <DialogDescription>
              {t("locations.editLocationDescription")}
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
                      <FormLabel>{t("addLocation.name")} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t("addLocation.namePlaceholder")} {...field} />
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
                      <FormLabel>{t("locations.type")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="einzelgebaeude">{t("locations.types.einzelgebaeude")}</SelectItem>
                          <SelectItem value="gebaeudekomplex">{t("locations.types.gebaeudekomplex")}</SelectItem>
                          <SelectItem value="sonstiges">{t("locations.types.sonstiges")}</SelectItem>
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
                    <FormLabel>{t("locations.usageType")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {USAGE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {t(type.labelKey as any)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Address */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t("addLocation.addressSection")}</h4>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("addLocation.street")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <FormLabel>{t("addLocation.postalCode")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>{t("locations.city")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField control={form.control} name="federal_state" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bundesland</FormLabel>
                    <div className="flex gap-2">
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Bundesland auswählen (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FEDERAL_STATES.map((s) => (
                            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Aus Postleitzahl ermitteln"
                        onClick={() => {
                          const plz = form.getValues("postal_code");
                          const detected = detectFederalStateFromPostalCode(plz);
                          if (detected) {
                            field.onChange(detected);
                          } else {
                            toast({ title: "Keine Erkennung möglich", description: "Bitte PLZ prüfen oder manuell auswählen.", variant: "destructive" });
                          }
                        }}
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormDescription>
                      Bestimmt die rechtliche Grundlage und Vorlage für den kommunalen Energiebericht (z.B. NKlimaG, EWärmeG).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Contact */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t("addLocation.contactSection")}</h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="contact_person"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("addLocation.contactName")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                        <FormLabel>{t("addLocation.contactEmail")}</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
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
                        <FormLabel>{t("addLocation.contactPhone")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("addLocation.energySources")}</FormLabel>
                    <LocationEnergySourcesEditor
                      value={field.value as LocationEnergySourceInsert[]}
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Building Data */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t("building.data" as any)}</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="construction_year" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("building.constructionYear" as any)}</FormLabel>
                      <FormControl><Input type="number" placeholder="z.B. 1985" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="renovation_year" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("building.renovationYear" as any)}</FormLabel>
                      <FormControl><Input type="number" placeholder="z.B. 2020" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="net_floor_area" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("building.netFloorArea" as any)}</FormLabel>
                      <FormControl><Input type="number" step="any" placeholder="m²" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="gross_floor_area" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("building.grossFloorArea" as any)}</FormLabel>
                      <FormControl><Input type="number" step="any" placeholder="m²" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="heating_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("building.heatingType" as any)}</FormLabel>
                    <FormControl><Input placeholder="z.B. Gas-Brennwert, Fernwärme" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="federal_state" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bundesland</FormLabel>
                    <div className="flex gap-2">
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Bundesland auswählen (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FEDERAL_STATES.map((s) => (
                            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Aus Postleitzahl ermitteln"
                        onClick={() => {
                          const plz = form.getValues("postal_code");
                          const detected = detectFederalStateFromPostalCode(plz);
                          if (detected) {
                            field.onChange(detected);
                          } else {
                            toast({ title: "Keine Erkennung möglich", description: "Bitte PLZ prüfen oder manuell auswählen.", variant: "destructive" });
                          }
                        }}
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormDescription>
                      Bestimmt die rechtliche Grundlage und Vorlage für den kommunalen Energiebericht (z.B. NKlimaG, EWärmeG).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* DLM Hardlimit (Hausanschluss) */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Lastmanagement (DLM)</h4>
                <FormField control={form.control} name="grid_limit_kw" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximale Bezugsleistung am Hausanschluss (kW)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        placeholder="z.B. 35"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Hardlimit: alle Ladepunkte an diesem Standort werden bei Überschreitung automatisch gedrosselt.
                      Voraussetzung: ein Hauptzähler ist diesem Standort zugeordnet. Leer lassen = kein Limit.
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{t("locations.coordinates")}</h4>
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
                    {t("locations.geocodeFromAddress")}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("locations.latitude")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" {...field} value={field.value ?? ""} />
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
                        <FormLabel>{t("locations.longitude")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" {...field} value={field.value ?? ""} />
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
                      <FormLabel className="text-base">{t("addLocation.showOnMap")}</FormLabel>
                      <FormDescription>{t("addLocation.showOnMapDescription")}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Main Location */}
              <FormField
                control={form.control}
                name="is_main_location"
                render={({ field }) => (
                  <FormItem className="flex flex-col rounded-lg border p-4 border-primary/20 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">{t("locations.mainLocation")}</FormLabel>
                        <FormDescription>{t("locations.mainLocationDescription")}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    {watchedIsMain && currentMainLocation && (
                      <Alert variant="default" className="mt-3 border-amber-500/30 bg-amber-500/10">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
                          Der aktuelle Hauptstandort <span className="font-semibold">„{currentMainLocation.name}"</span> wird dadurch ersetzt.
                        </AlertDescription>
                      </Alert>
                    )}
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("locations.description")}</FormLabel>
                    <FormControl>
                      <Textarea className="resize-none" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
