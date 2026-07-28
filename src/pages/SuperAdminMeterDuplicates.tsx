import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Copy, CheckCircle2, RefreshCw, Merge } from "lucide-react";
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
  tenant_id: string;
  tenant_name: string | null;
  location_id: string | null;
  location_name: string | null;
  location_integration_id: string | null;
  sensor_uuid: string | null;
  capture_type: string | null;
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

export default function SuperAdminMeterDuplicates() {
  const queryClient = useQueryClient();
  const [confirmGroup, setConfirmGroup] = useState<DupGroup | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["super-admin", "meter-duplicates"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meters-duplicates-scan", { body: {} });
      if (error) throw error;
      return (data?.groups ?? []) as DupGroup[];
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async (group: DupGroup) => {
      const dupIds = group.meters.filter((m) => m.id !== group.master_id).map((m) => m.id);
      const { data, error } = await supabase.functions.invoke("meters-merge-duplicates", {
        body: { master_id: group.master_id, duplicate_ids: dupIds },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      const okCount = (res?.results ?? []).filter((r: any) => r.ok).length;
      const failCount = (res?.results ?? []).filter((r: any) => !r.ok).length;
      if (failCount === 0) toast.success(`${okCount} Duplikat(e) zusammengeführt`);
      else toast.warning(`${okCount} ok, ${failCount} Fehler — Details in der Konsole`);
      queryClient.invalidateQueries({ queryKey: ["super-admin", "meter-duplicates"] });
    },
    onError: (err: any) => {
      toast.error(`Zusammenführung fehlgeschlagen: ${err?.message ?? err}`);
    },
  });

  const groups = data ?? [];

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Copy className="h-6 w-6" />
              Duplikate-Bereinigung Zähler
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Findet Zähler, die mehrfach für denselben Sensor eines Gateways angelegt wurden, und
              führt sie sicher auf den ältesten Datensatz zusammen. Historische Zeitreihen werden
              gelöscht (sie sind identisch mit dem Master, da beide dieselbe Sensor-Quelle bekommen),
              alle Konfigurations-Referenzen (Widgets, Automationen, Wallboxen, Speicher, PPA, …)
              werden auf den Master umgehängt und das Duplikat wird archiviert.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Neu scannen
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <div className="text-lg font-medium">Keine Duplikate gefunden</div>
              <p className="text-sm text-muted-foreground max-w-md">
                Alle Zähler mit Sensor-UUID sind eindeutig. Der eindeutige Datenbank-Index verhindert
                zukünftig neue Duplikate.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const master = g.meters.find((m) => m.id === g.master_id);
              const dups = g.meters.filter((m) => m.id !== g.master_id);
              return (
                <Card key={`${g.tenant_id}|${g.location_integration_id}|${g.sensor_uuid}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          {master?.name ?? "Unbekannt"}
                          <Badge variant="secondary">{g.duplicate_count} Einträge</Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Tenant: <span className="font-medium">{g.tenant_name ?? g.tenant_id}</span>
                          {" · "}
                          Standort: <span className="font-medium">{master?.location_name ?? "—"}</span>
                          {" · "}
                          Sensor: <code className="text-xs">{g.sensor_uuid}</code>
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => setConfirmGroup(g)}
                        disabled={mergeMutation.isPending}
                      >
                        <Merge className="h-4 w-4 mr-2" />
                        Zusammenführen
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border divide-y">
                      {g.meters.map((m) => {
                        const isMaster = m.id === g.master_id;
                        return (
                          <div key={m.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {isMaster ? (
                                  <Badge className="bg-green-600 hover:bg-green-600">Master (bleibt)</Badge>
                                ) : (
                                  <Badge variant="destructive">Duplikat (wird archiviert)</Badge>
                                )}
                                <span className="font-medium truncate">{m.name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                ID: <code>{m.id}</code>
                                {" · "}Erstellt: {new Date(m.created_at).toLocaleString("de-DE")}
                                {" · "}Energieart: {m.energy_type ?? "—"} ({m.unit ?? "—"})
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {dups.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Beim Zusammenführen werden {dups.length} Duplikat(e) archiviert. Die
                        historischen Messwerte des Duplikats werden gelöscht; alle Referenzen
                        (Dashboards, Automationen, Wallboxen etc.) zeigen anschließend auf den
                        Master. Der Vorgang wird im Audit-Log protokolliert.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

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
    </div>
  );
}
