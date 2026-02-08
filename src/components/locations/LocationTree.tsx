import { useState } from "react";
import { Location, LocationType } from "@/hooks/useLocations";
import { useUserRole } from "@/hooks/useUserRole";
import { ChevronRight, ChevronDown, Building2, Building, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EditLocationDialog } from "./EditLocationDialog";
import { DeleteLocationDialog } from "./DeleteLocationDialog";

interface LocationTreeProps {
  locations: Location[];
  selectedId?: string;
  onSelect?: (location: Location) => void;
  onRefresh?: () => void;
}

interface LocationNodeProps {
  location: Location;
  level: number;
  selectedId?: string;
  onSelect?: (location: Location) => void;
  onRefresh?: () => void;
  isAdmin: boolean;
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

function LocationNode({ location, level, selectedId, onSelect, onRefresh, isAdmin }: LocationNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = location.children && location.children.length > 0;
  const isSelected = selectedId === location.id;
  const Icon = typeIcons[location.type];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        {hasChildren ? (
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
          <span className="flex-1 font-medium text-sm">{location.name}</span>
          {location.is_main_location && (
            <Badge variant="secondary" className="text-xs gap-1 bg-amber-100 text-amber-700 border-amber-200">
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
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
      {hasChildren && expanded && (
        <div>
          {location.children!.map((child) => (
            <LocationNode
              key={child.id}
              location={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onRefresh={onRefresh}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationTree({ locations, selectedId, onSelect, onRefresh }: LocationTreeProps) {
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
        />
      ))}
    </div>
  );
}
