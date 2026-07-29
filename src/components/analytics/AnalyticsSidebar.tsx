import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeviceTree, DeviceTreeNode } from "@/hooks/useDeviceTree";
import { Search, MapPin, Gauge, Thermometer, ToggleRight, Zap, Activity, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<DeviceTreeNode["type"], typeof MapPin> = {
  location: MapPin,
  meter: Gauge,
  sensor: Thermometer,
  actuator: ToggleRight,
  wallbox: Zap,
  virtual: GitBranch,
};

const TYPE_LABELS: Record<DeviceTreeNode["type"], string> = {
  location: "Standort",
  meter: "Zähler",
  sensor: "Sensor",
  actuator: "Aktor",
  wallbox: "Wallbox",
  virtual: "Virtuell",
};

interface AnalyticsSidebarProps {
  onDragStart: (node: DeviceTreeNode) => void;
}

export function AnalyticsSidebar({ onDragStart }: AnalyticsSidebarProps) {
  const { nodes, loading } = useDeviceTree();
  const [search, setSearch] = useState("");

  const filtered = nodes.filter((n) => {
    if (!search) return true;
    return n.label.toLowerCase().includes(search.toLowerCase());
  });

  const locations = filtered.filter((n) => n.type === "location");

  return (
    <aside className="w-72 border-r bg-sidebar flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-sm font-semibold mb-3">Daten-Bibliothek</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Gerät suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 p-3">
        {loading ? (
          <div className="text-xs text-muted-foreground p-2">Lade Geräte...</div>
        ) : (
          <div className="space-y-3">
            {locations.map((loc) => {
              const children = filtered.filter((n) => n.parentId === loc.id);
              if (search && children.length === 0 && !loc.label.toLowerCase().includes(search.toLowerCase())) return null;
              return (
                <div key={loc.id}>
                  <div className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/80 px-2 py-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {loc.label}
                  </div>
                  <div className="space-y-0.5 pl-2">
                    {children.map((child) => {
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
                            "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{child.label}</span>
                          {child.unit && <span className="text-[10px] text-muted-foreground">{child.unit}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
      <div className="p-3 border-t text-[10px] text-muted-foreground">
        Ziehe ein Gerät auf das Canvas, um eine Analyse zu starten.
      </div>
    </aside>
  );
}
