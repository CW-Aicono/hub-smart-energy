import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, LatLngBounds } from "leaflet";
import { Location } from "@/hooks/useLocations";
import { Building2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet with bundlers
const defaultIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface LocationsMapProps {
  locations: Location[];
  onLocationClick?: (location: Location) => void;
  className?: string;
}

function MapBoundsUpdater({ locations }: { locations: Location[] }) {
  const map = useMap();

  useEffect(() => {
    const validLocations = locations.filter(
      (loc) => loc.latitude !== null && loc.longitude !== null
    );

    if (validLocations.length > 0) {
      const bounds = new LatLngBounds(
        validLocations.map((loc) => [loc.latitude!, loc.longitude!])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [locations, map]);

  return null;
}

const typeLabels: Record<string, string> = {
  standort: "Standort",
  gebaeude: "Gebäude",
  bereich: "Bereich",
};

export function LocationsMap({ locations, onLocationClick, className }: LocationsMapProps) {
  const [isClient, setIsClient] = useState(false);

  // Ensure component only renders on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  const validLocations = locations.filter(
    (loc) => loc.latitude !== null && loc.longitude !== null
  );

  // Default center: Germany
  const defaultCenter: [number, number] = [51.1657, 10.4515];
  const defaultZoom = 6;

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
    <div className={cn("h-full min-h-[300px] rounded-lg overflow-hidden border", className)}>
      <MapContainer
        key="locations-map"
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsUpdater locations={validLocations} />
        {validLocations.map((location) => (
          <Marker
            key={location.id}
            position={[location.latitude!, location.longitude!]}
            icon={defaultIcon}
            eventHandlers={{
              click: () => onLocationClick?.(location),
            }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{location.name}</span>
                </div>
                <Badge variant="secondary" className="mb-2">
                  {typeLabels[location.type] || location.type}
                </Badge>
                {location.address && (
                  <p className="text-sm text-muted-foreground">
                    {location.address}
                    {location.postal_code && `, ${location.postal_code}`}
                    {location.city && ` ${location.city}`}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
