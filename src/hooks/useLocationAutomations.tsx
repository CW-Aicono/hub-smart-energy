import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

export interface AutomationLastError {
  automation_id: string;
  error_message: string | null;
  executed_at: string;
  status: string;
  trigger_type: string;
}

export function useLocationAutomations(locationId: string | undefined) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [automations, setAutomations] = useState<LocationAutomationRecord[]>([]);
  const [lastErrors, setLastErrors] = useState<Record<string, AutomationLastError>>({});
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
      const mapped = data.map((d) => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions as unknown as AutomationCondition[] : [],
        actions: Array.isArray(d.actions) ? d.actions as unknown as AutomationAction[] : [],
        logic_operator: (d.logic_operator || "AND") as "AND" | "OR",
      })) as LocationAutomationRecord[];
      setAutomations(mapped);

      // Fetch last execution log entry per automation (most recent, regardless of status)
      const autoIds = mapped.map((a) => a.id);
      if (autoIds.length > 0) {
        const { data: logs } = await supabase
          .from("automation_execution_log")
          .select("automation_id, error_message, executed_at, status, trigger_type")
          .in("automation_id", autoIds)
          .order("executed_at", { ascending: false });
        if (logs) {
          const errorMap: Record<string, AutomationLastError> = {};
          for (const log of logs) {
            // Keep only the most recent entry per automation
            if (!errorMap[log.automation_id]) {
              errorMap[log.automation_id] = log;
            }
          }
          setLastErrors(errorMap);
        }
      }
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

  const duplicateAutomation = async (automation: LocationAutomationRecord) => {
    if (!tenant?.id) return { error: new Error("Kein Mandant") };
    const dbInsert: AutomationInsertDB = {
      tenant_id: tenant.id,
      location_id: automation.location_id,
      location_integration_id: automation.location_integration_id,
      name: `${automation.name} (Kopie)`,
      description: automation.description,
      actuator_uuid: automation.actuator_uuid,
      actuator_name: automation.actuator_name,
      actuator_control_type: automation.actuator_control_type,
      action_type: automation.action_type,
      action_value: automation.action_value,
      conditions: (automation.conditions ?? []) as unknown as Json,
      actions: (automation.actions ?? []) as unknown as Json,
      logic_operator: automation.logic_operator,
      is_active: false,
    };
    const { data, error } = await supabase
      .from("location_automations")
      .insert(dbInsert)
      .select()
      .single();
    if (!error) await fetchAutomations();
    return { data: data as unknown as LocationAutomationRecord | null, error };
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

        let body: Record<string, unknown>;
        if (integrationType === "aicono_gateway") {
          const entityId = action.actuator_uuid;
          const domain = entityId.split(".")[0];
          const cmd = commandValue.toLowerCase();
          let service = "toggle";
          if (cmd === "on") service = "turn_on";
          else if (cmd === "off") service = "turn_off";
          else if (cmd === "toggle") service = "toggle";
          else if (cmd === "pulse") service = "toggle";
          else if (domain === "cover") {
            if (cmd === "open") service = "open_cover";
            else if (cmd === "close") service = "close_cover";
            else if (cmd === "stop") service = "stop_cover";
            else service = "toggle";
          }
          body = {
            locationIntegrationId: automation.location_integration_id,
            action: "executeCommand",
            domain,
            service,
            entity_id: entityId,
          };
        } else {
          body = {
            locationIntegrationId: automation.location_integration_id,
            action: "executeCommand",
            controlUuid: action.actuator_uuid,
            commandValue,
          };
        }

        const { data, error } = await supabase.functions.invoke(edgeFunction, { body });
        if (error || !data?.success) {
          throw new Error(data?.error || "Ausführung fehlgeschlagen");
        }
      }

      await supabase
        .from("location_automations")
        .update({ last_executed_at: new Date().toISOString() })
        .eq("id", automation.id);
      await fetchAutomations();
      // Refresh live sensor states after command execution (with small delay for HA to update)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["gateway-sensors"] });
      }, 1500);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Fehler" };
    } finally {
      setExecuting(null);
    }
  };

  return {
    automations,
    lastErrors,
    loading,
    executing,
    refetch: fetchAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    duplicateAutomation,
    executeAutomation,
  };
}
