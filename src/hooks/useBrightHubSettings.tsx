import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";
import { getT } from "@/i18n/getT";

export interface BrightHubSettings {
  id: string;
  tenant_id: string;
  location_id: string | null;
  api_key: string;           // masked value from server (e.g. "••••••ab12")
  webhook_secret: string;    // masked value
  webhook_url: string;
  is_enabled: boolean;
  auto_sync_readings: boolean;
  created_at: string;
  updated_at: string;
  _has_api_key?: boolean;
  _has_webhook_secret?: boolean;
  last_meter_sync_at?: string | null;
  last_reading_sync_at?: string | null;
  last_intraday_sync_at?: string | null;
}

export function useBrightHubSettings(locationId?: string) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [settings, setSettings] = useState<BrightHubSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user || !tenantId || !locationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("brighthub-crypto", {
        body: { action: "load", tenantId, locationId },
      });
      if (error) {
        console.error("BrightHub load error:", error);
        setSettings(null);
      } else {
        setSettings(data?.data as BrightHubSettings | null);
      }
    } catch (err) {
      console.error("BrightHub load error:", err);
      setSettings(null);
    }
    setLoading(false);
  }, [user, tenantId, locationId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSettings = async (values: {
    api_key: string;
    webhook_secret: string;
    webhook_url: string;
    is_enabled: boolean;
    auto_sync_readings: boolean;
  }) => {
    if (!tenantId || !locationId) return false;
    try {
      const { data, error } = await supabase.functions.invoke("brighthub-crypto", {
        body: { action: "save", tenantId, locationId, ...values },
      });
      if (error || !data?.success) {
        toast.error(getT()("brightHub.errorSave"));
        return false;
      }
      toast.success(getT()("brightHub.saved"));
      fetchSettings();
      return true;
    } catch {
      toast.error(getT()("brightHub.errorSave"));
      return false;
    }
  };

  return { settings, loading, saveSettings, refetch: fetchSettings };
}
