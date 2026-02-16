import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";

export interface BrightHubSettings {
  id: string;
  tenant_id: string;
  api_key: string;
  webhook_secret: string;
  is_enabled: boolean;
  auto_sync_readings: boolean;
  created_at: string;
  updated_at: string;
}

export function useBrightHubSettings() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [settings, setSettings] = useState<BrightHubSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user || !tenantId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("brighthub_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) console.error("BrightHub settings error:", error);
    setSettings(data as BrightHubSettings | null);
    setLoading(false);
  }, [user, tenantId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSettings = async (values: {
    api_key: string;
    webhook_secret: string;
    is_enabled: boolean;
    auto_sync_readings: boolean;
  }) => {
    if (!tenantId) return;
    if (settings) {
      const { error } = await supabase
        .from("brighthub_settings")
        .update(values as any)
        .eq("id", settings.id);
      if (error) { toast.error("Einstellungen konnten nicht gespeichert werden"); return false; }
    } else {
      const { error } = await supabase
        .from("brighthub_settings")
        .insert({ ...values, tenant_id: tenantId } as any);
      if (error) { toast.error("Einstellungen konnten nicht gespeichert werden"); return false; }
    }
    toast.success("BrightHub-Einstellungen gespeichert");
    fetchSettings();
    return true;
  };

  return { settings, loading, saveSettings, refetch: fetchSettings };
}
