import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

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
    if (!error && data) setAutomations(data as LocationAutomationRecord[]);
    setLoading(false);
  }, [locationId]);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  const createAutomation = async (input: CreateAutomationInput) => {
    if (!tenant?.id) return { error: new Error("Kein Mandant") };
    const { data, error } = await supabase
      .from("location_automations")
      .insert({ ...input, tenant_id: tenant.id })
      .select()
      .single();
    if (!error) await fetchAutomations();
    return { data: data as LocationAutomationRecord | null, error };
  };

  const updateAutomation = async (id: string, updates: Partial<CreateAutomationInput & { is_active: boolean }>) => {
    const { error } = await supabase
      .from("location_automations")
      .update(updates)
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
      const { data, error } = await supabase.functions.invoke("loxone-api", {
        body: {
          locationIntegrationId: automation.location_integration_id,
          action: "executeCommand",
          controlUuid: automation.actuator_uuid,
          commandValue: automation.action_value || "pulse",
        },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || "Ausführung fehlgeschlagen");
      }
      // Update last_executed_at
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
