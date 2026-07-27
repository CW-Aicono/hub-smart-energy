import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Timer, ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, Search, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSortableData } from "@/components/ui/sortable-head";
import { cn } from "@/lib/utils";
import { useSystemSetting, useSetSystemSetting } from "@/hooks/useSystemSetting";
import { writeAuditLog } from "@/lib/auditLog";
import { toast } from "sonner";

type PollSortKey = "tenant" | "location" | "interval" | "effective" | "sync";

function SortTh<K extends string>({ label, sortKey, sort, onToggle, className }: {
  label: React.ReactNode; sortKey: K; sort: { key: K | null; direction: "asc" | "desc" }; onToggle: (k: K) => void; className?: string;
}) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("py-2 pr-4 text-left select-none", className)}>
      <button type="button" onClick={() => onToggle(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-foreground", isActive && "text-foreground")}>
        {label}
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

interface Row {
  id: string;
  location_id: string | null;
  config: Record<string, any> | null;
  last_sync_at: string | null;
  integration: { type: string } | null;
  location: { name: string | null; tenant: { name: string | null } | null } | null;
}

const MASTER_FLOOR_KEY = "loxone_master_poll_floor_minutes";

export default function LoxonePollingOverviewCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: floorRaw } = useSystemSetting(MASTER_FLOOR_KEY);
  const setSetting = useSetSystemSetting();
  const floorParsed = floorRaw != null ? Number(floorRaw) : NaN;
  const floorActive = Number.isFinite(floorParsed) && floorParsed >= 1 && floorParsed <= 60;
  const floorMinutes = floorActive ? Math.floor(floorParsed) : 0;

  const [floorInput, setFloorInput] = useState<string>("");
  useEffect(() => {
    setFloorInput(floorActive ? String(floorMinutes) : "");
  }, [floorActive, floorMinutes]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: liRows } = await supabase
        .from("location_integrations")
        .select("id, location_id, config, last_sync_at, integration:integrations(type), location:locations(name, tenant:tenants(name))")
        .eq("is_enabled", true);
      if (cancelled) return;
      const filtered = ((liRows as any[]) || []).filter(
        (r) => r.integration?.type === "loxone" || r.integration?.type === "loxone_miniserver"
      );
      setRows(filtered as Row[]);
      setLoading(false);
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const enriched = useMemo(() => rows.map((r) => {
    const raw = Number((r.config as any)?.poll_interval_minutes);
    const configured = Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.floor(raw) : 15;
    const isDefault = !Number.isFinite(raw);
    const effective = floorActive ? Math.max(configured, floorMinutes) : configured;
    const floorApplies = floorActive && effective > configured;
    return { ...r, _configured: configured, _isDefault: isDefault, _effective: effective, _floorApplies: floorApplies };
  }), [rows, floorActive, floorMinutes]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((r) =>
      (r.location?.tenant?.name ?? "").toLowerCase().includes(q) ||
      (r.location?.name ?? "").toLowerCase().includes(q)
    );
  }, [enriched, query]);

  const { sorted, sort, toggle } = useSortableData<typeof enriched[number], PollSortKey>(
    searched,
    (r, k) => {
      switch (k) {
        case "tenant": return r.location?.tenant?.name ?? "";
        case "location": return r.location?.name ?? "";
        case "interval": return r._configured;
        case "effective": return r._effective;
        case "sync": return r.last_sync_at ? new Date(r.last_sync_at) : null;
        default: return null;
      }
    },
    { key: "tenant", direction: "asc" },
  );

  async function saveFloor(nextMinutes: number | null) {
    const before = floorActive ? floorMinutes : null;
    const value = nextMinutes == null ? "" : String(nextMinutes);
    try {
      await setSetting.mutateAsync({ key: MASTER_FLOOR_KEY, value });
      writeAuditLog({
        action: "loxone.master_floor.update",
        entity_type: "system_settings",
        entity_id: MASTER_FLOOR_KEY,
        entity_label: "Loxone Master-Drosselung",
        before: { minutes: before },
        after: { minutes: nextMinutes },
      });
    } catch (e) {
      toast.error("Konnte Master-Drosselung nicht speichern");
    }
  }

  function onSaveInput() {
    const n = Number(floorInput);
    if (!Number.isFinite(n) || n < 1 || n > 60) {
      toast.error("Bitte eine Zahl zwischen 1 und 60 eingeben");
      return;
    }
    saveFloor(Math.floor(n));
  }

  const total = enriched.length;
  const throttled = enriched.filter((r) => r._floorApplies).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Timer className="h-4 w-4" />
          Loxone-Abfrage-Intervalle
          <Badge variant={floorActive ? "destructive" : "outline"}>
            {floorActive ? `Master-Floor: ${floorMinutes.toLocaleString("de-DE")} Min` : "Master-Floor: Aus"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master-Floor Steuerung */}
        <div className="rounded-md border p-3 bg-muted/30 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">Master-Drosselung (Hard Floor):</strong> Überschreibt kürzere Tenant-Intervalle für alle Loxone-Integrationen. Effektives Intervall = max(Tenant, Master). Für IO-Notfälle.
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Master-Floor (Min)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={floorInput}
                onChange={(e) => setFloorInput(e.target.value)}
                placeholder="z.B. 30"
                className="h-8 w-32"
              />
            </div>
            <Button size="sm" onClick={onSaveInput} disabled={setSetting.isPending}>
              Speichern
            </Button>
            <Button size="sm" variant="outline" onClick={() => saveFloor(null)} disabled={setSetting.isPending || !floorActive}>
              Deaktivieren
            </Button>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-muted-foreground mr-1">Presets:</span>
              {[15, 30, 60].map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={floorActive && floorMinutes === m ? "default" : "outline"}
                  className="h-7 px-2"
                  onClick={() => saveFloor(m)}
                  disabled={setSetting.isPending}
                >
                  {m} Min
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {loading ? "Lade…" : (
              <>
                {total.toLocaleString("de-DE")} Miniserver aktiv
                {floorActive && throttled > 0 && (
                  <> · <span className="text-destructive">{throttled.toLocaleString("de-DE")} durch Master-Floor gedrosselt</span></>
                )}
              </>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={loading || total === 0} className="gap-2">
            <List className="h-4 w-4" />
            Alle Intervalle anzeigen
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Timer className="h-4 w-4" />
                Loxone-Abfrage-Intervalle — alle Miniserver
              </DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nach Tenant oder Liegenschaft suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {sorted.length.toLocaleString("de-DE")} von {total.toLocaleString("de-DE")} Miniservern
            </div>
            <div className="overflow-auto flex-1 border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background z-10 border-b">
                  <tr className="text-left text-muted-foreground">
                    <SortTh<PollSortKey> label="Tenant" sortKey="tenant" sort={sort} onToggle={toggle} className="pl-3" />
                    <SortTh<PollSortKey> label="Liegenschaft" sortKey="location" sort={sort} onToggle={toggle} />
                    <SortTh<PollSortKey> label="Konfiguriert (Min)" sortKey="interval" sort={sort} onToggle={toggle} />
                    <SortTh<PollSortKey> label="Effektiv (Min)" sortKey="effective" sort={sort} onToggle={toggle} />
                    <SortTh<PollSortKey> label="Letzter Sync" sortKey="sync" sort={sort} onToggle={toggle} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        Keine Treffer.
                      </td>
                    </tr>
                  ) : sorted.map((r) => {
                    const lastSync = r.last_sync_at ? new Date(r.last_sync_at) : null;
                    const ageSec = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 1000) : null;
                    return (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 pl-3">{r.location?.tenant?.name || "—"}</td>
                        <td className="py-2 pr-4">{r.location?.name || "—"}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={r._isDefault ? "secondary" : "default"}>
                            {r._configured.toLocaleString("de-DE")}{r._isDefault ? " (Default)" : ""}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <Badge variant={r._floorApplies ? "destructive" : "outline"}>
                              {r._effective.toLocaleString("de-DE")}
                            </Badge>
                            {r._floorApplies && (
                              <span className="text-xs text-muted-foreground">durch Master-Floor</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {lastSync
                            ? `vor ${ageSec! < 60 ? `${ageSec}s` : `${Math.round(ageSec! / 60).toLocaleString("de-DE")} Min`}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
