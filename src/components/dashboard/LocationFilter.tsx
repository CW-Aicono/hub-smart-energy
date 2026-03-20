import { AlertTriangle, Building2, MapPin } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { useIntegrationErrors } from "@/hooks/useIntegrationErrors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";

interface LocationFilterProps {
  selectedLocationId: string | null;
  onLocationChange: (locationId: string | null) => void;
}

const ALL_LOCATIONS_VALUE = "__all_locations__";

export function LocationFilter({ selectedLocationId, onLocationChange }: LocationFilterProps) {
  const { locations, loading } = useLocations();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { locationsFullEnabled } = useModuleGuard();
  const { errorLocationIds } = useIntegrationErrors();
  const hasAnyErrors = errorLocationIds.size > 0;

  const mainLocation = locations.find((loc) => loc.is_main_location) || locations[0];

  useEffect(() => {
    if (!locationsFullEnabled && mainLocation && selectedLocationId !== mainLocation.id) {
      onLocationChange(mainLocation.id);
    }
  }, [locationsFullEnabled, mainLocation?.id]);

  const selectedLocation = selectedLocationId
    ? locations.find((loc) => loc.id === selectedLocationId)
    : null;

  const sortedLocations = [...locations].sort((a, b) => {
    if (a.is_main_location && !b.is_main_location) return -1;
    if (!a.is_main_location && b.is_main_location) return 1;
    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return <Skeleton className="h-9 w-48" />;
  }

  if (!locationsFullEnabled) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{mainLocation?.name ?? "—"}</span>
      </div>
    );
  }

  const currentValue = selectedLocationId ?? ALL_LOCATIONS_VALUE;

  return (
    <Select
      value={currentValue}
      onValueChange={(value) => {
        const nextLocationId = value === ALL_LOCATIONS_VALUE ? null : value;
        if (nextLocationId === selectedLocationId) return;
        onLocationChange(nextLocationId);
      }}
    >
      <SelectTrigger className="min-w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-[250px] bg-popover z-50">
        <SelectItem value={ALL_LOCATIONS_VALUE}>
          <span className="flex items-center gap-2">
            {hasAnyErrors ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <MapPin className="h-4 w-4 shrink-0" />
            )}
            <span>{T("loc.allLocations")}</span>
          </span>
        </SelectItem>

        {sortedLocations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            <span className="flex items-center gap-2 w-full">
              {errorLocationIds.has(location.id) ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <Building2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate flex-1">{location.name}</span>
              {location.is_main_location && (
                <span className="text-xs text-muted-foreground">{T("loc.mainBadge")}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
