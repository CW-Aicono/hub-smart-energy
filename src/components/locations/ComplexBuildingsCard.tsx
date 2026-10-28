import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLocations, type Location } from "@/hooks/useLocations";
import { useFloors } from "@/hooks/useFloors";
import { useTranslation } from "@/hooks/useTranslation";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddLocationDialog } from "@/components/locations/AddLocationDialog";
import { AddFloorDialog } from "@/components/locations/AddFloorDialog";
import { FloorList } from "@/components/locations/FloorList";
import { Building2, ChevronDown, ChevronRight, Landmark, Layers, MoveRight, Shuffle, Unlink } from "lucide-react";

type Restructure =
  | { kind: "floorToBuilding"; floorId: string; label: string }
  | { kind: "moveFloor"; floorId: string; label: string; target: string }
  | { kind: "buildingToFloor"; locationId: string; label: string; target: string };

function BuildingRow({ building, siblings, floorsEnabled, onChanged }: {
  building: Location; siblings: Location[]; floorsEnabled: boolean; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const T = (k: string) => t(k as any);
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const { floors, loading, refetch } = useFloors(building.id);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Restructure | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveFloor, setMoveFloor] = useState<string>("");
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [b2fTarget, setB2fTarget] = useState<string>("");

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    const res =
      pending.kind === "floorToBuilding"
        ? await supabase.rpc("convert_floor_to_building" as any, { p_floor_id: pending.floorId })
        : pending.kind === "moveFloor"
          ? await supabase.rpc("move_floor_to_building" as any, { p_floor_id: pending.floorId, p_target_location_id: pending.target })
          : await supabase.rpc("convert_building_to_floor" as any, { p_location_id: pending.locationId, p_target_location_id: pending.target });
    setBusy(false);
    setPending(null);
    if (res.error) {
      toast({ title: T("common.error"), description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: T("complex.restructureDone") });
    setMoveFloor(""); setMoveTarget(""); setB2fTarget("");
    await refetch();
    onChanged();
  };

  const targetName = (id: string) => siblings.find((s) => s.id === id)?.name ?? "";

  return (
    <li className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left" disabled={!floorsEnabled}>
              {floorsEnabled && (open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <Link to={`/locations/${building.id}`} className="font-medium hover:underline">{building.name}</Link>
          {floorsEnabled && !loading && (
            <span className="text-xs text-muted-foreground">({floors.length.toLocaleString("de-DE")} {T("complex.floorsCount")})</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {isAdmin && floorsEnabled && <AddFloorDialog locationId={building.id} onSuccess={refetch} />}
          </div>
        </div>
        {floorsEnabled && (
          <CollapsibleContent className="mt-3 space-y-3 pl-6">
            <FloorList floors={floors} loading={loading} locationId={building.id} onRefresh={refetch} />
            {isAdmin && (
              <div className="rounded-md border border-dashed p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><Shuffle className="h-4 w-4" />{T("complex.restructureTitle")}</p>
                <p className="text-xs text-muted-foreground">{T("complex.restructureHint")}</p>
                {floors.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={moveFloor} onValueChange={setMoveFloor}>
                      <SelectTrigger className="w-48"><SelectValue placeholder={T("complex.pickFloor")} /></SelectTrigger>
                      <SelectContent>{floors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={!moveFloor}
                      onClick={() => setPending({ kind: "floorToBuilding", floorId: moveFloor, label: floors.find((f) => f.id === moveFloor)?.name ?? "" })}>
                      <Building2 className="h-4 w-4 mr-1" />{T("complex.floorToBuilding")}
                    </Button>
                    {siblings.length > 0 && (
                      <>
                        <Select value={moveTarget} onValueChange={setMoveTarget}>
                          <SelectTrigger className="w-48"><SelectValue placeholder={T("complex.pickTarget")} /></SelectTrigger>
                          <SelectContent>{siblings.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" disabled={!moveFloor || !moveTarget}
                          onClick={() => setPending({ kind: "moveFloor", floorId: moveFloor, target: moveTarget, label: floors.find((f) => f.id === moveFloor)?.name ?? "" })}>
                          <MoveRight className="h-4 w-4 mr-1" />{T("complex.moveFloor")}
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {siblings.length > 0 && floors.length <= 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={b2fTarget} onValueChange={setB2fTarget}>
                      <SelectTrigger className="w-48"><SelectValue placeholder={T("complex.pickTarget")} /></SelectTrigger>
                      <SelectContent>{siblings.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={!b2fTarget}
                      onClick={() => setPending({ kind: "buildingToFloor", locationId: building.id, target: b2fTarget, label: building.name })}>
                      <Layers className="h-4 w-4 mr-1" />{T("complex.buildingToFloor")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CollapsibleContent>
        )}
      </Collapsible>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T("complex.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "floorToBuilding" && `„${pending.label}" → ${T("complex.confirmFloorToBuilding")}`}
              {pending?.kind === "moveFloor" && `„${pending.label}" → „${targetName(pending.target)}". ${T("complex.confirmMoves")}`}
              {pending?.kind === "buildingToFloor" && `„${pending.label}" → ${T("complex.confirmBuildingToFloor")} „${targetName(pending.target)}". ${T("complex.confirmMoves")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{T("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); run(); }}>{T("complex.confirmAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Gebäude eines Gebäudekomplexes inkl. verschachtelter Etagen & Grundrisse und flexiblem Umbau. */
export function ComplexBuildingsCard({ complex, floorsEnabled = true, onChanged }: { complex: Location; floorsEnabled?: boolean; onChanged?: () => void }) {
  const { locations, updateLocation, refetch } = useLocations();
  const { t } = useTranslation();
  const T = (k: string) => t(k as any);
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const [pick, setPick] = useState<string>("");

  const children = locations.filter((l) => l.parent_id === complex.id);
  const assignable = locations.filter((l) => l.id !== complex.id && !l.parent_id && l.type !== "gebaeudekomplex");

  const changed = () => { refetch?.(); onChanged?.(); };

  const setParent = async (id: string, parent: string | null) => {
    const { error } = await updateLocation(id, { parent_id: parent } as any);
    if (error) toast({ title: T("common.error"), description: error.message, variant: "destructive" });
    else { setPick(""); refetch?.(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />{T("complex.buildingsTitle")}</CardTitle>
          <CardDescription>{T("complex.buildingsDescNested")}</CardDescription>
        </div>
        {isAdmin && <AddLocationDialog parentId={complex.id} triggerLabel={T("complex.addBuilding")} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T("complex.noBuildings")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {children.map((c) => (
              <div key={c.id} className="relative">
                <BuildingRow building={c} siblings={children.filter((s) => s.id !== c.id)} floorsEnabled={floorsEnabled} onChanged={changed} />
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="absolute right-3 top-3 hidden" onClick={() => setParent(c.id, null)}>
                    <Unlink className="h-4 w-4 mr-1" />{T("complex.detach")}
                  </Button>
                )}
              </div>
            ))}
          </ul>
        )}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {assignable.length > 0 && (
              <>
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger className="w-72"><SelectValue placeholder={T("complex.assignExisting")} /></SelectTrigger>
                  <SelectContent>{assignable.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={!pick} onClick={() => setParent(pick, complex.id)}>{T("complex.assign")}</Button>
              </>
            )}
            {children.length > 0 && (
              <DetachPicker buildings={children} onDetach={(id) => setParent(id, null)} label={T("complex.detach")} placeholder={T("complex.pickDetach")} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetachPicker({ buildings, onDetach, label, placeholder }: { buildings: Location[]; onDetach: (id: string) => void; label: string; placeholder: string }) {
  const [id, setId] = useState("");
  return (
    <>
      <Select value={id} onValueChange={setId}>
        <SelectTrigger className="w-56"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="ghost" disabled={!id} onClick={() => { onDetach(id); setId(""); }}>
        <Unlink className="h-4 w-4 mr-1" />{label}
      </Button>
    </>
  );
}
