import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, LatLngBounds, Map as LeafletMap } from "leaflet";
import { Location } from "@/hooks/useLocations";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
// CSS is imported globally in App.tsx

const defaultIcon = new Icon({
  iconUrl: "/images/marker-icon.png",
  iconRetinaUrl: "/images/marker-icon-2x.png",
  shadowUrl: "/images/marker-shadow.png",
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

function MapController({ locations, isTouchDevice }: { locations: Location[]; isTouchDevice: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!isTouchDevice) {
      const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          map.scrollWheelZoom.enable();
        } else {
          map.scrollWheelZoom.disable();
        }
      };
      const container = map.getContainer();
      container.addEventListener("wheel", handleWheel, { passive: true });
      return () => container.removeEventListener("wheel", handleWheel);
    }
  }, [map, isTouchDevice]);

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      
      if (locations.length > 0) {
        const bounds = new LatLngBounds(
          locations.map((loc) => [loc.latitude!, loc.longitude!])
        );
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [locations, map]);

  return null;
}

function LocationsMapContent({ locations, onLocationClick, className }: LocationsMapContentProps) {
  const { t } = useTranslation();
  const [mapReady, setMapReady] = useState(false);
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const defaultCenter: [number, number] = useMemo(() => {
    if (locations.length > 0) {
      const avgLat = locations.reduce((sum, loc) => sum + (loc.latitude || 0), 0) / locations.length;
      const avgLng = locations.reduce((sum, loc) => sum + (loc.longitude || 0), 0) / locations.length;
      return [avgLat, avgLng];
    }
    return [51.1657, 10.4515]; // Germany center
  }, [locations]);

  const containerClass = useMemo(
    () => cn("h-[400px] w-full rounded-lg overflow-hidden border relative z-0", className),
    [className]
  );

  return (
    <div className={containerClass}>
      <MapContainer
        center={defaultCenter}
        zoom={locations.length === 1 ? 14 : 6}
        className="h-full w-full"
        scrollWheelZoom={false}
        dragging={!isTouchDevice}
        touchZoom={true}
        style={{ height: "100%", width: "100%" }}
        whenReady={() => setMapReady(true)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mapReady && <MapController locations={locations} isTouchDevice={isTouchDevice} />}

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
                  {t(`locations.types.${location.type}` as any)}
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
