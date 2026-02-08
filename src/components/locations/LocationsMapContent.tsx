import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, LatLngBounds, Map as LeafletMap } from "leaflet";
import { Location } from "@/hooks/useLocations";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
// CSS is imported globally in App.tsx

const defaultIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface LocationsMapContentProps {
  locations: Location[];
  onLocationClick?: (location: Location) => void;
  className?: string;
}

function MapBoundsUpdater({ locations }: { locations: Location[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = new LatLngBounds(
        locations.map((loc) => [loc.latitude!, loc.longitude!])
      );
      map.fitBounds(bounds, { padding: [50, 50] });

      // Prevent a common Leaflet issue where the map is rendered before its container
      // has a final size (can appear as a blank/white map).
      setTimeout(() => map.invalidateSize(), 0);
    }
  }, [locations, map]);

  return null;
}

const typeLabels: Record<string, string> = {
  standort: "Standort",
  gebaeude: "Gebäude",
  bereich: "Bereich",
};

function LocationsMapContent({ locations, onLocationClick, className }: LocationsMapContentProps) {
  const mapRef = useRef<LeafletMap | null>(null);

  const defaultCenter: [number, number] = [51.1657, 10.4515];
  const defaultZoom = 6;

  const containerClass = useMemo(
    () => cn("h-full min-h-[300px] rounded-lg overflow-hidden border", className),
    [className]
  );

  return (
    <div className={containerClass}>
      <MapContainer
        ref={mapRef}
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full"
        scrollWheelZoom={true}
        whenReady={() => {
          // Ensure tiles render after mount
          setTimeout(() => mapRef.current?.invalidateSize(), 0);
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsUpdater locations={locations} />

        {locations.map((location) => (
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

export default LocationsMapContent;
