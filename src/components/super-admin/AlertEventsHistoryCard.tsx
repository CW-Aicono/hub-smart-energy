import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { History, RefreshCw, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

type AlertEvent = {
  id: string;
  rule_id: string | null;
  metric_category: string;
  metric_name: string;
  metric_value: number;
  threshold: number;
  comparator: string;
  severity: string;
  message: string | null;
  triggered_at: string;
  resolved_at: string | null;
  resolved_value: number | null;
  archived_at: string | null;
};

const RANGE_HOURS: Record<string, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function formatValue(cat: string, name: string, v: number): string {
  const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  if (name.endsWith("_bytes")) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0; let n = v;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${fmt(n)} ${units[i]}`;
  }
  if (name.endsWith("_pct")) return `${fmt(v)} %`;
  return fmt(v);
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical") return <Badge variant="destructive">Kritisch</Badge>;
  if (severity === "warning") return (
    <Badge variant="default" className="bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400">Warnung</Badge>
  );
  return <Badge variant="secondary">Info</Badge>;
}

export default function AlertEventsHistoryCard() {
  const qc = useQueryClient();
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [severity, setSeverity] = useState<"all" | "warning" | "critical">("all");
  const [status, setStatus] = useState<"all" | "open" | "resolved" | "archived">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sinceIso = useMemo(
    () => new Date(Date.now() - RANGE_HOURS[range] * 3600 * 1000).toISOString(),
    [range],
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["monitoring-alert-events", range, severity, status],
    queryFn: async () => {
      let q = supabase
        .from("monitoring_alert_events" as any)
        .select("*")
        .gte("triggered_at", sinceIso)
        .order("triggered_at", { ascending: false })
        .limit(200);
      if (severity !== "all") q = q.eq("severity", severity);
      if (status === "open") q = q.is("resolved_at", null).is("archived_at", null);
      if (status === "resolved") q = q.not("resolved_at", "is", null).is("archived_at", null);
      if (status === "archived") q = q.not("archived_at", "is", null);
      if (status === "all") q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AlertEvent[];
    },
    refetchInterval: 60_000,
  });

  const events = data ?? [];

  const invalidate = () => {
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["monitoring-alert-events"] });
  };

  const archiveMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("monitoring_alert_events" as any)
        .update({ archived_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => { toast.success(`${ids.length} archiviert`); invalidate(); },
    onError: (e: Error) => toast.error(`Fehler: ${e.message}`),
  });

  const restoreMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("monitoring_alert_events" as any)
        .update({ archived_at: null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => { toast.success(`${ids.length} wiederhergestellt`); invalidate(); },
    onError: (e: Error) => toast.error(`Fehler: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("monitoring_alert_events" as any)
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => { toast.success(`${ids.length} gelöscht`); invalidate(); },
    onError: (e: Error) => toast.error(`Fehler: ${e.message}`),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === events.length) setSelected(new Set());
    else setSelected(new Set(events.map((e) => e.id)));
  };

  const selectedIds = Array.from(selected);
  const eligibleForArchive = events
    .filter((e) => selected.has(e.id) && e.resolved_at && !e.archived_at)
    .map((e) => e.id);
  const viewingArchive = status === "archived";

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Alert-Historie
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Letzte 24 h</SelectItem>
              <SelectItem value="7d">Letzte 7 Tage</SelectItem>
              <SelectItem value="30d">Letzte 30 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Level</SelectItem>
              <SelectItem value="warning">Nur Warnung</SelectItem>
              <SelectItem value="critical">Nur Kritisch</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Aktive (Alle)</SelectItem>
              <SelectItem value="open">Nur offen</SelectItem>
              <SelectItem value="resolved">Nur behoben</SelectItem>
              <SelectItem value="archived">Archiv</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {selectedIds.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selectedIds.length} ausgewählt</span>
            <div className="ml-auto flex gap-2">
              {viewingArchive ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restoreMut.mutate(selectedIds)}
                  disabled={restoreMut.isPending}
                >
                  <ArchiveRestore className="h-4 w-4 mr-1" />
                  Wiederherstellen
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => archiveMut.mutate(eligibleForArchive)}
                  disabled={archiveMut.isPending || eligibleForArchive.length === 0}
                  title={eligibleForArchive.length === 0 ? "Nur behobene Alerts können archiviert werden" : undefined}
                >
                  <Archive className="h-4 w-4 mr-1" />
                  Archivieren ({eligibleForArchive.length})
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{selectedIds.length} Ereignisse endgültig löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Diese Aktion kann nicht rückgängig gemacht werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMut.mutate(selectedIds)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Endgültig löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Lade…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {viewingArchive ? "Archiv ist leer." : "Keine Ereignisse im gewählten Zeitraum. Das ist gut."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === events.length && events.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Alle auswählen"
                    />
                  </TableHead>
                  <TableHead>Zeit</TableHead>
                  <TableHead>Metrik</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Wert</TableHead>
                  <TableHead className="text-right">Schwelle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Behoben um</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id} data-state={selected.has(e.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(e.id)}
                        onCheckedChange={() => toggle(e.id)}
                        aria-label="Auswählen"
                      />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(e.triggered_at), "dd.MM.yyyy HH:mm", { locale: de })}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {e.metric_category}.{e.metric_name}
                    </TableCell>
                    <TableCell><SeverityBadge severity={e.severity} /></TableCell>
                    <TableCell className="text-right text-xs">
                      {formatValue(e.metric_category, e.metric_name, Number(e.metric_value))}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {e.comparator} {formatValue(e.metric_category, e.metric_name, Number(e.threshold))}
                    </TableCell>
                    <TableCell>
                      {e.archived_at ? (
                        <Badge variant="outline">Archiviert</Badge>
                      ) : e.resolved_at ? (
                        <Badge variant="secondary" className="bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400">
                          Behoben
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Offen</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {e.resolved_at ? format(new Date(e.resolved_at), "dd.MM. HH:mm", { locale: de }) : "–"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
