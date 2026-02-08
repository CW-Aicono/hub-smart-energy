import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Location, LocationType, LocationUsageType, useLocations } from "@/hooks/useLocations";
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
import { Pencil, MapPin, LocateFixed, Loader2 } from "lucide-react";

const ENERGY_SOURCES = [
  { id: "strom", labelKey: "energy.electricity" },
  { id: "gas", labelKey: "energy.gas" },
  { id: "waerme", labelKey: "energy.districtHeating" },
  { id: "solar", labelKey: "energy.solar" },
  { id: "wasser", labelKey: "energy.water" },
  { id: "oel", labelKey: "energy.oil" },
] as const;

const USAGE_TYPES: { value: LocationUsageType; labelKey: string }[] = [
  { value: "verwaltungsgebaeude", labelKey: "locations.usage.verwaltungsgebaeude" },
  { value: "universitaet", labelKey: "locations.usage.universitaet" },
  { value: "schule", labelKey: "locations.usage.schule" },
  { value: "kindertageseinrichtung", labelKey: "locations.usage.kindertageseinrichtung" },
  { value: "sportstaette", labelKey: "locations.usage.sportstaette" },
  { value: "jugendzentrum", labelKey: "locations.usage.jugendzentrum" },
  { value: "sonstiges", labelKey: "locations.usage.sonstiges" },
];

const locationSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(100),
  type: z.enum(["standort", "gebaeude", "bereich"] as const),
  usage_type: z.enum(["verwaltungsgebaeude", "universitaet", "schule", "kindertageseinrichtung", "sportstaette", "jugendzentrum", "sonstiges"] as const),
  address: z.string().trim().max(200).optional(),
  postal_code: z.string().trim().max(10).optional(),
  city: z.string().trim().max(100).optional(),
  contact_person: z.string().trim().max(100).optional(),
  contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(30).optional(),
  energy_sources: z.array(z.string()).default([]),
  show_on_map: z.boolean().default(true),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

interface EditLocationDialogProps {
  location: Location;
  onSuccess: () => void;
  trigger?: React.ReactNode;
}

export function EditLocationDialog({ location, onSuccess, trigger }: EditLocationDialogProps) {
  const [open, setOpen] = useState(false);
  const { updateLocation } = useLocations();
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
      energy_sources: location.energy_sources || [],
      show_on_map: location.show_on_map,
      latitude: location.latitude ?? "",
      longitude: location.longitude ?? "",
      description: location.description || "",
    },
  });

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
      energy_sources: location.energy_sources || [],
      show_on_map: location.show_on_map,
      latitude: location.latitude ?? "",
      longitude: location.longitude ?? "",
      description: location.description || "",
    });
    setOpen(true);
  };

  const onSubmit = async (data: LocationFormData) => {
    const updates = {
      name: data.name,
      type: data.type as LocationType,
      usage_type: data.usage_type as LocationUsageType,
      address: data.address || null,
      postal_code: data.postal_code || null,
      city: data.city || null,
      contact_person: data.contact_person || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      energy_sources: data.energy_sources,
      show_on_map: data.show_on_map,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      description: data.description || null,
    };

    const { error } = await updateLocation(location.id, updates);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("locations.updateError"),
        variant: "destructive",
      });
    } else {
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
                          <SelectItem value="standort">{t("locations.types.standort")}</SelectItem>
                          <SelectItem value="gebaeude">{t("locations.types.gebaeude")}</SelectItem>
                          <SelectItem value="bereich">{t("locations.types.bereich")}</SelectItem>
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
                render={() => (
                  <FormItem>
                    <FormLabel>{t("addLocation.energySources")}</FormLabel>
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
                                {t(source.labelKey as any)}
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
