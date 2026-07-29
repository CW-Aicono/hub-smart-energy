import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeviceTree, DeviceTreeNode } from "@/hooks/useDeviceTree";
import { Search, MapPin, Gauge, Thermometer, ToggleRight, Zap, GitBranch, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<DeviceTreeNode["type"], typeof MapPin> = {
  location: MapPin,
  meter: Gauge,
  sensor: Thermometer,
  actuator: ToggleRight,
  wallbox: Zap,
  virtual: GitBranch,
};

interface AnalyticsSidebarProps {
  onDragStart: (node: DeviceTreeNode) => void;
}

export function AnalyticsSidebar({ onDragStart }: AnalyticsSidebarProps) {
  const { nodes, loading } = useDeviceTree();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const locations = useMemo(() => nodes.filter((n) => n.type === "location"), [nodes]);
  const childrenByLocation = useMemo(() => {
    const map = new Map<string, DeviceTreeNode[]>();
    nodes.forEach((n) => {
      if (n.parentId) {
        const arr = map.get(n.parentId) ?? [];
        arr.push(n);
        map.set(n.parentId, arr);
      }
    });
    return map;
  }, [nodes]);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const visibleLocations = useMemo(() => {
    if (!searching) return locations;
    return locations.filter((loc) => {
      if (loc.label.toLowerCase().includes(q)) return true;
      const kids = childrenByLocation.get(loc.id) ?? [];
      return kids.some((c) => c.label.toLowerCase().includes(q));
    });
  }, [locations, childrenByLocation, q, searching]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isExpanded = (id: string) => searching || expanded.has(id);

  return (
    <aside className="w-72 border-r bg-sidebar text-sidebar-foreground flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-sm font-semibold mb-3">Daten-Bibliothek</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Standort oder Gerät suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 p-3">
        {loading ? (
          <div className="text-xs text-muted-foreground p-2">Lade Standorte...</div>
        ) : visibleLocations.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">
            {searching ? "Keine Treffer" : "Keine Standorte vorhanden"}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleLocations.map((loc) => {
              const kids = childrenByLocation.get(loc.id) ?? [];
              const filteredKids = searching
                ? kids.filter((c) => c.label.toLowerCase().includes(q) || loc.label.toLowerCase().includes(q))
                : kids;
              const open = isExpanded(loc.id);
              return (
                <div key={loc.id}>
                  <button
                    type="button"
                    onClick={() => toggle(loc.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium",
                      "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    )}
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="flex-1 min-w-0 text-left truncate" title={loc.label}>{loc.label}</span>
                    <span className="shrink-0 text-[10px] text-sidebar-foreground/60 tabular-nums">{kids.length}</span>
                  </button>
                  {open && (
                    <div className="space-y-0.5 pl-6 py-1">
                      {filteredKids.length === 0 ? (
                        <div className="text-[10px] text-sidebar-foreground/50 px-2 py-1">Keine Geräte</div>
                      ) : (
                        filteredKids.map((child) => {
                          const Icon = TYPE_ICONS[child.type];
                          return (
                            <div
                              key={child.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", child.id);
                                e.dataTransfer.effectAllowed = "copy";
                                onDragStart(child);
                              }}
                              onClick={() => onDragStart(child)}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-grab select-none",
                                "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
                              <span className="flex-1 truncate">{child.label}</span>
                              {child.unit && (
                                <span className="text-[10px] text-sidebar-foreground/60">{child.unit}</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
      <div className="p-3 border-t text-[10px] text-muted-foreground">
        Standort öffnen und Gerät auf das Canvas ziehen.
      </div>
    </aside>
  );
}
