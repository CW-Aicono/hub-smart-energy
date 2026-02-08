import { useState } from "react";
import { Location, LocationType } from "@/hooks/useLocations";
import { ChevronRight, ChevronDown, Building2, Building, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface LocationTreeProps {
  locations: Location[];
  selectedId?: string;
  onSelect?: (location: Location) => void;
}

interface LocationNodeProps {
  location: Location;
  level: number;
  selectedId?: string;
  onSelect?: (location: Location) => void;
}

const typeIcons: Record<LocationType, typeof MapPin> = {
  standort: MapPin,
  gebaeude: Building2,
  bereich: Building,
};

const typeLabels: Record<LocationType, string> = {
  standort: "Standort",
  gebaeude: "Gebäude",
  bereich: "Bereich",
};

const typeColors: Record<LocationType, string> = {
  standort: "bg-primary/10 text-primary border-primary/20",
  gebaeude: "bg-accent/10 text-accent-foreground border-accent/20",
  bereich: "bg-muted text-muted-foreground border-muted-foreground/20",
};

function LocationNode({ location, level, selectedId, onSelect }: LocationNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = location.children && location.children.length > 0;
  const isSelected = selectedId === location.id;
  const Icon = typeIcons[location.type];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => onSelect?.(location)}
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
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 font-medium text-sm">{location.name}</span>
        <Badge variant="outline" className={cn("text-xs", typeColors[location.type])}>
          {typeLabels[location.type]}
        </Badge>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationTree({ locations, selectedId, onSelect }: LocationTreeProps) {
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
        />
      ))}
    </div>
  );
}
