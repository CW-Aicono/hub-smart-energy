import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import type { AutomationCondition, AutomationAction } from "@/components/locations/AutomationRuleBuilder";
import type { Json } from "@/integrations/supabase/types";

export interface MLAutomationRecord {
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
  // MLA fields
  scope_type: string;
  scope_floor_id: string | null;
  scope_room_id: string | null;
  target_location_ids: string[];
  category: string;
  color: string | null;
  estimated_savings_kwh: number | null;
  tags: string[];
  scene_id: string | null;
  notify_on_error: boolean;
  notify_email: string | null;
  // Joined
  location_name?: string;
}

export interface ExecutionLogEntry {
  id: string;
  tenant_id: string;
  automation_id: string;
  executed_at: string;
  trigger_type: string;
  status: string;
  error_message: string | null;
  actions_executed: unknown;
  duration_ms: number | null;
  automation_name?: string;
}

export interface MLAutomationStats {
  total: number;
  active: number;
  paused: number;
  totalSavingsKwh: number;
  errorCount: number;
}

export interface AutomationScene {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

interface MLFilters {
  locationId?: string;
  category?: string;
  status?: "active" | "paused" | "all";
  search?: string;
}

export function useMLAutomations() {
  const { tenant } = useTenant();
  const [automations, setAutomations] = useState<MLAutomationRecord[]>([]);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [scenes, setScenes] = useState<AutomationScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);

  const fetchAutomations = useCallback(async () => {
    if (!tenant?.id) { setAutomations([]); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("location_automations")
      .select("*, locations!location_automations_location_id_fkey(name)")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAutomations(data.map((d: any) => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions as unknown as AutomationCondition[] : [],
        actions: Array.isArray(d.actions) ? d.actions as unknown as AutomationAction[] : [],
        logic_operator: (d.logic_operator || "AND") as "AND" | "OR",
        target_location_ids: d.target_location_ids || [],
        tags: d.tags || [],
        location_name: d.locations?.name || "",
      })));
    }
    setLoading(false);
  }, [tenant?.id]);

  const fetchExecutionLog = useCallback(async (limit = 50) => {
    if (!tenant?.id) return;
    setLogLoading(true);

    const { data, error } = await supabase
      .from("automation_execution_log")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("executed_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      // Enrich with automation names
      const enriched = data.map((log: any) => {
        const auto = automations.find((a) => a.id === log.automation_id);
        return { ...log, automation_name: auto?.name || "Unbekannt" };
      });
      setExecutionLog(enriched);
    }
    setLogLoading(false);
  }, [tenant?.id, automations]);

  const fetchScenes = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from("automation_scenes")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("name");
    if (data) setScenes(data as AutomationScene[]);
  }, [tenant?.id]);

  useEffect(() => { fetchAutomations(); fetchScenes(); }, [fetchAutomations, fetchScenes]);

  // Realtime subscription for execution log
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel("mla-exec-log")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "automation_execution_log" }, () => {
        fetchExecutionLog();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, fetchExecutionLog]);

  const stats: MLAutomationStats = {
    total: automations.length,
    active: automations.filter((a) => a.is_active).length,
    paused: automations.filter((a) => !a.is_active).length,
    totalSavingsKwh: automations.reduce((sum, a) => sum + (a.estimated_savings_kwh || 0), 0),
    errorCount: executionLog.filter((l) => l.status === "error").length,
  };

  const filterAutomations = (filters: MLFilters): MLAutomationRecord[] => {
    let result = automations;
    if (filters.locationId) result = result.filter((a) => a.location_id === filters.locationId);
    if (filters.category && filters.category !== "all") result = result.filter((a) => a.category === filters.category);
    if (filters.status === "active") result = result.filter((a) => a.is_active);
    if (filters.status === "paused") result = result.filter((a) => !a.is_active);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter((a) =>
        a.name.toLowerCase().includes(s) ||
        a.description?.toLowerCase().includes(s) ||
        a.location_name?.toLowerCase().includes(s) ||
        a.tags.some((t) => t.toLowerCase().includes(s))
      );
    }
    return result;
  };

  const updateAutomation = async (id: string, updates: Record<string, any>) => {
    const { conditions, actions, tags, target_location_ids, ...rest } = updates;
    const dbUpdate: any = {
      ...rest,
      ...(conditions !== undefined ? { conditions: conditions as unknown as Json } : {}),
      ...(actions !== undefined ? { actions: actions as unknown as Json } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(target_location_ids !== undefined ? { target_location_ids } : {}),
    };
    const { error } = await supabase.from("location_automations").update(dbUpdate).eq("id", id);
    if (!error) await fetchAutomations();
    return { error };
  };

  const deleteAutomation = async (id: string) => {
    const { error } = await supabase.from("location_automations").delete().eq("id", id);
    if (!error) await fetchAutomations();
    return { error };
  };

  const executeAutomation = async (automation: MLAutomationRecord) => {
    setExecuting(automation.id);
    const startTime = Date.now();
    try {
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

      const durationMs = Date.now() - startTime;

      // Log success
      await supabase.from("automation_execution_log").insert({
        tenant_id: automation.tenant_id,
        automation_id: automation.id,
        trigger_type: "manual",
        status: "success",
        actions_executed: actionsToRun as unknown as Json,
        duration_ms: durationMs,
      });

      await supabase
        .from("location_automations")
        .update({ last_executed_at: new Date().toISOString() })
        .eq("id", automation.id);

      await fetchAutomations();
      return { success: true };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : "Fehler";

      // Log error
      await supabase.from("automation_execution_log").insert({
        tenant_id: automation.tenant_id,
        automation_id: automation.id,
        trigger_type: "manual",
        status: "error",
        error_message: errorMsg,
        duration_ms: durationMs,
      });

      return { success: false, error: errorMsg };
    } finally {
      setExecuting(null);
    }
  };

  // Scene operations
  const createScene = async (input: { name: string; description?: string; icon?: string; color?: string }) => {
    if (!tenant?.id) return { error: new Error("No tenant") };
    const { data, error } = await supabase
      .from("automation_scenes")
      .insert({ ...input, tenant_id: tenant.id })
      .select()
      .single();
    if (!error) await fetchScenes();
    return { data, error };
  };

  const deleteScene = async (id: string) => {
    const { error } = await supabase.from("automation_scenes").delete().eq("id", id);
    if (!error) await fetchScenes();
    return { error };
  };

  const executeScene = async (sceneId: string) => {
    const sceneAutomations = automations.filter((a) => a.scene_id === sceneId && a.is_active);
    const results = [];
    for (const auto of sceneAutomations) {
      results.push(await executeAutomation(auto));
    }
    return results;
  };

  return {
    automations,
    executionLog,
    scenes,
    stats,
    loading,
    logLoading,
    executing,
    refetch: fetchAutomations,
    fetchExecutionLog,
    filterAutomations,
    updateAutomation,
    deleteAutomation,
    executeAutomation,
    createScene,
    deleteScene,
    executeScene,
  };
}
