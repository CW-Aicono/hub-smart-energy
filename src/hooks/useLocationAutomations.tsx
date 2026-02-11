import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import type { AutomationCondition, AutomationAction } from "@/components/locations/AutomationRuleBuilder";

export interface LocationAutomationRecord {
  id: string;
  tenant_id: string;
  location_id: string;
  location_integration_id: string;
  name: string;
  description: string | null;
  actuator_uuid: string;
  actuator_name: string;
  actuator_control_type: string;
  action_type: string;
  action_value: string | null;
  is_active: boolean;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
  // New complex fields
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  logic_operator: "AND" | "OR";
  schedule: unknown | null;
}

interface CreateAutomationInput {
  location_id: string;
  location_integration_id: string;
  name: string;
  description?: string;
  actuator_uuid: string;
  actuator_name: string;
  actuator_control_type: string;
  action_type: string;
  action_value?: string;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  logic_operator?: string;
  is_active?: boolean;
}

export function useLocationAutomations(locationId: string | undefined) {
  const { tenant } = useTenant();
  const [automations, setAutomations] = useState<LocationAutomationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);

  const fetchAutomations = useCallback(async () => {
    if (!locationId) { setAutomations([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("location_automations")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setAutomations(data.map((d: any) => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions : [],
        actions: Array.isArray(d.actions) ? d.actions : [],
        logic_operator: d.logic_operator || "AND",
      })) as LocationAutomationRecord[]);
    }
    setLoading(false);
  }, [locationId]);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  const createAutomation = async (input: CreateAutomationInput) => {
    if (!tenant?.id) return { error: new Error("Kein Mandant") };
    const { data, error } = await supabase
      .from("location_automations")
      .insert({ ...input, tenant_id: tenant.id } as any)
      .select()
      .single() as { data: any; error: any };
    if (!error) await fetchAutomations();
    return { data: data as LocationAutomationRecord | null, error };
  };

  const updateAutomation = async (id: string, updates: Partial<CreateAutomationInput & { is_active: boolean }>) => {
    const { error } = await supabase
      .from("location_automations")
      .update(updates as any)
      .eq("id", id);
    if (!error) await fetchAutomations();
    return { error };
  };

  const deleteAutomation = async (id: string) => {
    const { error } = await supabase
      .from("location_automations")
      .delete()
      .eq("id", id);
    if (!error) await fetchAutomations();
    return { error };
  };

  const executeAutomation = async (automation: LocationAutomationRecord) => {
    setExecuting(automation.id);
    try {
      // Execute all actions (multi-action support)
      const actionsToRun = automation.actions.length > 0
        ? automation.actions
        : [{ actuator_uuid: automation.actuator_uuid, action_type: automation.action_value || automation.action_type || "pulse", action_value: automation.action_value }];

      for (const action of actionsToRun) {
        const { data, error } = await supabase.functions.invoke("loxone-api", {
          body: {
            locationIntegrationId: automation.location_integration_id,
            action: "executeCommand",
            controlUuid: action.actuator_uuid,
            commandValue: action.action_value || action.action_type || "pulse",
          },
        });
        if (error || !data?.success) {
          throw new Error(data?.error || "Ausführung fehlgeschlagen");
        }
      }

      await supabase
        .from("location_automations")
        .update({ last_executed_at: new Date().toISOString() })
        .eq("id", automation.id);
      await fetchAutomations();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Fehler" };
    } finally {
      setExecuting(null);
    }
  };

  return {
    automations,
    loading,
    executing,
    refetch: fetchAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    executeAutomation,
  };
}
