import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Location, LocationType } from "@/hooks/useLocations";
import { useFloors, Floor } from "@/hooks/useFloors";
import { useFloorRooms } from "@/hooks/useFloorRooms";
import { useUserRole } from "@/hooks/useUserRole";
import { LocationStatus } from "@/hooks/useLocationStatus";
import { ChevronRight, ChevronDown, Building2, Building, MapPin, Star, Layers, Wifi, WifiOff, AlertCircle, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EditLocationDialog } from "./EditLocationDialog";
import { DeleteLocationDialog } from "./DeleteLocationDialog";

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

function RoomNode({ name, level, isLast }: { name: string; level: number; isLast: boolean }) {
  const indent = level * 20 + 12;
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
        <DoorOpen className="h-3 w-3 flex-shrink-0" />
        <span className="text-xs">{name}</span>
      </div>
    </div>
  );
}

function FloorNode({ floor, level, isLast }: FloorNodeProps & { isLast: boolean }) {
  const indent = level * 20 + 12;
  const { rooms } = useFloorRooms(floor.id);
  const hasRooms = rooms.length > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
        {/* Tree connector lines */}
        <div
          className="absolute top-0 bottom-0 border-l border-border"
          style={{ left: `${indent}px` }}
        />
        {/* Horizontal branch */}
        <div
          className="absolute border-t border-border"
          style={{ left: `${indent}px`, width: 16, top: '50%' }}
        />
        {/* Hide vertical line below last item */}
        {isLast && !expanded && (
          <div
            className="absolute bottom-0 bg-background"
            style={{ left: `${indent - 1}px`, width: 3, top: '50%' }}
          />
        )}
        <div style={{ paddingLeft: `${indent + 20}px` }} className="flex items-center gap-2">
          {hasRooms ? (
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
        </div>
      </div>

      {expanded && hasRooms && (
        <div>
          {rooms.map((room, idx) => (
            <RoomNode
              key={room.id}
              name={room.name}
              level={level + 2}
              isLast={idx === rooms.length - 1}
            />
          ))}
        </div>
      )}

      {/* Hide connector below last floor when expanded */}
      {isLast && expanded && hasRooms && (
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
  
  // For Einzelgebäude: show floors directly
  // For Gebäudekomplex: children are buildings, those show floors
  const isEinzelgebaeude = location.type === "einzelgebaeude";
  const isGebaeudekomplex = location.type === "gebaeudekomplex";
  const isChildOfComplex = level > 0;
  
  // Show floors for Einzelgebäude or for buildings that are children of a complex
  const shouldShowFloors = isEinzelgebaeude || isChildOfComplex;
  const hasExpandableContent = hasChildren || (shouldShowFloors && hasFloors);

  // Get online status
  const status = locationStatuses?.get(location.id);
  const getOnlineStatusBadge = () => {
    if (!status || status.totalIntegrations === 0) {
      return null;
    }

    if (status.hasUnconfigured) {
      return (
        <Badge variant="outline" className="text-xs gap-1 bg-secondary/50 text-secondary-foreground border-border">
          <AlertCircle className="h-3 w-3" />
        </Badge>
      );
    }

    if (status.isOnline) {
      return (
        <Badge variant="outline" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
          <Wifi className="h-3 w-3" />
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-xs gap-1 bg-destructive/10 text-destructive border-destructive/20">
        <WifiOff className="h-3 w-3" />
      </Badge>
    );
  };

  const indent = level * 20 + 12;

  return (
    <div className="relative">
      {/* Tree connector lines for child nodes */}
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
          {/* Hide vertical line below last sibling */}
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
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <EditLocationDialog
              location={location}
              onSuccess={() => onRefresh?.()}
            />
            <DeleteLocationDialog
              location={location}
              onSuccess={() => onRefresh?.()}
            />
          </div>
        )}
      </div>
      
      {expanded && (
        <>
          {/* For Gebäudekomplex: show child buildings first */}
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
          
          {/* Show floors for Einzelgebäude or child buildings of complex */}
          {shouldShowFloors && hasFloors && (
            <div>
              {floors.map((floor, idx) => (
                <FloorNode
                  key={floor.id}
                  floor={floor}
                  level={level + 1}
                  isLast={idx === floors.length - 1}
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
