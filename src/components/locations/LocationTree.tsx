import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Location, LocationType } from "@/hooks/useLocations";
import { useFloors, Floor } from "@/hooks/useFloors";
import { useFloorRooms } from "@/hooks/useFloorRooms";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useUserRole } from "@/hooks/useUserRole";
import { LocationStatus } from "@/hooks/useLocationStatus";
import { ChevronRight, ChevronDown, Building2, Building, MapPin, Star, Layers, Wifi, WifiOff, AlertCircle, DoorOpen, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EditLocationDialog } from "./EditLocationDialog";
import { ArchiveLocationDialog } from "./ArchiveLocationDialog";

interface LocationTreeProps {
  locations: Location[];
  selectedId?: string;
  onSelect?: (location: Location) => void;
  onRefresh?: () => void;
  locationStatuses?: Map<string, LocationStatus>;
}

interface LocationNodeProps {
  location: Location;
  level: number;
  selectedId?: string;
  onSelect?: (location: Location) => void;
  onRefresh?: () => void;
  isAdmin: boolean;
  showFloors?: boolean;
  locationStatuses?: Map<string, LocationStatus>;
  isLast?: boolean;
}

interface FloorNodeProps {
  floor: Floor;
  level: number;
  locationId: string;
}

const typeIcons: Record<LocationType, typeof MapPin> = {
  einzelgebaeude: Building2,
  gebaeudekomplex: Building,
  sonstiges: MapPin,
};

const typeLabels: Record<LocationType, string> = {
  einzelgebaeude: "Einzelgebäude",
  gebaeudekomplex: "Gebäudekomplex",
  sonstiges: "Sonstiges",
};

const typeColors: Record<LocationType, string> = {
  einzelgebaeude: "bg-blue-100 text-blue-800 border-blue-200",
  gebaeudekomplex: "bg-purple-100 text-purple-800 border-purple-200",
  sonstiges: "bg-slate-100 text-slate-700 border-slate-200",
};

const energyTypeColors: Record<string, string> = {
  strom: "text-amber-600",
  gas: "text-blue-500",
  waerme: "text-red-500",
  wasser: "text-cyan-500",
  solar: "text-yellow-500",
  oel: "text-stone-600",
  pellets: "text-orange-700",
};

function MeterNode({ meter, level, isLast }: { meter: Meter; level: number; isLast: boolean }) {
  const indent = level * 20 + 12;
  const colorClass = energyTypeColors[meter.energy_type] || "text-muted-foreground";
  return (
    <div className="relative flex items-center gap-2 px-3 py-1 text-sm text-muted-foreground/80">
      <div
        className="absolute top-0 bottom-0 border-l border-border"
        style={{ left: `${indent}px` }}
      />
      <div
        className="absolute border-t border-border"
        style={{ left: `${indent}px`, width: 16, top: '50%' }}
      />
      {isLast && (
        <div
          className="absolute bottom-0 bg-background"
          style={{ left: `${indent - 1}px`, width: 3, top: '50%' }}
        />
      )}
      <div style={{ paddingLeft: `${indent + 20}px` }} className="flex items-center gap-2">
        <Gauge className={cn("h-3 w-3 flex-shrink-0", colorClass)} />
        <span className="text-xs">{meter.name}</span>
        {meter.meter_number && (
          <span className="text-xs text-muted-foreground/50">#{meter.meter_number}</span>
        )}
      </div>
    </div>
  );
}

function RoomNode({ name, level, isLast, meters = [] }: { name: string; level: number; isLast: boolean; meters?: Meter[] }) {
  const indent = level * 20 + 12;
  const hasMeters = meters.length > 0;
  const [expanded, setExpanded] = useState(false);
  const isLastWithNoExpand = isLast && (!expanded || !hasMeters);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-1 text-sm text-muted-foreground/80">
        <div
          className="absolute top-0 bottom-0 border-l border-border"
          style={{ left: `${indent}px` }}
        />
        <div
          className="absolute border-t border-border"
          style={{ left: `${indent}px`, width: 16, top: '50%' }}
        />
        {isLastWithNoExpand && (
          <div
            className="absolute bottom-0 bg-background"
            style={{ left: `${indent - 1}px`, width: 3, top: '50%' }}
          />
        )}
        <div style={{ paddingLeft: `${indent + 20}px` }} className="flex items-center gap-2">
          {hasMeters ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-muted-foreground/20 rounded -ml-5"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : null}
          <DoorOpen className="h-3 w-3 flex-shrink-0" />
          <span className="text-xs">{name}</span>
          {hasMeters && (
            <span className="text-xs text-muted-foreground/50">{meters.length} Zähler</span>
          )}
        </div>
      </div>

      {expanded && hasMeters && (
        <div>
          {meters.map((meter, idx) => (
            <MeterNode
              key={meter.id}
              meter={meter}
              level={level + 1}
              isLast={idx === meters.length - 1}
            />
          ))}
        </div>
      )}

      {isLast && expanded && hasMeters && (
        <div
          className="absolute bg-background"
          style={{ left: `${indent - 1}px`, width: 3, bottom: 0, height: 0 }}
        />
      )}
    </div>
  );
}

function FloorNode({ floor, level, isLast, locationId }: FloorNodeProps & { isLast: boolean }) {
  const indent = level * 20 + 12;
  const { rooms } = useFloorRooms(floor.id);
  const { meters } = useMeters(locationId);
  const [expanded, setExpanded] = useState(false);

  // Meters on this floor that are not archived
  const floorMeters = useMemo(() =>
    meters.filter(m => !m.is_archived && m.floor_id === floor.id),
    [meters, floor.id]
  );

  // Meters grouped by room
  const metersByRoom = useMemo(() => {
    const map = new Map<string, Meter[]>();
    floorMeters.forEach(m => {
      if (m.room_id) {
        const existing = map.get(m.room_id) || [];
        existing.push(m);
        map.set(m.room_id, existing);
      }
    });
    return map;
  }, [floorMeters]);

  // Meters not assigned to any room
  const unassignedMeters = useMemo(() =>
    floorMeters.filter(m => !m.room_id),
    [floorMeters]
  );

  const hasRooms = rooms.length > 0;
  const hasContent = hasRooms || unassignedMeters.length > 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
        <div
          className="absolute top-0 bottom-0 border-l border-border"
          style={{ left: `${indent}px` }}
        />
        <div
          className="absolute border-t border-border"
          style={{ left: `${indent}px`, width: 16, top: '50%' }}
        />
        {isLast && !expanded && (
          <div
            className="absolute bottom-0 bg-background"
            style={{ left: `${indent - 1}px`, width: 3, top: '50%' }}
          />
        )}
        <div style={{ paddingLeft: `${indent + 20}px` }} className="flex items-center gap-2">
          {hasContent ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-muted-foreground/20 rounded -ml-5"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          <Layers className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{floor.name}</span>
          {floor.area_sqm && (
            <span className="text-xs">({floor.area_sqm} m²)</span>
          )}
          {hasRooms && (
            <span className="text-xs text-muted-foreground/60">{rooms.length} Räume</span>
          )}
          {floorMeters.length > 0 && (
            <span className="text-xs text-muted-foreground/60">{floorMeters.length} Zähler</span>
          )}
        </div>
      </div>

      {expanded && hasContent && (
        <div>
          {/* Rooms with their meters */}
          {rooms.map((room, idx) => {
            const roomMeters = metersByRoom.get(room.id) || [];
            const isLastItem = idx === rooms.length - 1 && unassignedMeters.length === 0;
            return (
              <RoomNode
                key={room.id}
                name={room.name}
                level={level + 2}
                isLast={isLastItem}
                meters={roomMeters}
              />
            );
          })}
          {/* Meters not assigned to a room - shown directly under floor */}
          {unassignedMeters.map((meter, idx) => (
            <MeterNode
              key={meter.id}
              meter={meter}
              level={level + 2}
              isLast={idx === unassignedMeters.length - 1}
            />
          ))}
        </div>
      )}

      {isLast && expanded && hasContent && (
        <div
          className="absolute bg-background"
          style={{ left: `${indent - 1}px`, width: 3, bottom: 0, height: 0 }}
        />
      )}
    </div>
  );
}

function LocationNode({ location, level, selectedId, onSelect, onRefresh, isAdmin, showFloors = true, locationStatuses, isLast = false }: LocationNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const { floors } = useFloors(showFloors ? location.id : undefined);
  
  const hasChildren = location.children && location.children.length > 0;
  const hasFloors = floors.length > 0;
  const isSelected = selectedId === location.id;
  const Icon = typeIcons[location.type];
  
  const isEinzelgebaeude = location.type === "einzelgebaeude";
  const isChildOfComplex = level > 0;
  
  const shouldShowFloors = isEinzelgebaeude || isChildOfComplex;
  const hasExpandableContent = hasChildren || (shouldShowFloors && hasFloors);

  const status = locationStatuses?.get(location.id);
  const getOnlineStatusBadge = () => {
    if (!status || status.totalIntegrations === 0) return null;
    
    const badges: React.ReactNode[] = [];

    if (status.isOnline) {
      badges.push(
        <Badge key="online" variant="outline" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
          <Wifi className="h-3 w-3" />
        </Badge>
      );
    } else if (status.onlineIntegrations === 0 && !status.hasUnconfigured) {
      badges.push(
        <Badge key="offline" variant="outline" className="text-xs gap-1 bg-destructive/10 text-destructive border-destructive/20">
          <WifiOff className="h-3 w-3" />
        </Badge>
      );
    }

    if (status.hasUnconfigured) {
      badges.push(
        <Badge key="unconf" variant="outline" className="text-xs gap-1 bg-secondary/50 text-secondary-foreground border-border">
          <AlertCircle className="h-3 w-3" />
        </Badge>
      );
    }

    return badges.length > 0 ? <>{badges}</> : null;
  };

  const indent = level * 20 + 12;

  return (
    <div className="relative">
      {level > 0 && (
        <>
          <div
            className="absolute top-0 bottom-0 border-l border-border"
            style={{ left: `${indent}px` }}
          />
          <div
            className="absolute border-t border-border"
            style={{ left: `${indent}px`, width: 16, top: '20px' }}
          />
          {isLast && (
            <div
              className="absolute bottom-0 bg-background"
              style={{ left: `${indent - 1}px`, width: 3, top: '20px' }}
            />
          )}
        </>
      )}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
      >
        {hasExpandableContent ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-muted-foreground/20 rounded"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <div
          className="flex items-center gap-2 flex-1 cursor-pointer"
          onClick={() => onSelect?.(location)}
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Link 
            to={`/locations/${location.id}`}
            className="flex-1 font-medium text-sm hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {location.name}
          </Link>
          {getOnlineStatusBadge()}
          {location.is_main_location && (
            <Badge variant="secondary" className="text-xs gap-1 bg-secondary text-secondary-foreground border-border">
              <Star className="h-3 w-3 fill-primary text-primary" />
              Hauptstandort
            </Badge>
          )}
          <Badge variant="outline" className={cn("text-xs", typeColors[location.type])}>
            {typeLabels[location.type]}
          </Badge>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <EditLocationDialog
              location={location}
              onSuccess={() => onRefresh?.()}
            />
            <ArchiveLocationDialog
              location={location}
              onSuccess={() => onRefresh?.()}
            />
          </div>
        )}
      </div>
      
      {expanded && (
        <>
          {hasChildren && (
            <div>
              {location.children!.map((child, idx) => (
                <LocationNode
                  key={child.id}
                  location={child}
                  level={level + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onRefresh={onRefresh}
                  isAdmin={isAdmin}
                  showFloors={true}
                  locationStatuses={locationStatuses}
                  isLast={idx === location.children!.length - 1 && !(shouldShowFloors && hasFloors)}
                />
              ))}
            </div>
          )}
          
          {shouldShowFloors && hasFloors && (
            <div>
              {floors.map((floor, idx) => (
                <FloorNode
                  key={floor.id}
                  floor={floor}
                  level={level + 1}
                  isLast={idx === floors.length - 1}
                  locationId={location.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LocationTree({ locations, selectedId, onSelect, onRefresh, locationStatuses }: LocationTreeProps) {
  const { isAdmin } = useUserRole();

  if (locations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Keine Standorte vorhanden</p>
        <p className="text-sm">Fügen Sie Ihren ersten Standort hinzu</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {locations.map((location) => (
        <LocationNode
          key={location.id}
          location={location}
          level={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onRefresh={onRefresh}
          isAdmin={isAdmin}
          locationStatuses={locationStatuses}
        />
      ))}
    </div>
  );
}
