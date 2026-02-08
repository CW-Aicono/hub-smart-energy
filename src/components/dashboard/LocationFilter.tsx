import { Building2, ChevronDown, MapPin } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLocations, Location } from "@/hooks/useLocations";
import { Skeleton } from "@/components/ui/skeleton";

interface LocationFilterProps {
  selectedLocationId: string | null;
  onLocationChange: (locationId: string | null) => void;
}

export function LocationFilter({ selectedLocationId, onLocationChange }: LocationFilterProps) {
  const { locations, loading } = useLocations();

  // Find the selected location name
  const selectedLocation = selectedLocationId
    ? locations.find((loc) => loc.id === selectedLocationId)
    : null;

  // Sort locations: main location first, then alphabetically
  const sortedLocations = [...locations].sort((a, b) => {
    if (a.is_main_location && !b.is_main_location) return -1;
    if (!a.is_main_location && b.is_main_location) return 1;
    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return <Skeleton className="h-9 w-48" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-[200px] justify-between">
          <span className="flex items-center gap-2 truncate">
            {selectedLocation ? (
              <>
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{selectedLocation.name}</span>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 shrink-0" />
                <span>Alle Liegenschaften</span>
              </>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[250px] bg-popover z-50">
        <DropdownMenuItem
          onClick={() => onLocationChange(null)}
          className={!selectedLocationId ? "bg-accent" : ""}
        >
          <MapPin className="h-4 w-4 mr-2" />
          Alle Liegenschaften
        </DropdownMenuItem>
        
        {locations.length > 0 && <DropdownMenuSeparator />}
        
        {sortedLocations.map((location) => (
          <DropdownMenuItem
            key={location.id}
            onClick={() => onLocationChange(location.id)}
            className={selectedLocationId === location.id ? "bg-accent" : ""}
          >
            <Building2 className="h-4 w-4 mr-2 shrink-0" />
            <span className="truncate flex-1">{location.name}</span>
            {location.is_main_location && (
              <span className="text-xs text-muted-foreground ml-2">Haupt</span>
            )}
          </DropdownMenuItem>
        ))}
        
        {locations.length === 0 && (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">Keine Liegenschaften vorhanden</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
