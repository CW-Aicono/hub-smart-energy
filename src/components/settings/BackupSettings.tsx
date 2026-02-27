import { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useBackups, type BackupSnapshot } from "@/hooks/useBackups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Database, Trash2, Loader2, HardDrive, Shield } from "lucide-react";
import { format } from "date-fns";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function SnapshotRow({ snapshot, onDelete }: { snapshot: BackupSnapshot; onDelete: (id: string) => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <Database className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {format(new Date(snapshot.created_at), "dd.MM.yyyy HH:mm")}
          </p>
          <p className="text-xs text-muted-foreground">
            {snapshot.tables_count} {t("backup.tables")} · {snapshot.rows_count} {t("backup.rows")} · {formatBytes(snapshot.size_bytes)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={snapshot.backup_type === "manual" ? "default" : "secondary"}>
          {snapshot.backup_type === "manual" ? t("backup.manual") : t("backup.scheduled")}
        </Badge>
        <Button variant="ghost" size="icon" onClick={() => onDelete(snapshot.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
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
    <div className="space-y-6">
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
    </div>
  );
}
