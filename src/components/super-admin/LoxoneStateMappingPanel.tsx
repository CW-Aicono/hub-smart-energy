import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";

type DiagState = { key: string; role: string; uuid?: string; value?: number | null };
type DiagBlock = {
  block_uuid: string;
  meter_id: string | null;
  energy_type: string | null;
  states: DiagState[];
};

type MeterRow = {
  id: string;
  name: string | null;
  energy_type: string | null;
  sensor_uuid: string | null;
  power_state_uuid: string | null;
  power_state_key: string | null;
};

/**
 * Deterministische Rollen-Zuordnung (v1.15).
 *
 * Der Worker rät nicht mehr, welcher Loxone-State die Momentanleistung ist.
 * Bleibt ein Block mehrdeutig, wird er hier sichtbar und ein Admin ordnet den
 * Leistungs-State einmalig fest zu (`meters.power_state_uuid`).
 */
export default function LoxoneStateMappingPanel() {
  const queryClient = useQueryClient();
  const [savingMeter, setSavingMeter] = useState<string | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["loxone-state-mapping"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data: events, error } = await supabase
        .from("bridge_event_log")
        .select("details, occurred_at")
        .eq("event_type", "ws_block_states")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      // Neuester Stand pro Block gewinnt.
      const blocks = new Map<string, DiagBlock>();
      for (const ev of (events ?? []) as any[]) {
        for (const b of (ev.details?.blocks ?? []) as DiagBlock[]) {
          if (!b?.block_uuid || blocks.has(b.block_uuid)) continue;
          blocks.set(b.block_uuid, b);
        }
      }
      const list = Array.from(blocks.values());
      const meterIds = list.map((b) => b.meter_id).filter(Boolean) as string[];
      if (meterIds.length === 0) return { blocks: list, meters: {} as Record<string, MeterRow> };

      const { data: meters, error: mErr } = await supabase
        .from("meters")
        .select("id, name, energy_type, sensor_uuid, power_state_uuid, power_state_key")
        .in("id", meterIds);
      if (mErr) throw mErr;
      const byId: Record<string, MeterRow> = {};
      for (const m of (meters ?? []) as any[]) byId[m.id] = m as MeterRow;
      return { blocks: list, meters: byId };
    },
  });

  const rows = useMemo(() => {
    const blocks = data?.blocks ?? [];
    const meters = data?.meters ?? {};
    return blocks
      .map((b) => {
        const meter = b.meter_id ? meters[b.meter_id] : null;
        const hasPwr = b.states.some((s) => s.role === "pwr");
        const explicit = meter?.power_state_uuid ?? null;
        return { block: b, meter, hasPwr, explicit, isGap: !hasPwr && !explicit };
      })
      .filter((r) => (onlyGaps ? r.isGap : true))
      .sort((a, b) => Number(b.isGap) - Number(a.isGap));
  }, [data, onlyGaps]);

  const assign = async (meterId: string, uuid: string, key: string) => {
    setSavingMeter(meterId);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("meters")
        .update({
          power_state_uuid: uuid || null,
          power_state_key: uuid ? key : null,
          power_state_set_at: uuid ? new Date().toISOString() : null,
          power_state_set_by: uuid ? userRes?.user?.id ?? null : null,
        } as any)
        .eq("id", meterId);
      if (error) throw error;
      toast.success(uuid ? "Leistungs-State zugeordnet" : "Zuordnung entfernt");
      await queryClient.invalidateQueries({ queryKey: ["loxone-state-mapping"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSavingMeter(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Loxone State-Zuordnung
            {rows.some((r) => r.isGap) && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> offen
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Der Worker rät keine Rollen mehr. Blöcke ohne eindeutigen Leistungs-State werden hier
            gelistet und einmalig fest zugeordnet — damit landen nie wieder Zählerstände in der
            Leistungsreihe.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOnlyGaps((v) => !v)}>
            {onlyGaps ? "Alle Blöcke" : "Nur offene"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Lade Diagnosedaten …</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {onlyGaps
              ? "Keine offenen Zuordnungen — alle Blöcke haben einen eindeutigen Leistungs-State."
              : "Keine Diagnosedaten der letzten 48 Stunden."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zähler</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Erkannte States</TableHead>
                <TableHead className="w-72">Leistungs-State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ block, meter, hasPwr, explicit, isGap }) => (
                <TableRow key={block.block_uuid}>
                  <TableCell className="font-medium">
                    {meter?.name ?? "—"}
                    <div className="text-xs text-muted-foreground">{block.energy_type ?? "—"}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{block.block_uuid}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {block.states.map((s) => (
                        <Badge
                          key={`${block.block_uuid}-${s.key}`}
                          variant={s.role === "pwr" ? "default" : "secondary"}
                          className="text-[11px]"
                        >
                          {s.key}: {s.role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!meter ? (
                      <span className="text-xs text-muted-foreground">kein Zähler verknüpft</span>
                    ) : (
                      <Select
                        value={explicit ?? (hasPwr ? "__auto__" : "")}
                        disabled={savingMeter === meter.id}
                        onValueChange={(v) => {
                          if (v === "__auto__") return assign(meter.id, "", "");
                          const st = block.states.find((s) => s.uuid === v);
                          assign(meter.id, v, st?.key ?? "");
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={isGap ? "State wählen …" : "automatisch"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Automatisch (Loxone-Benennung)</SelectItem>
                          {block.states
                            .filter((s) => !!s.uuid)
                            .map((s) => (
                              <SelectItem key={s.uuid} value={s.uuid!}>
                                {s.key} ({s.role})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
