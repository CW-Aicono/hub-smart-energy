import { useState, useCallback, useMemo } from "react";
import { Meter } from "@/hooks/useMeters";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChevronRight,
  ChevronDown,
  Zap,
  Flame,
  Droplets,
  Thermometer,
  Network,
  CircleDot,
  Wrench,
  SunMedium,
  GripVertical,
  AlertTriangle,
  Search,
  X,
} from "lucide-react";

interface MeterTreeViewProps {
  meters: Meter[];
  onUpdateParent: (meterId: string, parentMeterId: string | null) => Promise<void>;
  onSelectMeter?: (meter: Meter) => void;
}

interface TreeNode {
  meter: Meter;
  children: TreeNode[];
}

const ENERGY_TYPE_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

const FUNCTION_LABELS: Record<string, string> = {
  consumption: "Verbrauch",
  generation: "Erzeugung",
  technical: "Technisch",
  submeter: "Unterzähler",
};

const ENERGY_ICONS: Record<string, React.ElementType> = {
  strom: Zap,
  gas: Flame,
  wasser: Droplets,
  waerme: Thermometer,
};

const FUNCTION_ICONS: Record<string, React.ElementType> = {
  consumption: CircleDot,
  generation: SunMedium,
  technical: Wrench,
  submeter: CircleDot,
};

function buildTree(meters: Meter[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  meters.forEach((m) => map.set(m.id, { meter: m, children: [] }));

  meters.forEach((m) => {
    const node = map.get(m.id)!;
    if (m.parent_meter_id && map.has(m.parent_meter_id)) {
      map.get(m.parent_meter_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort children by name
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.meter.name.localeCompare(b.meter.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

function hasTypeMismatch(meter: Meter, parentMeter: Meter | undefined): boolean {
  if (!parentMeter) return false;
  return meter.energy_type !== parentMeter.energy_type;
}

// ---- Drag & Drop ----

interface DragState {
  draggedId: string | null;
  dropTargetId: string | null;
  dropPosition: "child" | "root" | null;
}

function MeterTreeNode({
  node,
  depth,
  allMeters,
  dragState,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  expandedIds,
  toggleExpanded,
  onSelectMeter,
  isAdmin,
  highlightedIds,
}: {
  node: TreeNode;
  depth: number;
  allMeters: Map<string, Meter>;
  dragState: DragState;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string, position: "child") => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onSelectMeter?: (meter: Meter) => void;
  isAdmin: boolean;
  highlightedIds: Set<string>;
}) {
  const { meter } = node;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(meter.id);
  const EnergyIcon = ENERGY_ICONS[meter.energy_type] || Zap;
  const FuncIcon = FUNCTION_ICONS[meter.meter_function] || CircleDot;
  const parentMeter = meter.parent_meter_id ? allMeters.get(meter.parent_meter_id) : undefined;
  const typeMismatch = hasTypeMismatch(meter, parentMeter);
  const isDragged = dragState.draggedId === meter.id;
  const isDropTarget = dragState.dropTargetId === meter.id && dragState.draggedId !== meter.id;
  const isHighlighted = highlightedIds.has(meter.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded-md transition-colors group
          ${isDragged ? "opacity-40" : ""}
          ${isDropTarget ? "bg-primary/10 ring-2 ring-primary/30" : isHighlighted ? "bg-accent/50 ring-1 ring-accent" : "hover:bg-muted/50"}
          ${meter.is_archived ? "opacity-50" : ""}
        `}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        draggable={isAdmin && !meter.is_archived}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(meter.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(meter.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(meter.id, "child");
        }}
        onDragEnd={onDragEnd}
      >
        {isAdmin && (
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab opacity-0 group-hover:opacity-100 shrink-0" />
        )}

        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={() => toggleExpanded(meter.id)}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {meter.is_main_meter ? (
          <Network className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <FuncIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <button
          className="flex-1 text-left text-sm font-medium truncate hover:underline"
          onClick={() => onSelectMeter?.(meter)}
        >
          {meter.name}
        </button>

        <EnergyIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
          {ENERGY_TYPE_LABELS[meter.energy_type] || meter.energy_type}
        </Badge>

        {meter.is_main_meter && (
          <Badge className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20 shrink-0">
            Hauptzähler
          </Badge>
        )}

        {meter.meter_function !== "consumption" && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
            {FUNCTION_LABELS[meter.meter_function] || meter.meter_function}
          </Badge>
        )}

        {typeMismatch && (
          <span className="shrink-0" aria-label="Energieart weicht vom übergeordneten Zähler ab">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          </span>
        )}

        {hasChildren && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            Σ {node.children.length}
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <MeterTreeNode
              key={child.meter.id}
              node={child}
              depth={depth + 1}
              allMeters={allMeters}
              dragState={dragState}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onSelectMeter={onSelectMeter}
              isAdmin={isAdmin}
              highlightedIds={highlightedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const MeterTreeView = ({ meters, onUpdateParent, onSelectMeter }: MeterTreeViewProps) => {
  const { isAdmin } = useUserRole();
  const activeMeters = meters.filter((m) => !m.is_archived);
  const tree = buildTree(activeMeters);
  const allMetersMap = new Map(activeMeters.map((m) => [m.id, m]));

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Auto-expand meters that have children
    const ids = new Set<string>();
    activeMeters.forEach((m) => {
      if (activeMeters.some((c) => c.parent_meter_id === m.id)) {
        ids.add(m.id);
      }
    });
    return ids;
  });

  const [dragState, setDragState] = useState<DragState>({
    draggedId: null,
    dropTargetId: null,
    dropPosition: null,
  });

  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Search: find matching meter IDs and their ancestor IDs (to auto-expand)
  const { highlightedIds, searchExpandIds } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { highlightedIds: new Set<string>(), searchExpandIds: new Set<string>() };

    const matched = new Set<string>();
    const ancestors = new Set<string>();

    activeMeters.forEach((m) => {
      const searchable = [m.name, m.meter_number, m.energy_type, m.meter_function].filter(Boolean).join(" ").toLowerCase();
      if (searchable.includes(q)) {
        matched.add(m.id);
        // Walk up to root and add all ancestors
        let current: string | null | undefined = m.parent_meter_id;
        while (current) {
          ancestors.add(current);
          const parent = allMetersMap.get(current);
          current = parent?.parent_meter_id;
        }
      }
    });

    return { highlightedIds: matched, searchExpandIds: ancestors };
  }, [searchQuery, activeMeters, allMetersMap]);

  // Merge manual expanded + search-forced expanded
  const effectiveExpandedIds = useMemo(() => {
    if (searchQuery.trim()) {
      return new Set([...expandedIds, ...searchExpandIds]);
    }
    return expandedIds;
  }, [expandedIds, searchExpandIds, searchQuery]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((id: string) => {
    setDragState({ draggedId: id, dropTargetId: null, dropPosition: null });
  }, []);

  const handleDragOver = useCallback((id: string) => {
    setDragState((prev) => ({ ...prev, dropTargetId: id, dropPosition: "child" }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedId: null, dropTargetId: null, dropPosition: null });
  }, []);

  // Check if moving draggedId under targetId would create a cycle
  const wouldCreateCycle = useCallback(
    (draggedId: string, targetId: string): boolean => {
      if (draggedId === targetId) return true;
      let current: string | null = targetId;
      while (current) {
        if (current === draggedId) return true;
        const meter = allMetersMap.get(current);
        current = meter?.parent_meter_id ?? null;
      }
      return false;
    },
    [allMetersMap]
  );

  const handleDrop = useCallback(
    async (targetId: string, _position: "child") => {
      const { draggedId } = dragState;
      if (!draggedId || draggedId === targetId) return;

      // Hauptzähler dürfen nicht als Unterzähler platziert werden
      const draggedMeter = allMetersMap.get(draggedId);
      if (draggedMeter?.is_main_meter) {
        handleDragEnd();
        return;
      }

      if (wouldCreateCycle(draggedId, targetId)) {
        handleDragEnd();
        return;
      }

      handleDragEnd();
      await onUpdateParent(draggedId, targetId);
    },
    [dragState, wouldCreateCycle, onUpdateParent, handleDragEnd, allMetersMap]
  );

  const handleDropRoot = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const { draggedId } = dragState;
      if (!draggedId) return;
      handleDragEnd();
      // Set parent to null (make it a root meter)
      await onUpdateParent(draggedId, null);
    },
    [dragState, onUpdateParent, handleDragEnd]
  );

  // Filter tree
  const filteredTree = filterType === "all" ? tree : tree; // filtering applied to flat list below

  const filteredMeters = filterType === "all"
    ? activeMeters
    : activeMeters.filter((m) => m.energy_type === filterType);

  const filteredTreeNodes = filterType === "all" ? tree : buildTree(filteredMeters);

  // Type mismatch warnings
  const mismatchCount = activeMeters.filter((m) => {
    const parent = m.parent_meter_id ? allMetersMap.get(m.parent_meter_id) : undefined;
    return hasTypeMismatch(m, parent);
  }).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zähler suchen…"
            className="h-8 text-xs pl-8 pr-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Alle Typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Energiearten</SelectItem>
            <SelectItem value="strom">Strom</SelectItem>
            <SelectItem value="gas">Gas</SelectItem>
            <SelectItem value="waerme">Wärme</SelectItem>
            <SelectItem value="wasser">Wasser</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredMeters.length} Zähler
          {searchQuery.trim() && ` · ${highlightedIds.size} Treffer`}
        </span>
      </div>

      {mismatchCount > 0 && (
        <Alert className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {mismatchCount} Zähler haben eine andere Energieart als ihr übergeordneter Zähler.
          </AlertDescription>
        </Alert>
      )}

      <div
        className="min-h-[100px] rounded-md border bg-card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropRoot}
      >
        {filteredTreeNodes.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">
            {activeMeters.length === 0
              ? "Keine Zähler angelegt."
              : "Keine Zähler für diesen Filter."}
          </p>
        ) : (
          <div className="py-1">
            {filteredTreeNodes.map((node) => (
              <MeterTreeNode
                key={node.meter.id}
                node={node}
                depth={0}
                allMeters={allMetersMap}
                dragState={dragState}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                expandedIds={effectiveExpandedIds}
                toggleExpanded={toggleExpanded}
                onSelectMeter={onSelectMeter}
                isAdmin={isAdmin}
                highlightedIds={highlightedIds}
              />
            ))}
          </div>
        )}

        {isAdmin && dragState.draggedId && (
          <div className="border-t border-dashed p-2 text-center text-xs text-muted-foreground">
            Hier ablegen → Hauptzähler (ohne übergeordneten Zähler)
          </div>
        )}
      </div>
    </div>
  );
};
