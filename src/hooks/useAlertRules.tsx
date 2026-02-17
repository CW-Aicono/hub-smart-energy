import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";
import { getT } from "@/i18n/getT";

const useTenantId = () => {
  const { tenant } = useTenant();
  return tenant?.id ?? null;
};

export interface AlertRule {
  id: string;
  tenant_id: string;
  location_id: string | null;
  meter_id: string | null;
  energy_type: string;
  threshold_value: number;
  threshold_type: string;
  threshold_unit: string;
  time_unit: string;
  notification_email: string | null;
  is_active: boolean;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleInsert {
  name: string;
  location_id?: string;
  meter_id?: string;
  energy_type: string;
  threshold_value: number;
  threshold_type: string;
  threshold_unit?: string;
  time_unit?: string;
  notification_email?: string;
  is_active?: boolean;
}

export function useAlertRules(locationId?: string) {
  const { user } = useAuth();
  const tenantId = useTenantId();
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlertRules = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase.from("alert_rules").select("*").order("name");
    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching alert rules:", error);
      setAlertRules([]);
    } else {
      setAlertRules((data ?? []) as AlertRule[]);
    }
    setLoading(false);
  }, [user, locationId]);

  useEffect(() => {
    fetchAlertRules();
  }, [fetchAlertRules]);

  const addAlertRule = async (rule: AlertRuleInsert) => {
    if (!tenantId) return;
    const t = getT();
    const { error } = await supabase.from("alert_rules").insert({
      ...rule,
      tenant_id: tenantId,
    } as any);
    if (error) {
      toast.error(t("alertRule.errorCreate"));
      console.error(error);
    } else {
      toast.success(t("alertRule.created"));
      fetchAlertRules();
    }
  };

  const updateAlertRule = async (id: string, updates: Partial<AlertRuleInsert>) => {
    const t = getT();
    const { error } = await supabase.from("alert_rules").update(updates as any).eq("id", id);
    if (error) {
      toast.error(t("alertRule.errorUpdate"));
      console.error(error);
    } else {
      toast.success(t("alertRule.updated"));
      fetchAlertRules();
    }
  };

  const deleteAlertRule = async (id: string) => {
    const t = getT();
    const { error } = await supabase.from("alert_rules").delete().eq("id", id);
    if (error) {
      toast.error(t("alertRule.errorDelete"));
      console.error(error);
    } else {
      toast.success(t("alertRule.deleted"));
      fetchAlertRules();
    }
  };

  const toggleAlertRule = async (id: string, isActive: boolean) => {
    await updateAlertRule(id, { is_active: isActive } as any);
  };

  return { alertRules, loading, addAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule, refetch: fetchAlertRules };
}
