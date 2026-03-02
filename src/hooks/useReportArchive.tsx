import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface ReportArchiveEntry {
  id: string;
  tenant_id: string;
  report_year: number;
  title: string;
  location_ids: string[];
  generated_at: string;
  generated_by: string | null;
  report_config: Record<string, unknown> | null;
  pdf_storage_path: string | null;
  created_at: string;
}

export function useReportArchive() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["energy_report_archive", tenant?.id];

  const { data: reports = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("energy_report_archive")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportArchiveEntry[];
    },
    enabled: !!tenant,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveReport = async (opts: {
    reportYear: number;
    title: string;
    locationIds: string[];
    htmlContent: string;
    reportConfig?: Record<string, unknown>;
  }) => {
    if (!tenant || !user) return;

    // Upload HTML to storage
    const filename = `reports/${tenant.id}/${opts.reportYear}_${Date.now()}.html`;
    const blob = new Blob([opts.htmlContent], { type: "text/html" });
    const { error: uploadErr } = await supabase.storage
      .from("tenant-assets")
      .upload(filename, blob, { contentType: "text/html", upsert: false });

    if (uploadErr) {
      toast.error("Fehler beim Hochladen des Berichts");
      console.error(uploadErr);
      return;
    }

    const { error } = await supabase.from("energy_report_archive").insert({
      tenant_id: tenant.id,
      report_year: opts.reportYear,
      title: opts.title,
      location_ids: opts.locationIds,
      generated_by: user.id,
      report_config: opts.reportConfig || null,
      pdf_storage_path: filename,
    } as any);

    if (error) {
      toast.error("Fehler beim Archivieren");
      console.error(error);
    } else {
      toast.success("Bericht archiviert");
      invalidate();
    }
  };

  const deleteReport = async (id: string, storagePath?: string | null) => {
    if (storagePath) {
      await supabase.storage.from("tenant-assets").remove([storagePath]);
    }
    const { error } = await supabase.from("energy_report_archive").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); console.error(error); }
    else { toast.success("Bericht gelöscht"); invalidate(); }
  };

  const getDownloadUrl = async (storagePath: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("tenant-assets").createSignedUrl(storagePath, 3600);
    return data?.signedUrl || null;
  };

  return { reports, loading: isLoading, saveReport, deleteReport, getDownloadUrl };
}
