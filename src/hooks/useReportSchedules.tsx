import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";
import { getT } from "@/i18n/getT";

export interface ReportSchedule {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  recipients: string[];
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  format: "pdf" | "csv" | "both";
  energy_types: string[];
  location_ids: string[];
  is_active: boolean;
  last_sent_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReportScheduleInsert = Pick<
  ReportSchedule,
  "name" | "recipients" | "frequency" | "format" | "energy_types" | "location_ids"
>;

export function useReportSchedules() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    if (!user || !tenant) { setSchedules([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("report_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching report schedules:", error);
      setSchedules([]);
    } else {
      setSchedules((data ?? []) as unknown as ReportSchedule[]);
    }
    setLoading(false);
  }, [user, tenant]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const createSchedule = async (input: ReportScheduleInsert) => {
    if (!tenant || !user) return false;
    const t = getT();
    const { error } = await supabase.from("report_schedules").insert({
      ...input,
      tenant_id: tenant.id,
      created_by: user.id,
    } as any);
    if (error) { toast.error(t("reportSchedule.errorCreate")); console.error(error); return false; }
    toast.success(t("reportSchedule.created"));
    fetchSchedules();
    return true;
  };

  const updateSchedule = async (id: string, updates: Partial<ReportScheduleInsert> & { is_active?: boolean }) => {
    const t = getT();
    const { error } = await supabase.from("report_schedules").update(updates as any).eq("id", id);
    if (error) { toast.error(t("common.errorUpdate")); console.error(error); return false; }
    toast.success(t("reportSchedule.updated"));
    fetchSchedules();
    return true;
  };

  const deleteSchedule = async (id: string) => {
    const t = getT();
    const { error } = await supabase.from("report_schedules").delete().eq("id", id);
    if (error) { toast.error(t("common.errorDelete")); console.error(error); return false; }
    toast.success(t("reportSchedule.deleted"));
    fetchSchedules();
    return true;
  };

  return { schedules, loading, createSchedule, updateSchedule, deleteSchedule, refetch: fetchSchedules };
}
