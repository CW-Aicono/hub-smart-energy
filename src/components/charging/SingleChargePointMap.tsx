import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { Icon } from "leaflet";
import type { Marker as LeafletMarker } from "leaflet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LocateFixed, Loader2, Move, Check, MapPin } from "lucide-react";
import { toast } from "sonner";

const PRIMARY = "#22c55e";

function createIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${color}" stroke="#333" stroke-width="1"/>
    <circle cx="12.5" cy="12.5" r="5" fill="white"/>
  </svg>`;
  return new Icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
}

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function Recenter({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(pos, map.getZoom() < 13 ? 16 : map.getZoom(), { animate: true });
  }, [pos[0], pos[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface SingleChargePointMapProps {
  latitude: number | null;
  longitude: number | null;
  /** Called whenever the marker is dragged to a new position. */
  onPositionChange: (lat: number, lng: number) => void;
  /** When true, marker is always draggable and no edit toggle is shown. */
  alwaysEditable?: boolean;
  className?: string;
}

/**
 * A single-marker map for a charge point that lets the user drag the marker
 * to fine-tune its exact location. The new position is reported through
 * `onPositionChange` and should be persisted by the parent.
 */
export default function SingleChargePointMap({
  latitude,
  longitude,
  onPositionChange,
  alwaysEditable = false,
  className,
}: SingleChargePointMapProps) {
  const isTouchDevice =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const [editMode, setEditMode] = useState(alwaysEditable);
  const [locating, setLocating] = useState(false);
  const markerRef = useRef<LeafletMarker | null>(null);

  useEffect(() => {
    if (alwaysEditable) setEditMode(true);
  }, [alwaysEditable]);

  const center: [number, number] | null = useMemo(() => {
    if (latitude == null || longitude == null) return null;
    return [latitude, longitude];
  }, [latitude, longitude]);

  if (!center) {
    return (
      <div
        className={cn(
          "h-[280px] rounded-lg border bg-muted/40 flex items-center justify-center text-center",
          className,
        )}
      >
        <div className="text-muted-foreground text-sm px-6">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p>Noch keine Koordinaten hinterlegt.</p>
          <p className="text-xs mt-1">
            Adresse eingeben und auf das Lupensymbol klicken, oder den Standort
            manuell ermitteln.
          </p>
        </div>
      </div>
    );
  }

  const handleLocate = () => {
    if (!navigator.geolocation) {
      toast.error("Standortermittlung nicht verfügbar");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPositionChange(pos.coords.latitude, pos.coords.longitude);
        toast.success("Standort übernommen");
        setLocating(false);
      },
      () => {
        toast.error("Standort konnte nicht ermittelt werden");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div
      className={cn(
        "h-[300px] w-full rounded-lg overflow-hidden border relative z-0",
        className,
      )}
    >
      <MapContainer
        center={center}
        zoom={16}
        className="h-full w-full"
        scrollWheelZoom={false}
        dragging={!isTouchDevice}
        touchZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInvalidator />
        <Recenter pos={center} />
        <Marker
          ref={(ref) => {
            markerRef.current = ref;
          }}
          position={center}
          icon={createIcon(PRIMARY)}
          draggable={editMode}
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as LeafletMarker;
              const pos = m.getLatLng();
              onPositionChange(pos.lat, pos.lng);
              toast.success("Position aktualisiert");
            },
          }}
        />
      </MapContainer>

      {editMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2">
          <Move className="h-4 w-4" />
          Marker an die exakte Position ziehen
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-2">
        {!alwaysEditable && (
          <Button
            size={editMode ? "default" : "icon"}
            variant={editMode ? "default" : "secondary"}
            className={cn(
              "shadow-lg backdrop-blur-sm border",
              editMode
                ? "rounded-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                : "h-10 w-10 rounded-full bg-background/95",
            )}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? (
              <>
                <Check className="h-4 w-4" />
                Fertig
              </>
            ) : (
              <Move className="h-5 w-5" />
            )}
          </Button>
        )}
        <Button
          size="icon"
          variant="secondary"
          className="h-10 w-10 rounded-full shadow-lg bg-background/95 backdrop-blur-sm border"
          onClick={handleLocate}
          disabled={locating}
          title="Mein Standort"
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LocateFixed className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
