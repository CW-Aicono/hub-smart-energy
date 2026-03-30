import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import type { AutomationCondition, AutomationAction } from "@/components/locations/AutomationRuleBuilder";
import type { Database, Json } from "@/integrations/supabase/types";

type AutomationInsertDB = Database["public"]["Tables"]["location_automations"]["Insert"];
type AutomationUpdateDB = Database["public"]["Tables"]["location_automations"]["Update"];

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
      setAutomations(data.map((d) => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions as unknown as AutomationCondition[] : [],
        actions: Array.isArray(d.actions) ? d.actions as unknown as AutomationAction[] : [],
        logic_operator: (d.logic_operator || "AND") as "AND" | "OR",
      })) as LocationAutomationRecord[]);
    }
    setLoading(false);
  }, [locationId]);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  const createAutomation = async (input: CreateAutomationInput) => {
    if (!tenant?.id) return { error: new Error("Kein Mandant") };
    const dbInsert: AutomationInsertDB = {
      ...input,
      tenant_id: tenant.id,
      conditions: (input.conditions ?? []) as unknown as Json,
      actions: (input.actions ?? []) as unknown as Json,
    };
    const { data, error } = await supabase
      .from("location_automations")
      .insert(dbInsert)
      .select()
      .single();
    if (!error) await fetchAutomations();
    return { data: data as unknown as LocationAutomationRecord | null, error };
  };

  const updateAutomation = async (id: string, updates: Partial<CreateAutomationInput & { is_active: boolean }>) => {
    const { conditions, actions, ...rest } = updates;
    const dbUpdate: AutomationUpdateDB = {
      ...rest,
      ...(conditions !== undefined ? { conditions: conditions as unknown as Json } : {}),
      ...(actions !== undefined ? { actions: actions as unknown as Json } : {}),
    };
    const { error } = await supabase
      .from("location_automations")
      .update(dbUpdate)
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
      // Resolve the correct edge function for this integration
      const { data: liData } = await supabase
        .from("location_integrations")
        .select("integration:integrations(type)")
        .eq("id", automation.location_integration_id)
        .maybeSingle();
      const integrationType = (liData as any)?.integration?.type as string | undefined;
      const edgeFunction = integrationType ? getEdgeFunctionName(integrationType) : "loxone-api";

      // Valid command primitives
      const VALID_COMMANDS = new Set(["pulse", "On", "Off", "toggle", "on", "off", "resetDay", "resetMonth", "resetYear", "resetAll"]);
      const sanitizeCommand = (val?: string | null): string => {
        if (!val) return "pulse";
        if (VALID_COMMANDS.has(val)) return val;
        if (!isNaN(Number(val))) return val;
        return "pulse";
      };

      const actionsToRun = automation.actions.length > 0
        ? automation.actions
        : [{ actuator_uuid: automation.actuator_uuid, action_type: automation.action_type || "pulse", action_value: automation.action_value }];

      for (const action of actionsToRun) {
        const commandValue = sanitizeCommand(action.action_value || action.action_type);
        const { data, error } = await supabase.functions.invoke(edgeFunction, {
          body: {
            locationIntegrationId: automation.location_integration_id,
            action: "executeCommand",
            controlUuid: action.actuator_uuid,
            commandValue,
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
