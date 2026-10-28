import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Download, FileText, PieChart } from "lucide-react";
import { allocateBuilding, roomArea, type AllocationKey, type AllocationResult } from "@/lib/roomCostAllocation";

type PeriodKey = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "last_year";
const ENERGY_TYPES = ["strom", "gas", "waerme", "wasser"] as const;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function periodRange(p: PeriodKey, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth(), q = Math.floor(m / 3);
  const r = (a: Date, b: Date) => ({ from: ymd(a), to: ymd(b) });
  switch (p) {
    case "this_month": return r(new Date(y, m, 1), now);
    case "last_month": return r(new Date(y, m - 1, 1), new Date(y, m, 0));
    case "this_quarter": return r(new Date(y, q * 3, 1), now);
    case "last_quarter": return r(new Date(y, q * 3 - 3, 1), new Date(y, q * 3, 0));
    case "this_year": return r(new Date(y, 0, 1), now);
    case "last_year": return r(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
  }
}

const n = (v: number, d = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (v: number | null) => (v == null ? "–" : v.toLocaleString("de-DE", { style: "currency", currency: "EUR" }));

interface RoomRow { id: string; name: string; floor_id: string; area_m2: number | null; width: number | null; depth: number | null; cost_center: string | null }
interface FloorRow { id: string; name: string; location_id: string; floor_number: number | null }

interface Props { locationId: string; buildings: { id: string; name: string }[] }

export function RoomCostAllocationCard({ locationId, buildings }: Props) {
  const { t } = useTranslation();
  const T = (k: string) => t(k as any);
  const { isAdmin } = useUserRole();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("last_month");
  const [energy, setEnergy] = useState<string>("strom");
  const [key, setKey] = useState<AllocationKey>("area");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [results, setResults] = useState<AllocationResult[]>([]);
  const [unit, setUnit] = useState("kWh");
  const buildingIds = useMemo(() => buildings.map((b) => b.id), [buildings]);

  useEffect(() => {
    supabase.from("locations").select("allocation_key").eq("id", locationId).maybeSingle()
      .then(({ data }) => { if (data?.allocation_key) setKey(data.allocation_key as AllocationKey); });
  }, [locationId]);

  const load = useCallback(async () => {
    if (!buildingIds.length) return;
    setLoading(true); setError(null);
    try {
      const { from, to } = periodRange(period);
      const { data: fl, error: e1 } = await supabase.from("floors").select("id,name,location_id,floor_number").in("location_id", buildingIds);
      if (e1) throw e1;
      const floorIds = (fl ?? []).map((f) => f.id);
      const { data: rm, error: e2 } = floorIds.length
        ? await supabase.from("floor_rooms").select("id,name,floor_id,area_m2,width,depth,cost_center").in("floor_id", floorIds)
        : { data: [], error: null };
      if (e2) throw e2;
      const { data: ms, error: e3 } = await supabase.from("meters")
        .select("id,location_id,room_id,parent_meter_id,is_main_meter,unit,energy_type,is_archived")
        .in("location_id", buildingIds).eq("energy_type", energy).eq("is_archived", false);
      if (e3) throw e3;
      const meters = ms ?? [];
      const ids = meters.map((m) => m.id);
      const sums: Record<string, number> = {};
      if (ids.length) {
        const { data: s, error: e4 } = await supabase.rpc("get_meter_period_sums_with_fallback", { p_meter_ids: ids, p_from_date: from, p_to_date: to });
        if (e4) throw e4;
        for (const r of (s ?? []) as any[]) sums[r.meter_id] = Number(r.total_value) || 0;
      }
      const { data: pr } = await supabase.from("energy_prices").select("location_id,price_per_unit,valid_from,valid_until,meter_id,direction")
        .in("location_id", buildingIds).eq("energy_type", energy).is("meter_id", null).lte("valid_from", to).order("valid_from", { ascending: false });
      const priceFor = (loc: string) => {
        const p = (pr ?? []).find((x: any) => x.location_id === loc && (!x.valid_until || x.valid_until >= from) && (!x.direction || x.direction === "consumption"));
        return p ? Number(p.price_per_unit) : null;
      };
      setUnit(meters[0]?.unit || (energy === "wasser" ? "m³" : "kWh"));

      const roomList = (rm ?? []) as RoomRow[];
      const res: AllocationResult[] = buildingIds.map((loc) => {
        const locFloors = new Set((fl ?? []).filter((f) => f.location_id === loc).map((f) => f.id));
        const locRooms = roomList.filter((r) => locFloors.has(r.floor_id));
        const locMeters = meters.filter((m) => m.location_id === loc);
        const roomMeterIds = new Set(locMeters.filter((m) => m.room_id).map((m) => m.id));
        const directByRoom: Record<string, number> = {};
        for (const m of locMeters) {
          if (!m.room_id || m.is_main_meter) continue;
          if (m.parent_meter_id && roomMeterIds.has(m.parent_meter_id)) continue; // Unterzähler nicht doppelt
          directByRoom[m.room_id] = (directByRoom[m.room_id] ?? 0) + (sums[m.id] ?? 0);
        }
        const mains = locMeters.filter((m) => m.is_main_meter);
        const mainTotal = mains.length ? mains.reduce((a, m) => a + (sums[m.id] ?? 0), 0) : null;
        return allocateBuilding({
          locationId: loc, key, mainTotal, directByRoom, pricePerUnit: priceFor(loc),
          rooms: locRooms.map((r) => ({ id: r.id, name: r.name, floorId: r.floor_id, area: roomArea(r) })),
        });
      });
      setFloors((fl ?? []) as FloorRow[]); setRooms(roomList); setResults(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setLoading(false); }
  }, [buildingIds, period, energy, key]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const saveKey = async (k: AllocationKey) => {
    setKey(k);
    if (isAdmin) await supabase.from("locations").update({ allocation_key: k }).in("id", Array.from(new Set([locationId, ...buildingIds])));
  };
  const saveRoom = async (id: string, patch: Partial<RoomRow>) => {
    const { error: e } = await supabase.from("floor_rooms").update(patch).eq("id", id);
    if (!e) load();
  };

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const floorById = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);
  const bName = (id: string) => buildings.find((b) => b.id === id)?.name ?? "";
  const grand = results.reduce((a, r) => ({ total: a.total + r.total, cost: a.cost + (r.cost ?? 0) }), { total: 0, cost: 0 });

  const rowsFlat = () => results.flatMap((b) => [
    ...b.rooms.map((r) => [bName(b.locationId), floorById.get(r.floorId)?.name ?? "", r.name, roomById.get(r.roomId)?.cost_center ?? "", n(r.direct), n(r.allocated), n(r.total), r.cost == null ? "" : n(r.cost, 2)]),
    ...(b.general > 0 ? [[bName(b.locationId), "", T("costAlloc.general"), "", "", "", n(b.general), ""]] : []),
  ]);
  const header = () => [T("costAlloc.building"), T("costAlloc.floor"), T("costAlloc.room"), T("costAlloc.costCenter"), `${T("costAlloc.direct")} (${unit})`, `${T("costAlloc.allocated")} (${unit})`, `${T("costAlloc.total")} (${unit})`, `${T("costAlloc.cost")} (€)`];

  const exportCsv = () => {
    const lines = [header(), ...rowsFlat()].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kostenverteilung_${energy}_${periodRange(period).from}.csv`; a.click();
  };
  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const { from, to } = periodRange(period);
    doc.setFontSize(14); doc.text(`${T("costAlloc.title")} – ${T(`costAlloc.energy.${energy}`)}`, 10, 12);
    doc.setFontSize(9); doc.text(`${from} – ${to}`, 10, 18);
    const cols = [10, 55, 95, 140, 175, 205, 235, 265];
    let y = 26;
    const row = (r: string[], bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); r.forEach((c, i) => doc.text(String(c).slice(0, 28), cols[i], y)); y += 6; if (y > 195) { doc.addPage(); y = 15; } };
    row(header(), true); rowsFlat().forEach((r) => row(r as string[]));
    row(["", "", "", "", "", "", n(grand.total), n(grand.cost, 2)], true);
    doc.save(`kostenverteilung_${energy}_${from}.pdf`);
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger className="flex items-center gap-2 text-left">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <div>
              <CardTitle className="flex items-center gap-2"><PieChart className="h-5 w-5" />{T("costAlloc.title")}</CardTitle>
              <CardDescription>{T("costAlloc.desc")}</CardDescription>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{(["this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year"] as PeriodKey[]).map((p) => <SelectItem key={p} value={p}>{T(`costAlloc.period.${p}`)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={energy} onValueChange={setEnergy}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{ENERGY_TYPES.map((e) => <SelectItem key={e} value={e}>{T(`costAlloc.energy.${e}`)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={key} onValueChange={(v) => saveKey(v as AllocationKey)} disabled={!isAdmin}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>{(["area", "equal", "none"] as AllocationKey[]).map((k) => <SelectItem key={k} value={k}>{T(`costAlloc.key.${k}`)}</SelectItem>)}</SelectContent>
              </Select>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!results.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={!results.length}><FileText className="h-4 w-4 mr-1" />PDF</Button>
              </div>
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {loading ? <Skeleton className="h-40" /> : results.length === 0 || rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">{T("costAlloc.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b">
                    <tr className="text-left">
                      <th className="py-2 pr-2">{T("costAlloc.room")}</th><th className="pr-2">{T("costAlloc.costCenter")}</th><th className="pr-2 text-right">m²</th>
                      <th className="pr-2 text-right">{T("costAlloc.direct")}</th><th className="pr-2 text-right">{T("costAlloc.allocated")}</th>
                      <th className="pr-2 text-right">{T("costAlloc.total")} ({unit})</th><th className="text-right">{T("costAlloc.cost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((b) => {
                      const byFloor = new Map<string, typeof b.rooms>();
                      b.rooms.forEach((r) => byFloor.set(r.floorId, [...(byFloor.get(r.floorId) ?? []), r]));
                      return [
                        <tr key={b.locationId} className="bg-muted/40 font-medium">
                          <td colSpan={5} className="py-2 px-1">{bName(b.locationId)}</td>
                          <td className="text-right pr-2">{n(b.total)}</td><td className="text-right">{eur(b.cost)}</td>
                        </tr>,
                        b.shortfall > 0 && (
                          <tr key={b.locationId + "-sf"}><td colSpan={7} className="text-xs text-destructive py-1 px-1">{T("costAlloc.shortfall")}: {n(b.shortfall)} {unit}</td></tr>
                        ),
                        ...Array.from(byFloor.entries()).flatMap(([fid, rs]) => [
                          <tr key={fid} className="text-muted-foreground">
                            <td colSpan={5} className="pl-3 pt-2 text-xs uppercase">{floorById.get(fid)?.name}</td>
                            <td className="text-right pr-2 text-xs">{n(rs.reduce((a, r) => a + r.total, 0))}</td>
                            <td className="text-right text-xs">{eur(rs.every((r) => r.cost == null) ? null : rs.reduce((a, r) => a + (r.cost ?? 0), 0))}</td>
                          </tr>,
                          ...rs.map((r) => {
                            const raw = roomById.get(r.roomId);
                            return (
                              <tr key={r.roomId} className="border-b border-border/50">
                                <td className="py-1 pl-5 pr-2">{r.name}</td>
                                <td className="pr-2">
                                  <Input className="h-7 w-28" defaultValue={raw?.cost_center ?? ""} disabled={!isAdmin}
                                    onBlur={(e) => e.target.value !== (raw?.cost_center ?? "") && saveRoom(r.roomId, { cost_center: e.target.value || null })} />
                                </td>
                                <td className="pr-2 text-right">
                                  <Input className="h-7 w-20 ml-auto text-right" type="number" min={0} disabled={!isAdmin}
                                    placeholder={raw ? (roomArea({ width: raw.width, depth: raw.depth }) ?? 0).toLocaleString("de-DE") : ""}
                                    defaultValue={raw?.area_m2 ?? ""}
                                    onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (raw?.area_m2 ?? null)) saveRoom(r.roomId, { area_m2: v }); }} />
                                </td>
                                <td className="pr-2 text-right">{n(r.direct)}</td>
                                <td className="pr-2 text-right">{n(r.allocated)}</td>
                                <td className="pr-2 text-right font-medium">{n(r.total)}</td>
                                <td className="text-right">{eur(r.cost)}</td>
                              </tr>
                            );
                          }),
                        ]),
                        b.general > 0 && (
                          <tr key={b.locationId + "-g"}><td colSpan={5} className="pl-5 py-1 italic">{T("costAlloc.general")}</td><td className="pr-2 text-right">{n(b.general)}</td><td /></tr>
                        ),
                      ];
                    })}
                    {results.length > 1 && (
                      <tr className="font-semibold border-t"><td colSpan={5} className="py-2">{T("costAlloc.grandTotal")}</td><td className="pr-2 text-right">{n(grand.total)}</td><td className="text-right">{eur(grand.cost)}</td></tr>
                    )}
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-2">{T("costAlloc.hint")}</p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
