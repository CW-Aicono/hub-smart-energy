import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useSalesStructure,
  type SalesLocation,
  type SalesFloor,
} from "@/hooks/useSalesStructure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Plus,
  Trash2,
  Layers,
  DoorOpen,
  Zap,
  Star,
} from "lucide-react";
import { ENERGY_TYPES } from "@/hooks/useLocationEnergySources";
import { FEDERAL_STATES } from "@/lib/federalStates";

const USAGE_TYPES = [
  { value: "verwaltungsgebaeude", label: "Verwaltungsgebäude" },
  { value: "universitaet", label: "Universität" },
  { value: "schule", label: "Schule" },
  { value: "kindertageseinrichtung", label: "Kindertageseinrichtung" },
  { value: "sportstaette", label: "Sportstätte" },
  { value: "jugendzentrum", label: "Jugendzentrum" },
  { value: "gewerbe", label: "Gewerbe" },
  { value: "privat", label: "Privat" },
  { value: "sonstiges", label: "Sonstiges" },
];

const HOT_WATER_TYPES = [
  { value: "strom", label: "Strom" },
  { value: "gas", label: "Gas" },
  { value: "waerme", label: "Fernwärme" },
  { value: "oel", label: "Öl" },
  { value: "solar", label: "Solarthermie" },
];

interface Props {
  projectId: string;
}

export function SalesStructureEditor({ projectId }: Props) {
  const { data, isLoading, invalidate } = useSalesStructure(projectId);
  const [busy, setBusy] = useState(false);

  const addLocation = async () => {
    setBusy(true);
    const { error } = await supabase.from("sales_locations").insert({
      project_id: projectId,
      name: "Neue Liegenschaft",
      is_main: (data?.locations.length ?? 0) === 0,
      sort_order: data?.locations.length ?? 0,
    });
    setBusy(false);
    if (error) toast.error("Konnte Liegenschaft nicht anlegen", { description: error.message });
    else invalidate();
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Lade Struktur…</div>;
  }

  const locations = data?.locations ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Alle Angaben sind optional. Werden sie ausgefüllt, wird die Struktur beim Übernehmen in
          einen Mandanten automatisch angelegt.
        </p>
        <Button size="sm" variant="outline" onClick={addLocation} disabled={busy}>
          <Plus className="h-4 w-4 mr-1" /> Liegenschaft
        </Button>
      </div>

      {locations.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Noch keine Liegenschaft erfasst. Ohne Erfassung wird beim Übernehmen automatisch eine
            Haupt-Liegenschaft aus den Kundendaten angelegt.
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" className="space-y-2">
        {locations.map((loc) => (
          <LocationCard
            key={loc.id}
            location={loc}
            onChange={invalidate}
            floors={(data?.floors ?? []).filter((f) => f.sales_location_id === loc.id)}
            rooms={data?.rooms ?? []}
            energySourceCodes={(data?.energySources ?? [])
              .filter((e) => e.sales_location_id === loc.id)
              .map((e) => e.energy_type)}
          />
        ))}
      </Accordion>
    </div>
  );
}

function LocationCard({
  location,
  floors,
  rooms,
  energySourceCodes,
  onChange,
}: {
  location: SalesLocation;
  floors: SalesFloor[];
  rooms: import("@/hooks/useSalesStructure").SalesRoom[];
  energySourceCodes: string[];
  onChange: () => void;
}) {
  const [form, setForm] = useState({
    name: location.name,
    adresse: location.adresse ?? "",
    usage_type: location.usage_type ?? "",
    net_floor_area: location.net_floor_area?.toString() ?? "",
    construction_year: location.construction_year?.toString() ?? "",
    renovation_year: location.renovation_year?.toString() ?? "",
    heating_type: location.heating_type ?? "",
    federal_state: location.federal_state ?? "",
    grid_limit_kw: location.grid_limit_kw?.toString() ?? "",
    hot_water_energy_type: location.hot_water_energy_type ?? "",
    notizen: location.notizen ?? "",
    is_main: location.is_main,
  });

  const save = async () => {
    const { error } = await supabase
      .from("sales_locations")
      .update({
        name: form.name.trim() || "Liegenschaft",
        adresse: form.adresse.trim() || null,
        usage_type: form.usage_type || null,
        net_floor_area: form.net_floor_area ? Number(form.net_floor_area) : null,
        construction_year: form.construction_year ? Number(form.construction_year) : null,
        renovation_year: form.renovation_year ? Number(form.renovation_year) : null,
        heating_type: form.heating_type.trim() || null,
        federal_state: form.federal_state || null,
        grid_limit_kw: form.grid_limit_kw ? Number(form.grid_limit_kw) : null,
        hot_water_energy_type: form.hot_water_energy_type || null,
        notizen: form.notizen.trim() || null,
        is_main: form.is_main,
      })
      .eq("id", location.id);
    if (error) toast.error("Speichern fehlgeschlagen", { description: error.message });
    else {
      toast.success("Gespeichert");
      onChange();
    }
  };

  const remove = async () => {
    if (!confirm(`Liegenschaft "${location.name}" wirklich löschen? Etagen und Räume werden mitgelöscht.`)) return;
    const { error } = await supabase.from("sales_locations").delete().eq("id", location.id);
    if (error) toast.error("Löschen fehlgeschlagen", { description: error.message });
    else onChange();
  };

  const toggleEnergyType = async (code: string) => {
    if (energySourceCodes.includes(code)) {
      const { error } = await supabase
        .from("sales_location_energy_sources")
        .delete()
        .eq("sales_location_id", location.id)
        .eq("energy_type", code);
      if (error) toast.error("Fehler", { description: error.message });
      else onChange();
    } else {
      const label = ENERGY_TYPES.find((t) => t.value === code)?.value ?? code;
      const { error } = await supabase.from("sales_location_energy_sources").insert({
        sales_location_id: location.id,
        energy_type: code,
        custom_name: label,
        sort_order: energySourceCodes.length,
      });
      if (error) toast.error("Fehler", { description: error.message });
      else onChange();
    }
  };

  const addFloor = async () => {
    const { error } = await supabase.from("sales_floors").insert({
      sales_location_id: location.id,
      name: `Etage ${floors.length}`,
      floor_number: floors.length,
      sort_order: floors.length,
    });
    if (error) toast.error("Fehler", { description: error.message });
    else onChange();
  };

  return (
    <AccordionItem value={location.id} className="border rounded-lg bg-card">
      <AccordionTrigger className="px-3 hover:no-underline">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium truncate">{location.name}</span>
          {location.is_main && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Star className="h-3 w-3" /> Haupt
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto mr-2">
            {floors.length} Etage{floors.length === 1 ? "" : "n"} · {energySourceCodes.length} Energiearten
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3 space-y-4">
        {/* Basisdaten */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Adresse</Label>
            <Textarea rows={2} value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="Straße, PLZ, Ort" />
          </div>
          <div>
            <Label>Nutzungsart</Label>
            <Select value={form.usage_type || "__none"} onValueChange={(v) => setForm({ ...form, usage_type: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {USAGE_TYPES.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bundesland</Label>
            <Select value={form.federal_state || "__none"} onValueChange={(v) => setForm({ ...form, federal_state: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {FEDERAL_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nettogrundfläche (m²)</Label>
            <Input type="number" value={form.net_floor_area} onChange={(e) => setForm({ ...form, net_floor_area: e.target.value })} />
          </div>
          <div>
            <Label>Netzanschluss (kW)</Label>
            <Input type="number" value={form.grid_limit_kw} onChange={(e) => setForm({ ...form, grid_limit_kw: e.target.value })} />
          </div>
          <div>
            <Label>Baujahr</Label>
            <Input type="number" value={form.construction_year} onChange={(e) => setForm({ ...form, construction_year: e.target.value })} />
          </div>
          <div>
            <Label>Sanierungsjahr</Label>
            <Input type="number" value={form.renovation_year} onChange={(e) => setForm({ ...form, renovation_year: e.target.value })} />
          </div>
          <div>
            <Label>Heizungsart</Label>
            <Input value={form.heating_type} onChange={(e) => setForm({ ...form, heating_type: e.target.value })} placeholder="z. B. Gas-Brennwert" />
          </div>
          <div>
            <Label>Warmwasser</Label>
            <Select value={form.hot_water_energy_type || "__none"} onValueChange={(v) => setForm({ ...form, hot_water_energy_type: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {HOT_WATER_TYPES.map((h) => (
                  <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notizen</Label>
            <Textarea rows={2} value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_main}
              onChange={(e) => setForm({ ...form, is_main: e.target.checked })}
            />
            Als Haupt-Liegenschaft markieren
          </label>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
            <Trash2 className="h-4 w-4 mr-1" /> Löschen
          </Button>
          <Button size="sm" onClick={save}>Speichern</Button>
        </div>

        {/* Energiearten */}
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Energiearten</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ENERGY_TYPES.map((t) => {
              const active = energySourceCodes.includes(t.value);
              return (
                <Badge
                  key={t.value}
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => toggleEnergyType(t.value)}
                >
                  {t.value}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Etagen & Räume */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Etagen & Räume</span>
            </div>
            <Button size="sm" variant="outline" onClick={addFloor}>
              <Plus className="h-4 w-4 mr-1" /> Etage
            </Button>
          </div>
          <div className="space-y-2">
            {floors.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Keine Etagen erfasst.</p>
            )}
            {floors.map((f) => (
              <FloorRow
                key={f.id}
                floor={f}
                rooms={rooms.filter((r) => r.sales_floor_id === f.id)}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function FloorRow({
  floor,
  rooms,
  onChange,
}: {
  floor: SalesFloor;
  rooms: import("@/hooks/useSalesStructure").SalesRoom[];
  onChange: () => void;
}) {
  const [name, setName] = useState(floor.name);
  const [num, setNum] = useState(floor.floor_number.toString());
  const [area, setArea] = useState(floor.area_sqm?.toString() ?? "");

  const save = async () => {
    const { error } = await supabase
      .from("sales_floors")
      .update({
        name: name.trim() || "Etage",
        floor_number: Number(num) || 0,
        area_sqm: area ? Number(area) : null,
      })
      .eq("id", floor.id);
    if (error) toast.error("Speichern fehlgeschlagen", { description: error.message });
    else onChange();
  };

  const remove = async () => {
    if (!confirm(`Etage "${floor.name}" mit ${rooms.length} Räumen löschen?`)) return;
    const { error } = await supabase.from("sales_floors").delete().eq("id", floor.id);
    if (error) toast.error("Löschen fehlgeschlagen", { description: error.message });
    else onChange();
  };

  const addRoom = async () => {
    const { error } = await supabase.from("sales_rooms").insert({
      sales_floor_id: floor.id,
      name: `Raum ${rooms.length + 1}`,
      sort_order: rooms.length,
    });
    if (error) toast.error("Fehler", { description: error.message });
    else onChange();
  };

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3 space-y-2">
        <div className="grid grid-cols-[80px_1fr_100px_auto_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Nr.</Label>
            <Input value={num} onChange={(e) => setNum(e.target.value)} type="number" className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Fläche m²</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} type="number" className="h-8" />
          </div>
          <Button size="sm" variant="outline" onClick={save} className="h-8">Speichern</Button>
          <Button size="sm" variant="ghost" onClick={remove} className="h-8 text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="pl-3 border-l-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <DoorOpen className="h-3 w-3" /> Räume ({rooms.length})
            </span>
            <Button size="sm" variant="ghost" onClick={addRoom} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Raum
            </Button>
          </div>
          {rooms.length > 0 && (
            <div className="grid grid-cols-[1fr_72px_72px_72px_auto_auto] gap-1.5 items-center px-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">Breite (m)</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">Tiefe (m)</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">Höhe (m)</span>
              <span />
              <span />
            </div>
          )}
          {rooms.map((r) => (
            <RoomRow key={r.id} room={r} onChange={onChange} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RoomRow({
  room,
  onChange,
}: {
  room: import("@/hooks/useSalesStructure").SalesRoom;
  onChange: () => void;
}) {
  const [name, setName] = useState(room.name);
  const [w, setW] = useState(room.width?.toString() ?? "");
  const [d, setD] = useState(room.depth?.toString() ?? "");
  const [h, setH] = useState(room.wall_height?.toString() ?? "");

  const save = async () => {
    const { error } = await supabase
      .from("sales_rooms")
      .update({
        name: name.trim() || "Raum",
        width: w ? Number(w) : null,
        depth: d ? Number(d) : null,
        wall_height: h ? Number(h) : null,
      })
      .eq("id", room.id);
    if (error) toast.error("Speichern fehlgeschlagen", { description: error.message });
    else onChange();
  };

  const remove = async () => {
    const { error } = await supabase.from("sales_rooms").delete().eq("id", room.id);
    if (error) toast.error("Löschen fehlgeschlagen", { description: error.message });
    else onChange();
  };

  return (
    <div className="grid grid-cols-[1fr_60px_60px_60px_auto_auto] gap-1.5 items-center">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
      <Input value={w} onChange={(e) => setW(e.target.value)} placeholder="B m" type="number" className="h-7 text-xs" />
      <Input value={d} onChange={(e) => setD(e.target.value)} placeholder="T m" type="number" className="h-7 text-xs" />
      <Input value={h} onChange={(e) => setH(e.target.value)} placeholder="H m" type="number" className="h-7 text-xs" />
      <Button size="sm" variant="ghost" onClick={save} className="h-7 text-xs">OK</Button>
      <Button size="sm" variant="ghost" onClick={remove} className="h-7 text-destructive">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
