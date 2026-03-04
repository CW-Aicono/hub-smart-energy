import { useEffect, useState, lazy, Suspense } from "react";
import { Location } from "@/hooks/useLocations";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationsMapProps {
  locations: Location[];
  onLocationClick?: (location: Location) => void;
  className?: string;
  errorLocationIds?: Set<string>;
}

// Lazy load the actual map implementation
const LazyMapContent = lazy(() => import("./LocationsMapContent"));

export function LocationsMap({ locations, onLocationClick, className, errorLocationIds }: LocationsMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Filter: only show locations with coordinates AND exclude child buildings of complexes
  const validLocations = locations.filter(
    (loc) => loc.latitude !== null && loc.longitude !== null && !loc.parent_id
  );

  if (!isClient) {
    return (
      <div className={cn("h-full min-h-[300px] rounded-lg border bg-muted/50 flex items-center justify-center", className)}>
        <div className="animate-pulse text-muted-foreground">Karte wird geladen...</div>
      </div>
    );
  }

  if (validLocations.length === 0) {
    return (
      <div className={cn("h-full min-h-[300px] rounded-lg border bg-muted/50 flex items-center justify-center", className)}>
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Keine Standorte mit Koordinaten vorhanden</p>
          <p className="text-sm">Fügen Sie Standorte mit GPS-Koordinaten hinzu</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className={cn("h-full min-h-[300px] rounded-lg border bg-muted/50 flex items-center justify-center", className)}>
          <div className="animate-pulse text-muted-foreground">Karte wird geladen...</div>
        </div>
      }
    >
      <LazyMapContent
        locations={validLocations}
        onLocationClick={onLocationClick}
        className={className}
        errorLocationIds={errorLocationIds}
      />
    </Suspense>
  );
}
