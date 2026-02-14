import { useMemo, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from "react-leaflet";
import { Icon, LatLngBounds } from "leaflet";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlugZap, Zap, ZapOff, AlertTriangle, WifiOff, LocateFixed, Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  available: "#22c55e",   // grün
  charging: "#3b82f6",    // blau
  faulted: "#ef4444",     // rot
  unavailable: "#eab308", // gelb
  offline: "#f97316",     // orange
};

function createColoredIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${color}" stroke="#333" stroke-width="1"/>
    <circle cx="12.5" cy="12.5" r="5" fill="white"/>
  </svg>`;
  return new Icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
}

interface ChargePointForMap {
  id: string;
  name: string;
  ocpp_id: string;
  status: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  max_power_kw: number;
  connector_type?: string;
  connector_count?: number;
}

interface ChargePointsMapProps {
  chargePoints: ChargePointForMap[];
  onChargePointClick?: (cp: ChargePointForMap) => void;
  className?: string;
  showLocateButton?: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  available: { label: "Verfügbar", variant: "default" },
  charging: { label: "Lädt", variant: "secondary" },
  faulted: { label: "Fehler", variant: "destructive" },
  unavailable: { label: "Nicht verfügbar", variant: "outline" },
  offline: { label: "Offline", variant: "outline" },
};

function LocateUserControl({ userPos }: { userPos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (userPos) {
      map.setView(userPos, 15, { animate: true });
    }
  }, [userPos, map]);
  return null;
}

function MapController({ points }: { points: ChargePointForMap[] }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length > 0) {
        const bounds = new LatLngBounds(
          points.map((p) => [p.latitude!, p.longitude!])
        );
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [points, map]);
  return null;
}

export default function ChargePointsMap({ chargePoints, onChargePointClick, className, showLocateButton = false }: ChargePointsMapProps) {
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation wird nicht unterstützt");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => {
        toast.error("Standort konnte nicht ermittelt werden");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);
  const validPoints = useMemo(
    () => chargePoints.filter((cp) => cp.latitude != null && cp.longitude != null),
    [chargePoints]
  );

  const defaultCenter: [number, number] = useMemo(() => {
    if (validPoints.length > 0) {
      const avgLat = validPoints.reduce((s, p) => s + (p.latitude || 0), 0) / validPoints.length;
      const avgLng = validPoints.reduce((s, p) => s + (p.longitude || 0), 0) / validPoints.length;
      return [avgLat, avgLng];
    }
    return [51.1657, 10.4515];
  }, [validPoints]);

  if (validPoints.length === 0) {
    return (
      <div className={cn("h-[400px] rounded-lg border bg-muted/50 flex items-center justify-center", className)}>
        <div className="text-center text-muted-foreground">
          <PlugZap className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Keine Ladepunkte mit Koordinaten vorhanden</p>
          <p className="text-sm">Ladepunkte mit Adresse erhalten automatisch Koordinaten</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-[400px] w-full rounded-lg overflow-hidden border relative z-0", className)}>
      <MapContainer
        center={defaultCenter}
        zoom={validPoints.length === 1 ? 14 : 6}
        className="h-full w-full"
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController points={validPoints} />
        {userPos && <LocateUserControl userPos={userPos} />}
        {userPos && (
          <>
            <Circle center={userPos} radius={12} pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 2 }} />
            <Circle center={userPos} radius={80} pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 1 }} />
          </>
        )}
        {validPoints.map((cp) => {
          const cfg = statusConfig[cp.status] || statusConfig.offline;
          return (
            <Marker
              key={cp.id}
              position={[cp.latitude!, cp.longitude!]}
              icon={createColoredIcon(statusColors[cp.status] || statusColors.offline)}
              eventHandlers={{ click: () => onChargePointClick?.(cp) }}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-2 mb-1">
                    <PlugZap className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{cp.name}</span>
                  </div>
                  <Badge variant={cfg.variant} className="mb-1">{cfg.label}</Badge>
                  <div className="text-xs space-y-0.5 mt-1">
                    {cp.connector_type && (
                      <p>Stecker: <span className="font-medium">{cp.connector_type}</span>{cp.connector_count && cp.connector_count > 1 ? ` (×${cp.connector_count})` : ""}</p>
                    )}
                    <p>{cp.max_power_kw} kW</p>
                    {cp.address && <p className="text-muted-foreground">{cp.address}</p>}
                  </div>
                  {cp.latitude && cp.longitude && (() => {
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${cp.latitude},${cp.longitude}`;
                    const appleUrl = `maps://maps.apple.com/?daddr=${cp.latitude},${cp.longitude}&dirflg=d`;
                    return (
                      <div className="flex gap-1.5 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-xs"
                          onClick={(e) => { e.stopPropagation(); window.open(googleUrl, "_blank"); }}
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Google Maps
                        </Button>
                        {isIOS && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); window.open(appleUrl, "_blank"); }}
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            Apple Karten
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Map control buttons */}
      {showLocateButton && (
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full shadow-lg bg-background/95 backdrop-blur-sm border"
            onClick={handleLocate}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <LocateFixed className={cn("h-5 w-5", userPos && "text-primary")} />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
