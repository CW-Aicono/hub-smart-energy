/**
 * BulkEditMetersDialog
 *
 * Erlaubt es, ausgewählte Zähler gleichzeitig zu bearbeiten.
 * Jeder Feld-Block hat ein "Anwenden"-Checkbox — nur aktivierte Felder
 * werden in einem Update an alle Ziel-Zähler geschrieben.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Meter } from "@/hooks/useMeters";
import { useFloors } from "@/hooks/useFloors";
import { useFloorRooms } from "@/hooks/useFloorRooms";
import { ENERGY_TYPE_LABELS } from "@/lib/energyTypeColors";
import { SOURCE_UNIT_GROUPS } from "@/lib/sensorUnits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meters: Meter[];
  locationId: string;
  onDone: () => void;
}

const METER_FUNCTIONS: Array<{ value: string; label: string }> = [
  { value: "consumption", label: "Verbrauch" },
  { value: "generation", label: "Erzeugung" },
  { value: "bidirectional", label: "Bidirektional" },
];

export function BulkEditMetersDialog({ open, onOpenChange, meters, locationId, onDone }: Props) {
  const { floors } = useFloors(locationId);
  const [floorId, setFloorId] = useState<string>("__none__");
  const { rooms } = useFloorRooms(floorId !== "__none__" && floorId !== "__clear__" ? floorId : undefined);

  // "apply" flags per field
  const [applyFloor, setApplyFloor] = useState(false);
  const [applyRoom, setApplyRoom] = useState(false);
  const [applyEnergy, setApplyEnergy] = useState(false);
  const [applyUnit, setApplyUnit] = useState(false);
  const [applyMedium, setApplyMedium] = useState(false);
  const [applyMain, setApplyMain] = useState(false);
  const [applyBidir, setApplyBidir] = useState(false);
  const [applyFunction, setApplyFunction] = useState(false);
  const [applyParent, setApplyParent] = useState(false);

  const [roomId, setRoomId] = useState<string>("__none__");
  const [energyType, setEnergyType] = useState<string>("strom");
  const [unit, setUnit] = useState<string>("kWh");
  const [medium, setMedium] = useState<string>("");
  const [isMain, setIsMain] = useState(false);
  const [isBidir, setIsBidir] = useState(false);
  const [meterFunction, setMeterFunction] = useState<string>("consumption");
  const [parentId, setParentId] = useState<string>("__none__");
  const [saving, setSaving] = useState(false);

  const parentOptions = useMemo(
    () => meters.filter((m) => !m.is_archived),
    [meters],
  );

  const anySelected =
    applyFloor || applyRoom || applyEnergy || applyUnit || applyMedium || applyMain || applyBidir || applyFunction || applyParent;

  const targetIds = useMemo(() => meters.map((m) => m.id), [meters]);

  const handleSave = async () => {
    if (!anySelected || targetIds.length === 0) return;
    const updates: Record<string, unknown> = {};
    if (applyFloor) updates.floor_id = floorId === "__clear__" ? null : floorId === "__none__" ? null : floorId;
    if (applyRoom) updates.room_id = roomId === "__clear__" ? null : roomId === "__none__" ? null : roomId;
    if (applyEnergy) updates.energy_type = energyType;
    if (applyUnit) updates.unit = unit;
    if (applyMedium) updates.medium = medium.trim() || null;
    if (applyMain) updates.is_main_meter = isMain;
    if (applyBidir) (updates as any).is_bidirectional = isBidir;
    if (applyFunction) updates.meter_function = meterFunction;
    if (applyParent) updates.parent_meter_id = parentId === "__clear__" || parentId === "__none__" ? null : parentId;

    setSaving(true);
    const { error } = await supabase.from("meters").update(updates as any).in("id", targetIds);
    setSaving(false);
    if (error) {
      toast.error(`Bulk-Update fehlgeschlagen: ${error.message}`);
      return;
    }
    toast.success(`${targetIds.length} Zähler aktualisiert`);
    onDone();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mehrere Zähler bearbeiten ({meters.length})</DialogTitle>
          <DialogDescription>
            Aktivieren Sie nur die Felder, die geändert werden sollen. Alle anderen Werte bleiben pro Zähler unverändert.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {/* Etage & Raum */}
            <div className="grid grid-cols-2 gap-4">
              <FieldBlock apply={applyFloor} setApply={setApplyFloor} label="Etage">
                <Select value={floorId} onValueChange={setFloorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">– bitte wählen –</SelectItem>
                    <SelectItem value="__clear__">Zuweisung entfernen</SelectItem>
                    {floors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock apply={applyRoom} setApply={setApplyRoom} label="Raum">
                <Select value={roomId} onValueChange={setRoomId} disabled={floorId === "__none__" || floorId === "__clear__"}>
                  <SelectTrigger><SelectValue placeholder="Etage zuerst wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">– bitte wählen –</SelectItem>
                    <SelectItem value="__clear__">Zuweisung entfernen</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
            </div>

            <Separator />

            {/* Energieart / Einheit / Medium */}
            <div className="grid grid-cols-3 gap-4">
              <FieldBlock apply={applyEnergy} setApply={setApplyEnergy} label="Energieart">
                <Select value={energyType} onValueChange={setEnergyType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ENERGY_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock apply={applyUnit} setApply={setApplyUnit} label="Einheit">
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_UNIT_GROUPS.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    <SelectGroup>
                      <SelectLabel>Energie (kumulativ)</SelectLabel>
                      <SelectItem value="kWh">kWh</SelectItem>
                      <SelectItem value="Wh">Wh</SelectItem>
                      <SelectItem value="MWh">MWh</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock apply={applyMedium} setApply={setApplyMedium} label="Medium">
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  placeholder="z. B. Strom"
                />
              </FieldBlock>
            </div>

            <Separator />

            {/* Flags */}
            <div className="grid grid-cols-2 gap-4">
              <FieldBlock apply={applyMain} setApply={setApplyMain} label="Hauptzähler">
                <div className="flex items-center gap-2">
                  <Switch checked={isMain} onCheckedChange={setIsMain} />
                  <span className="text-sm text-muted-foreground">{isMain ? "Ja" : "Nein"}</span>
                </div>
              </FieldBlock>

              <FieldBlock apply={applyBidir} setApply={setApplyBidir} label="Bidirektional">
                <div className="flex items-center gap-2">
                  <Switch checked={isBidir} onCheckedChange={setIsBidir} />
                  <span className="text-sm text-muted-foreground">{isBidir ? "Bezug & Einspeisung" : "Nur eine Richtung"}</span>
                </div>
              </FieldBlock>
            </div>

            <Separator />

            {/* Function & Parent */}
            <div className="grid grid-cols-2 gap-4">
              <FieldBlock apply={applyFunction} setApply={setApplyFunction} label="Zählerfunktion">
                <Select value={meterFunction} onValueChange={setMeterFunction}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METER_FUNCTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock apply={applyParent} setApply={setApplyParent} label="Übergeordneter Zähler">
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">– bitte wählen –</SelectItem>
                    <SelectItem value="__clear__">Zuweisung entfernen</SelectItem>
                    {parentOptions
                      .filter((p) => !targetIds.includes(p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={!anySelected || saving}>
            {saving ? "Speichere …" : `Auf ${meters.length} Zähler anwenden`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldBlock({
  apply,
  setApply,
  label,
  children,
}: {
  apply: boolean;
  setApply: (v: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border p-3 space-y-2 ${apply ? "bg-muted/40" : "bg-background"}`}>
      <div className="flex items-center gap-2">
        <Checkbox checked={apply} onCheckedChange={(v) => setApply(!!v)} id={`apply-${label}`} />
        <Label htmlFor={`apply-${label}`} className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
      </div>
      <div className={apply ? "" : "opacity-50 pointer-events-none"}>{children}</div>
    </div>
  );
}
