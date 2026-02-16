import { supabase } from "@/integrations/supabase/client";

async function invoke(action: string, body: Record<string, unknown>, tenantId: string, locationId: string) {
  const { data, error } = await supabase.functions.invoke("brighthub-sync", {
    body: { action, body, tenantId, locationId },
  });
  if (error) throw new Error(error.message || "BrightHub Verbindungsfehler");
  if (!data?.success) throw new Error(data?.error || "BrightHub API Fehler");
  return data.data;
}

// ─── Meters ───────────────────────────────────────────────
export const listMeters = (tenantId: string, locationId: string) =>
  invoke("list_meters", {}, tenantId, locationId);

export const getMeter = (tenantId: string, locationId: string, id: string) =>
  invoke("get_meter", { id }, tenantId, locationId);

export const createMeter = (
  tenantId: string,
  locationId: string,
  meter: { name: string; type: string; unit: string; meter_number?: string; location_description?: string }
) => invoke("create_meter", meter, tenantId, locationId);

export const updateMeter = (tenantId: string, locationId: string, id: string, updates: Record<string, unknown>) =>
  invoke("update_meter", { id, ...updates }, tenantId, locationId);

export const deleteMeter = (tenantId: string, locationId: string, id: string) =>
  invoke("delete_meter", { id }, tenantId, locationId);

// ─── Readings ─────────────────────────────────────────────
export const listReadings = (
  tenantId: string,
  locationId: string,
  params: { meter_id?: string; from?: string; to?: string; limit?: number } = {}
) => invoke("list_readings", params, tenantId, locationId);

export const createReading = (
  tenantId: string,
  locationId: string,
  reading: { meter_id: string; reading_date: string; value: number; cost?: number; co2_kg?: number; notes?: string }
) => invoke("create_reading", reading, tenantId, locationId);

export const bulkReadings = (
  tenantId: string,
  locationId: string,
  readings: { meter_id: string; reading_date: string; value: number; cost?: number; co2_kg?: number }[]
) => invoke("bulk_readings", { readings }, tenantId, locationId);

// ─── Dashboard ────────────────────────────────────────────
export const dashboardStats = (tenantId: string, locationId: string, month?: number, year?: number) =>
  invoke("dashboard_stats", { ...(month && { month }), ...(year && { year }) }, tenantId, locationId);

// ─── Webhooks ─────────────────────────────────────────────
export const sendWebhookEvent = (
  tenantId: string,
  locationId: string,
  event: string,
  data: unknown
) => invoke("webhook", { event, data }, tenantId, locationId);
