import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useToast } from "./use-toast";
import { useTranslation } from "./useTranslation";

export interface BackupSnapshot {
  id: string;
  created_at: string;
  created_by: string | null;
  backup_type: string;
  status: string;
  tables_count: number;
  rows_count: number;
  size_bytes: number;
  expires_at: string;
  error_message: string | null;
}

export function useBackups() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);

  const invoke = useCallback(async (action: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("tenant-backup", {
      body: { action },
    });

    if (res.error) throw new Error(res.error.message);
    return res.data;
  }, []);

  const fetchSnapshots = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const data = await invoke("list");
      setSnapshots(data.snapshots || []);
    } catch (err: any) {
      console.error("Failed to fetch snapshots:", err);
      toast({ title: t("backup.errorLoading"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tenant, invoke, toast, t]);

  const createSnapshot = useCallback(async () => {
    setCreating(true);
    try {
      const data = await invoke("snapshot");
      toast({
        title: t("backup.snapshotCreated"),
        description: `${data.tables_count} ${t("backup.tables")}, ${data.rows_count} ${t("backup.rows")}`,
      });
      await fetchSnapshots();
    } catch (err: any) {
      toast({ title: t("backup.errorCreating"), description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [invoke, fetchSnapshots, toast, t]);

  const exportBackup = useCallback(async () => {
    setExporting(true);
    try {
      const data = await invoke("export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${tenant?.slug || "tenant"}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("backup.exportSuccess") });
    } catch (err: any) {
      toast({ title: t("backup.errorExporting"), description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [invoke, tenant, toast, t]);

  const deleteSnapshot = useCallback(async (snapshotId: string) => {
    try {
      await supabase.from("backup_snapshots").delete().eq("id", snapshotId);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
      toast({ title: t("backup.deleted") });
    } catch (err: any) {
      toast({ title: t("backup.errorDeleting"), variant: "destructive" });
    }
  }, [toast, t]);

  return {
    snapshots,
    loading,
    exporting,
    creating,
    fetchSnapshots,
    createSnapshot,
    exportBackup,
    deleteSnapshot,
  };
}
