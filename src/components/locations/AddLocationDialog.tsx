import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocations, LocationType } from "@/hooks/useLocations";
import { useLocationEnergySources, type LocationEnergySourceInsert } from "@/hooks/useLocationEnergySources";
import { LocationEnergySourcesEditor } from "@/components/locations/LocationEnergySourcesEditor";
import { useUserRole } from "@/hooks/useUserRole";
import { useGeocode } from "@/hooks/useGeocode";
import { useTranslation } from "@/hooks/useTranslation";
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
import { Plus, MapPin, LocateFixed, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const locationSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(100),
  type: z.enum(["einzelgebaeude", "gebaeudekomplex", "sonstiges"] as const),
  parent_id: z.string().nullable().optional(),
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
});

type LocationFormData = z.infer<typeof locationSchema>;

interface AddLocationDialogProps {
  parentId?: string;
}

export function AddLocationDialog({ parentId }: AddLocationDialogProps) {
  const [open, setOpen] = useState(false);
  const { locations, createLocation } = useLocations();
  const availableComplexes = locations.filter(loc => loc.type === "gebaeudekomplex");
  const { isAdmin } = useUserRole();
  const { geocodeAddress, isLoading: isGeocoding } = useGeocode();
  const { toast } = useToast();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

  const ENERGY_SOURCES = [
    { id: "strom", label: T("addLoc.energyStrom") },
    { id: "gas", label: T("addLoc.energyGas") },
    { id: "waerme", label: T("addLoc.energyWaerme") },
    { id: "solar", label: T("addLoc.energySolar") },
    { id: "wasser", label: T("addLoc.energyWasser") },
    { id: "oel", label: T("addLoc.energyOel") },
    { id: "pellets", label: T("addLoc.energyPellets") },
  ];

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "",
      type: "einzelgebaeude",
      usage_type: "sonstiges",
      address: "",
      postal_code: "",
      city: "",
      contact_person: "",
      contact_email: "",
      contact_phone: "",
      energy_sources: [],
      show_on_map: true,
      is_main_location: false,
      description: "",
      parent_id: parentId || null,
    },
  });

  const watchedType = form.watch("type");
  const watchedIsMain = form.watch("is_main_location");
  const currentMainLocation = locations.find(loc => loc.is_main_location);

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
      is_main_location: data.is_main_location,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      description: data.description || null,
      parent_id: (data.parent_id && data.parent_id !== "none") ? data.parent_id : (parentId || null),
    };

    const { error } = await createLocation(locationData);

    if (error) {
      toast({
        title: T("common.error"),
        description: T("addLoc.errorCreate"),
        variant: "destructive",
      });
    } else {
      toast({
        title: T("common.success"),
        description: T("addLoc.success"),
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
          {T("addLoc.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {T("addLoc.title")}
          </DialogTitle>
          <DialogDescription>
            {T("addLoc.description")}
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
                    <FormLabel>{T("addLoc.nameLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={T("addLoc.namePlaceholder")} {...field} />
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
                    <FormLabel>{T("addLoc.typeLabel")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="einzelgebaeude">{T("addLoc.typeSingle")}</SelectItem>
                        <SelectItem value="gebaeudekomplex">{T("addLoc.typeComplex")}</SelectItem>
                        <SelectItem value="sonstiges">{T("addLoc.typeOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Parent Complex Selection */}
            {watchedType === "einzelgebaeude" && availableComplexes.length > 0 && !parentId && (
              <FormField
                control={form.control}
                name="parent_id"
                render={({ field }) => {
                  const selectedComplex = availableComplexes.find(c => c.id === field.value);
                  const hasComplexAddress = selectedComplex && (selectedComplex.address || selectedComplex.city);
                  
                  const copyAddressFromComplex = () => {
                    if (selectedComplex) {
                      form.setValue("address", selectedComplex.address || "");
                      form.setValue("postal_code", selectedComplex.postal_code || "");
                      form.setValue("city", selectedComplex.city || "");
                      if (selectedComplex.latitude) form.setValue("latitude", selectedComplex.latitude);
                      if (selectedComplex.longitude) form.setValue("longitude", selectedComplex.longitude);
                    }
                  };
                  
                  return (
                    <FormItem>
                      <FormLabel>{T("addLoc.parentComplex")}</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{T("addLoc.noComplex")}</SelectItem>
                          {availableComplexes.map((complex) => (
                            <SelectItem key={complex.id} value={complex.id}>
                              {complex.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {T("addLoc.parentDesc")}
                      </FormDescription>
                      {hasComplexAddress && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={copyAddressFromComplex}
                        >
                          <MapPin className="h-4 w-4 mr-2" />
                          {T("addLoc.copyAddress")}
                        </Button>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            {/* Usage Type */}
            <FormField
              control={form.control}
              name="usage_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{T("addLoc.usageType")}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="verwaltungsgebaeude">{T("locations.usage.verwaltungsgebaeude")}</SelectItem>
                      <SelectItem value="universitaet">{T("locations.usage.universitaet")}</SelectItem>
                      <SelectItem value="schule">{T("locations.usage.schule")}</SelectItem>
                      <SelectItem value="kindertageseinrichtung">{T("locations.usage.kindertageseinrichtung")}</SelectItem>
                      <SelectItem value="sportstaette">{T("locations.usage.sportstaette")}</SelectItem>
                      <SelectItem value="jugendzentrum">{T("locations.usage.jugendzentrum")}</SelectItem>
                      <SelectItem value="gewerbe">{T("locations.usage.gewerbe")}</SelectItem>
                      <SelectItem value="privat">{T("locations.usage.privat")}</SelectItem>
                      <SelectItem value="sonstiges">{T("locations.usage.sonstiges")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Address */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">{T("addLoc.addressSection")}</h4>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{T("addLoc.street")}</FormLabel>
                    <FormControl>
                      <Input placeholder={T("addLoc.streetPlaceholder")} {...field} />
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
                      <FormLabel>{T("addLoc.postalCode")}</FormLabel>
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
                      <FormLabel>{T("addLoc.city")}</FormLabel>
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
              <h4 className="text-sm font-medium">{T("addLoc.contactSection")}</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{T("addLoc.contactName")}</FormLabel>
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
                      <FormLabel>{T("addLoc.email")}</FormLabel>
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
                      <FormLabel>{T("addLoc.phone")}</FormLabel>
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
                  <FormLabel>{T("addLoc.energySources")}</FormLabel>
                  <FormDescription>
                    {T("addLoc.energySourcesDesc")}
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
                <h4 className="text-sm font-medium">{T("addLoc.coordinates")}</h4>
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
                  {T("addLoc.geocode")}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{T("addLoc.latitude")}</FormLabel>
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
                      <FormLabel>{T("addLoc.longitude")}</FormLabel>
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
                    <FormLabel className="text-base">{T("addLoc.showOnMap")}</FormLabel>
                    <FormDescription>
                      {T("addLoc.showOnMapDesc")}
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

            {/* Main Location */}
            <FormField
              control={form.control}
              name="is_main_location"
              render={({ field }) => (
                <FormItem className="flex flex-col rounded-lg border p-4 border-primary/20 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{T("addLoc.mainLocation")}</FormLabel>
                      <FormDescription>
                        {T("addLoc.mainLocationDesc")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  {watchedIsMain && currentMainLocation && (
                    <Alert variant="default" className="mt-3 border-amber-500/30 bg-amber-500/10">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
                        {T("addLoc.mainLocationWarn").replace("{name}", currentMainLocation.name)}
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
                  <FormLabel>{T("addLoc.descriptionLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={T("addLoc.descPlaceholder")}
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
                {T("common.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? T("addLoc.submitting") : T("addLoc.button")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}