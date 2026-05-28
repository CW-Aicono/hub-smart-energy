import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Server, Cpu, MemoryStick, HardDrive, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface NodeMetric {
  node_name: string;
  cpu_percent: number | null;
  mem_percent: number | null;
  disk_percent: number | null;
  load_avg_1m: number | null;
  uptime_seconds: number | null;
  recorded_at: string;
}

function pctBadge(value: number | null) {
  if (value == null) return <Badge variant="secondary">–</Badge>;
  const v = value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (value >= 80) return <Badge variant="destructive">{v}%</Badge>;
  if (value >= 60)
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400">
        {v}%
      </Badge>
    );
  return (
    <Badge className="bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400">
      {v}%
    </Badge>
  );
}

function formatUptime(seconds: number | null): string {
  if (!seconds) return "–";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function HetznerNodesCard() {
  const { data: nodes, isLoading } = useQuery({
    queryKey: ["hetzner-node-metrics"],
    queryFn: async () => {
      // Hole die letzten 200 Datensätze und reduziere auf neuesten pro node_name
      const { data, error } = await supabase
        .from("node_metrics" as any)
        .select("node_name,cpu_percent,mem_percent,disk_percent,load_avg_1m,uptime_seconds,recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const seen = new Map<string, NodeMetric>();
      for (const row of ((data ?? []) as unknown) as NodeMetric[]) {
        if (!seen.has(row.node_name)) seen.set(row.node_name, row);
      }
      return Array.from(seen.values()).sort((a, b) =>
        a.node_name.localeCompare(b.node_name),
      );
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4" />
          Hetzner-Server (Live-Metriken)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : !nodes || nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Daten. Bitte den Reporter auf dem Server installieren
            (siehe <code>docs/node-metrics-reporter/README.md</code>).
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nodes.map((n) => {
              const ageMin =
                (Date.now() - new Date(n.recorded_at).getTime()) / 60000;
              const stale = ageMin > 3;
              return (
                <div
                  key={n.node_name}
                  className="rounded-lg border p-4 space-y-3 bg-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{n.node_name}</div>
                    <Badge variant={stale ? "destructive" : "secondary"}>
                      {stale
                        ? "Stale"
                        : formatDistanceToNow(new Date(n.recorded_at), {
                            addSuffix: true,
                            locale: de,
                          })}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Cpu className="h-3.5 w-3.5" /> CPU
                      </span>
                      {pctBadge(n.cpu_percent)}
                    </div>
                    <Progress value={n.cpu_percent ?? 0} className="h-1.5" />

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <MemoryStick className="h-3.5 w-3.5" /> Speicher
                      </span>
                      {pctBadge(n.mem_percent)}
                    </div>
                    <Progress value={n.mem_percent ?? 0} className="h-1.5" />

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <HardDrive className="h-3.5 w-3.5" /> Festplatte
                      </span>
                      {pctBadge(n.disk_percent)}
                    </div>
                    <Progress value={n.disk_percent ?? 0} className="h-1.5" />

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span>
                        Load:{" "}
                        {n.load_avg_1m != null
                          ? n.load_avg_1m.toLocaleString("de-DE", {
                              maximumFractionDigits: 2,
                            })
                          : "–"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatUptime(n.uptime_seconds)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
