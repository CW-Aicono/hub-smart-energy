import { supabase } from "@/integrations/supabase/client";

async function invoke(action: string, tenantId: string, locationId: string) {
  const { data, error } = await supabase.functions.invoke("brighthub-sync", {
    body: { action, tenantId, locationId },
  });
  if (error) throw new Error(error.message || "BrightHub Verbindungsfehler");
  if (!data?.success) throw new Error(data?.error || "BrightHub API Fehler");
  return data.data;
}

/** Sync all meters for a location to BrightHub (sync_meters action) */
export const syncMeters = (tenantId: string, locationId: string) =>
  invoke("sync_meters", tenantId, locationId);

/** Sync new readings for a location to BrightHub (bulk_readings action) */
export const syncReadings = (tenantId: string, locationId: string) =>
  invoke("sync_readings", tenantId, locationId);

/** Sync intraday power readings (kW) to BrightHub (bulk_intraday action) */
export const syncIntraday = (tenantId: string, locationId: string) =>
  invoke("sync_intraday", tenantId, locationId);
