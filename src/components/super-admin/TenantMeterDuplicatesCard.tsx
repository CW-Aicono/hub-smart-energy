import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Copy, CheckCircle2, RefreshCw, Merge, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MeterItem {
  id: string;
  name: string;
  location_name: string | null;
  location_integration_id: string | null;
  sensor_uuid: string | null;
  energy_type: string | null;
  unit: string | null;
  created_at: string;
}

interface DupGroup {
  tenant_id: string;
  tenant_name: string | null;
  location_integration_id: string | null;
  sensor_uuid: string;
  duplicate_count: number;
  master_id: string;
  meters: MeterItem[];
}

interface MergeResult {
  master_id: string;
  duplicate_id: string;
  ok: boolean;
  error?: string;
}

interface Props {
  tenantId: string;
  tenantName?: string | null;
}

export default function TenantMeterDuplicatesCard({ tenantId, tenantName }: Props) {
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirmGroup, setConfirmGroup] = useState<DupGroup | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [lastErrors, setLastErrors] = useState<MergeResult[]>([]);

  const scan = async () => {
    setScanning(true);
    setLastErrors([]);
    try {
      const { data, error } = await supabase.functions.invoke("meters-duplicates-scan", {
        body: { tenant_id: tenantId },
      });
      if (error) throw error;
      setGroups((data?.groups ?? []) as DupGroup[]);
    } catch (err: any) {
      toast.error(`Scan fehlgeschlagen: ${err?.message ?? err}`);
    } finally {
      setScanning(false);
    }
  };

  const invokeMerge = async (merges: Array<{ master_id: string; duplicate_id: string }>) => {
    const { data, error } = await supabase.functions.invoke("meters-merge-duplicates", {
      body: { merges },
    });
    if (error) throw error;
    return (data?.results ?? []) as MergeResult[];
  };

  const mergeMutation = useMutation({
    mutationFn: async (group: DupGroup) => {
      const merges = group.meters
        .filter((m) => m.id !== group.master_id)
        .map((m) => ({ master_id: group.master_id, duplicate_id: m.id }));
      return invokeMerge(merges);
    },
    onSuccess: (results) => handleResults(results),
    onError: (err: any) => {
      toast.error(`Zusammenführung fehlgeschlagen: ${err?.message ?? err}`);
    },
  });

  const mergeAllMutation = useMutation({
    mutationFn: async (allGroups: DupGroup[]) => {
      const merges = allGroups.flatMap((g) =>
        g.meters
          .filter((m) => m.id !== g.master_id)
          .map((m) => ({ master_id: g.master_id, duplicate_id: m.id })),
      );
      return invokeMerge(merges);
    },
    onSuccess: (results) => handleResults(results),
    onError: (err: any) => {
      toast.error(`Bulk-Zusammenführung fehlgeschlagen: ${err?.message ?? err}`);
    },
  });

  const handleResults = (results: MergeResult[]) => {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    setLastErrors(failed);
    if (failed.length === 0) {
      toast.success(`${ok.length} Duplikat(e) zusammengeführt`);
    } else {
      const firstErr = failed[0]?.error ?? "Unbekannter Fehler";
      toast.warning(`${ok.length} ok, ${failed.length} Fehler — z. B.: ${firstErr}`);
    }
    queryClient.invalidateQueries();
    scan();
  };

  const totalDuplicates = (groups ?? []).reduce(
    (sum, g) => sum + Math.max(0, g.duplicate_count - 1),
    0,
  );
  const busy = mergeMutation.isPending || mergeAllMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Zähler-Duplikate
            </CardTitle>
            <CardDescription className="mt-1">
              Sucht bei diesem Mandanten{tenantName ? ` (${tenantName})` : ""} nach Zählern, die
              mehrfach für denselben Sensor eines Gateways angelegt wurden. Der Scan läuft nur nach
              manuellem Klick.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {groups && groups.length > 0 && (
              <Button
                onClick={() => setConfirmAll(true)}
                disabled={busy || scanning}
                title="Alle gefundenen Duplikat-Gruppen in einem Rutsch zusammenführen"
              >
                <Layers className="h-4 w-4 mr-2" />
                Alle zusammenführen ({totalDuplicates})
              </Button>
            )}
            <Button variant="outline" onClick={scan} disabled={scanning || busy}>
              <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
              {groups === null ? "Scan starten" : "Neu scannen"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {lastErrors.length > 0 && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {lastErrors.length} Zusammenführung(en) fehlgeschlagen
            </div>
            <ul className="text-xs text-destructive/90 space-y-1 max-h-40 overflow-auto">
              {lastErrors.map((e, i) => (
                <li key={i} className="font-mono break-all">
                  {e.duplicate_id.slice(0, 8)}… → {e.master_id.slice(0, 8)}…: {e.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {groups === null ? (
          <p className="text-sm text-muted-foreground">
            Noch kein Scan durchgeführt. Klicke oben rechts auf „Scan starten".
          </p>
        ) : groups.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            Keine Duplikate gefunden.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const master = g.meters.find((m) => m.id === g.master_id);
              const dups = g.meters.filter((m) => m.id !== g.master_id);
              return (
                <div
                  key={`${g.location_integration_id}|${g.sensor_uuid}`}
                  className="rounded-md border p-3 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="font-medium truncate">{master?.name ?? "Unbekannt"}</span>
                        <Badge variant="secondary">{g.duplicate_count} Einträge</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Standort: {master?.location_name ?? "—"} · Sensor:{" "}
                        <code>{g.sensor_uuid}</code>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setConfirmGroup(g)}
                      disabled={busy}
                    >
                      <Merge className="h-4 w-4 mr-2" />
                      Zusammenführen
                    </Button>
                  </div>
                  <div className="rounded-md border divide-y">
                    {g.meters.map((m) => {
                      const isMaster = m.id === g.master_id;
                      return (
                        <div key={m.id} className="p-2 text-sm flex items-center gap-2">
                          {isMaster ? (
                            <Badge className="bg-green-600 hover:bg-green-600">Master</Badge>
                          ) : (
                            <Badge variant="destructive">Duplikat</Badge>
                          )}
                          <span className="truncate flex-1">{m.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(m.created_at).toLocaleString("de-DE")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {dups.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Beim Zusammenführen werden {dups.length} Duplikat(e) archiviert, deren
                      historische Messwerte gelöscht und alle Referenzen auf den Master umgehängt.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirmGroup} onOpenChange={(o) => !o && setConfirmGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplikate zusammenführen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{confirmGroup?.meters.find((m) => m.id === confirmGroup?.master_id)?.name}" wird
              beibehalten. {(confirmGroup?.duplicate_count ?? 1) - 1} weitere Zähler-Einträge werden
              archiviert und deren historische Messwerte gelöscht. Referenzen aus Dashboards,
              Automationen, Wallboxen, PPA-Verträgen etc. werden auf den Master umgehängt. Der
              Vorgang wird im Audit-Log dokumentiert und ist nicht per Klick rückgängig zu machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmGroup) mergeMutation.mutate(confirmGroup);
                setConfirmGroup(null);
              }}
            >
              Zusammenführen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alle Duplikate zusammenführen?</AlertDialogTitle>
            <AlertDialogDescription>
              Es werden {groups?.length ?? 0} Gruppe(n) mit insgesamt {totalDuplicates} Duplikat(en)
              in einem Vorgang zusammengeführt. Pro Gruppe bleibt der ältere Zähler als Master
              erhalten, alle anderen werden archiviert, historische Messwerte gelöscht und
              Referenzen umgehängt. Fehler bei einzelnen Gruppen werden angezeigt, unterbrechen die
              Verarbeitung aber nicht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (groups && groups.length > 0) mergeAllMutation.mutate(groups);
                setConfirmAll(false);
              }}
            >
              Alle zusammenführen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
