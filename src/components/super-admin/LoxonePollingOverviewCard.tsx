import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Liegenschaft</th>
                  <th className="py-2 pr-4">Intervall (Min)</th>
                  <th className="py-2 pr-4">Letzter Sync</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
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
