import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timer, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSortableData } from "@/components/ui/sortable-head";
import { cn } from "@/lib/utils";

type PollSortKey = "tenant" | "location" | "interval" | "sync";

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

const HetznerNodesIntervalCard = () => null;

export default function LoxonePollingOverviewCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [flagEnabled, setFlagEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: flagRow }, { data: liRows }] = await Promise.all([
        supabase.from("system_settings").select("value").eq("key", "loxone_respect_poll_interval").maybeSingle(),
        supabase
          .from("location_integrations")
          .select("id, location_id, config, last_sync_at, integration:integrations(type), location:locations(name, tenant:tenants(name))")
          .eq("is_enabled", true),
      ]);
      if (cancelled) return;
      setFlagEnabled(!(flagRow && String((flagRow as any).value).toLowerCase() === "false"));
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

  const { sorted, sort, toggle } = useSortableData<Row, PollSortKey>(
    rows,
    (r, k) => {
      const raw = Number((r.config as any)?.poll_interval_minutes);
      const interval = Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.floor(raw) : 15;
      switch (k) {
        case "tenant": return r.location?.tenant?.name ?? "";
        case "location": return r.location?.name ?? "";
        case "interval": return interval;
        case "sync": return r.last_sync_at ? new Date(r.last_sync_at) : null;
        default: return null;
      }
    },
    { key: "tenant", direction: "asc" },
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4" />
          Loxone-Abfrage-Intervalle
          <Badge variant={flagEnabled ? "default" : "secondary"} className="ml-2">
            {flagEnabled ? "Drosselung aktiv" : "Drosselung AUS (alle 1 Min)"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine aktiven Loxone-Integrationen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <SortTh<PollSortKey> label="Tenant" sortKey="tenant" sort={sort} onToggle={toggle} />
                  <SortTh<PollSortKey> label="Liegenschaft" sortKey="location" sort={sort} onToggle={toggle} />
                  <SortTh<PollSortKey> label="Intervall (Min)" sortKey="interval" sort={sort} onToggle={toggle} />
                  <SortTh<PollSortKey> label="Letzter Sync" sortKey="sync" sort={sort} onToggle={toggle} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const raw = Number((r.config as any)?.poll_interval_minutes);
                  const interval = Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.floor(raw) : 15;
                  const isDefault = !Number.isFinite(raw);
                  const lastSync = r.last_sync_at ? new Date(r.last_sync_at) : null;
                  const ageSec = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 1000) : null;
                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{r.location?.tenant?.name || "—"}</td>
                      <td className="py-2 pr-4">{r.location?.name || "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={isDefault ? "secondary" : "default"}>
                          {interval.toLocaleString("de-DE")}{isDefault ? " (Default)" : ""}
                        </Badge>
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
        )}
      </CardContent>
    </Card>
  );
}
