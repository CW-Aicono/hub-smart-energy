import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Check, Building2, Layers, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type LocationScope =
  | { kind: "all" }
  | { kind: "location"; locationId: string }
  | { kind: "floor"; locationId: string; floorId: string }
  | { kind: "room"; locationId: string; floorId: string; roomId: string };

interface LocationRef { id: string; name: string }

interface Props {
  locations: LocationRef[];
  value: LocationScope;
  onChange: (v: LocationScope) => void;
  allLabel: string;
  className?: string;
}

interface FloorRow { id: string; location_id: string; name: string; floor_number: number }
interface RoomRow { id: string; floor_id: string; name: string }

export function LocationTreeFilter({ locations, value, onChange, allLabel, className }: Props) {
  const [open, setOpen] = useState(false);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [expandedLoc, setExpandedLoc] = useState<Set<string>>(new Set());
  const [expandedFloor, setExpandedFloor] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const locIds = locations.map((l) => l.id);
      if (locIds.length === 0) { setFloors([]); setRooms([]); return; }
      const { data: fData } = await supabase
        .from("floors")
        .select("id,location_id,name,floor_number")
        .in("location_id", locIds)
        .order("floor_number", { ascending: true });
      if (cancelled) return;
      const fList = (fData ?? []) as FloorRow[];
      setFloors(fList);
      const floorIds = fList.map((f) => f.id);
      if (floorIds.length === 0) { setRooms([]); return; }
      const { data: rData } = await supabase
        .from("floor_rooms")
        .select("id,floor_id,name")
        .in("floor_id", floorIds)
        .order("name");
      if (cancelled) return;
      setRooms((rData ?? []) as RoomRow[]);
    })();
    return () => { cancelled = true; };
  }, [locations]);

  // Auto-expand the branch of the selected node
  useEffect(() => {
    if (value.kind === "location" || value.kind === "floor" || value.kind === "room") {
      setExpandedLoc((s) => new Set(s).add(value.locationId));
    }
    if (value.kind === "floor" || value.kind === "room") {
      setExpandedFloor((s) => new Set(s).add(value.floorId));
    }
  }, [value]);

  const floorsByLoc = useMemo(() => {
    const m = new Map<string, FloorRow[]>();
    for (const f of floors) {
      if (!m.has(f.location_id)) m.set(f.location_id, []);
      m.get(f.location_id)!.push(f);
    }
    return m;
  }, [floors]);

  const roomsByFloor = useMemo(() => {
    const m = new Map<string, RoomRow[]>();
    for (const r of rooms) {
      if (!m.has(r.floor_id)) m.set(r.floor_id, []);
      m.get(r.floor_id)!.push(r);
    }
    return m;
  }, [rooms]);

  const label = useMemo(() => {
    if (value.kind === "all") return allLabel;
    const loc = locations.find((l) => l.id === value.locationId)?.name ?? "—";
    if (value.kind === "location") return loc;
    const fl = floors.find((f) => f.id === value.floorId)?.name ?? "";
    if (value.kind === "floor") return `${loc} › ${fl}`;
    const rm = rooms.find((r) => r.id === value.roomId)?.name ?? "";
    return `${loc} › ${fl} › ${rm}`;
  }, [value, locations, floors, rooms, allLabel]);

  const toggleLoc = (id: string) => {
    setExpandedLoc((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleFloor = (id: string) => {
    setExpandedFloor((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const isSelected = (scope: LocationScope): boolean => {
    if (scope.kind !== value.kind) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "location") return (value as any).locationId === scope.locationId;
    if (scope.kind === "floor") return (value as any).floorId === scope.floorId;
    if (scope.kind === "room") return (value as any).roomId === scope.roomId;
    return false;
  };

  const pick = (scope: LocationScope) => {
    onChange(scope);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-[240px] justify-between font-normal", className)}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <ScrollArea className="max-h-[360px]">
          <div className="p-1 text-sm">
            <button
              type="button"
              onClick={() => pick({ kind: "all" })}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent text-left",
                isSelected({ kind: "all" }) && "bg-accent",
              )}
            >
              <span className="w-4" />
              <Check className={cn("h-3.5 w-3.5", isSelected({ kind: "all" }) ? "opacity-100" : "opacity-0")} />
              <span>{allLabel}</span>
            </button>

            {locations.map((loc) => {
              const locFloors = floorsByLoc.get(loc.id) ?? [];
              const locOpen = expandedLoc.has(loc.id);
              const locSel = isSelected({ kind: "location", locationId: loc.id });
              return (
                <div key={loc.id}>
                  <div className={cn("flex items-center gap-1 rounded hover:bg-accent/50", locSel && "bg-accent")}>
                    <button
                      type="button"
                      onClick={() => toggleLoc(loc.id)}
                      className="p-1 hover:bg-accent rounded"
                      aria-label={locOpen ? "Zuklappen" : "Aufklappen"}
                      disabled={locFloors.length === 0}
                    >
                      {locFloors.length === 0 ? (
                        <span className="inline-block w-3.5" />
                      ) : locOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => pick({ kind: "location", locationId: loc.id })}
                      className="flex flex-1 items-center gap-2 px-1 py-1.5 text-left"
                    >
                      <Check className={cn("h-3.5 w-3.5", locSel ? "opacity-100" : "opacity-0")} />
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{loc.name}</span>
                    </button>
                  </div>

                  {locOpen && locFloors.map((fl) => {
                    const flRooms = roomsByFloor.get(fl.id) ?? [];
                    const flOpen = expandedFloor.has(fl.id);
                    const flSel = isSelected({ kind: "floor", locationId: loc.id, floorId: fl.id });
                    return (
                      <div key={fl.id} className="ml-5">
                        <div className={cn("flex items-center gap-1 rounded hover:bg-accent/50", flSel && "bg-accent")}>
                          <button
                            type="button"
                            onClick={() => toggleFloor(fl.id)}
                            className="p-1 hover:bg-accent rounded"
                            disabled={flRooms.length === 0}
                          >
                            {flRooms.length === 0 ? (
                              <span className="inline-block w-3.5" />
                            ) : flOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => pick({ kind: "floor", locationId: loc.id, floorId: fl.id })}
                            className="flex flex-1 items-center gap-2 px-1 py-1.5 text-left"
                          >
                            <Check className={cn("h-3.5 w-3.5", flSel ? "opacity-100" : "opacity-0")} />
                            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{fl.name}</span>
                          </button>
                        </div>

                        {flOpen && flRooms.map((rm) => {
                          const rmSel = isSelected({ kind: "room", locationId: loc.id, floorId: fl.id, roomId: rm.id });
                          return (
                            <div key={rm.id} className="ml-5">
                              <button
                                type="button"
                                onClick={() => pick({ kind: "room", locationId: loc.id, floorId: fl.id, roomId: rm.id })}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent text-left",
                                  rmSel && "bg-accent",
                                )}
                              >
                                <span className="w-3.5" />
                                <Check className={cn("h-3.5 w-3.5", rmSel ? "opacity-100" : "opacity-0")} />
                                <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate">{rm.name}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
