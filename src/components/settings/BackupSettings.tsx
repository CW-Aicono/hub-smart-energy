import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useBackups, type BackupSnapshot } from "@/hooks/useBackups";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Database, Trash2, Loader2, HardDrive, Shield, Router } from "lucide-react";
import { format } from "date-fns";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1)).toLocaleString("de-DE")} ${sizes[i]}`;
}

function SnapshotRow({ snapshot, onDelete }: { snapshot: BackupSnapshot; onDelete: (id: string) => void }) {
  const { t } = useTranslation();
  const typeLabel =
    snapshot.backup_type === "manual" ? t("backup.manual")
    : snapshot.backup_type === "scheduled" ? "Automatisch"
    : snapshot.backup_type === "pre-restore" ? "Vor Wiederherstellung"
    : snapshot.backup_type;

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <Database className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {format(new Date(snapshot.created_at), "dd.MM.yyyy HH:mm")}
          </p>
          <p className="text-xs text-muted-foreground">
            {snapshot.tables_count.toLocaleString("de-DE")} {t("backup.tables")} ·{" "}
            {snapshot.rows_count.toLocaleString("de-DE")} {t("backup.rows")} ·{" "}
            {formatBytes(snapshot.size_bytes)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={snapshot.backup_type === "manual" ? "default" : "secondary"}>{typeLabel}</Badge>
        <Button variant="ghost" size="icon" onClick={() => onDelete(snapshot.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

type GatewayDump = {
  id: string;
  created_at: string;
  size_bytes: number;
  device_name: string | null;
  expires_at: string;
};

function GatewayDumpsCard() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [dumps, setDumps] = useState<GatewayDump[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("tenant-backup", {
        body: { action: "list-gateway-dumps" },
      });
      if (res.error) throw new Error(res.error.message);
      setDumps(res.data?.snapshots || []);
    } catch (err: any) {
      console.error("Failed to load gateway dumps:", err);
      toast({ title: "Fehler beim Laden der Gateway-Dumps", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tenant, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("backup_snapshots").delete().eq("id", id);
      if (error) throw error;
      setDumps((prev) => prev.filter((d) => d.id !== id));
      toast({ title: "Eintrag gelöscht" });
    } catch (err: any) {
      toast({ title: "Fehler beim Löschen", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Router className="h-5 w-5" />
          Gateway-Statusdumps
        </CardTitle>
        <CardDescription>
          Diese Einträge werden vom lokalen Gateway (Home Assistant Add-on) hochgeladen und enthalten
          nur den aktuellen Status des Gateways – <strong>keine</strong> Mandanten- oder Messdaten.
          Sie sind nur für den Support relevant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dumps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Keine Gateway-Dumps vorhanden.</p>
        ) : (
          <div>
            {dumps.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Router className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {format(new Date(d.created_at), "dd.MM.yyyy HH:mm")}
                      {d.device_name ? ` · ${d.device_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatBytes(d.size_bytes)}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BackupSettings() {
  const { t } = useTranslation();
  const {
    snapshots, loading, exporting, creating,
    fetchSnapshots, createSnapshot, exportBackup, deleteSnapshot,
  } = useBackups();

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  return (
    <Tabs defaultValue="tenant" className="space-y-4">
      <TabsList>
        <TabsTrigger value="tenant" className="gap-2">
          <HardDrive className="h-4 w-4" />
          Mandanten-Sicherungen
        </TabsTrigger>
        <TabsTrigger value="gateway" className="gap-2">
          <Router className="h-4 w-4" />
          Gateway-Statusdumps
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tenant" className="space-y-6">
        {/* Manual Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5" />
              {t("backup.manualBackup")}
            </CardTitle>
            <CardDescription>{t("backup.manualDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={createSnapshot} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
              {t("backup.createSnapshot")}
            </Button>
            <Button variant="outline" onClick={exportBackup} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              {t("backup.downloadJson")}
            </Button>
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              {t("backup.retentionTitle")}
            </CardTitle>
            <CardDescription>{t("backup.retentionDescription")}</CardDescription>
          </CardHeader>
        </Card>

        {/* Snapshot list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("backup.existingSnapshots")}</CardTitle>
            <CardDescription>{t("backup.existingDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("backup.noSnapshots")}</p>
            ) : (
              <div>
                {snapshots.map((s) => (
                  <SnapshotRow key={s.id} snapshot={s} onDelete={deleteSnapshot} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="gateway">
        <GatewayDumpsCard />
      </TabsContent>
    </Tabs>
  );
}
