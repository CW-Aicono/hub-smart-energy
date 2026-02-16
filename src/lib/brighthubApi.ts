import { supabase } from "@/integrations/supabase/client";

async function invoke(action: string, body: Record<string, unknown>, tenantId: string) {
  const { data, error } = await supabase.functions.invoke("brighthub-sync", {
    body: { action, body, tenantId },
  });
  if (error) throw new Error(error.message || "BrightHub Verbindungsfehler");
  if (!data?.success) throw new Error(data?.error || "BrightHub API Fehler");
  return data.data;
}

// ─── Meters ───────────────────────────────────────────────
export const listMeters = (tenantId: string) =>
  invoke("list_meters", {}, tenantId);

export const getMeter = (tenantId: string, id: string) =>
  invoke("get_meter", { id }, tenantId);

export const createMeter = (
  tenantId: string,
  meter: { name: string; type: string; unit: string; meter_number?: string; location_description?: string }
) => invoke("create_meter", meter, tenantId);

export const updateMeter = (tenantId: string, id: string, updates: Record<string, unknown>) =>
  invoke("update_meter", { id, ...updates }, tenantId);

export const deleteMeter = (tenantId: string, id: string) =>
  invoke("delete_meter", { id }, tenantId);

// ─── Readings ─────────────────────────────────────────────
export const listReadings = (
  tenantId: string,
  params: { meter_id?: string; from?: string; to?: string; limit?: number } = {}
) => invoke("list_readings", params, tenantId);

export const createReading = (
  tenantId: string,
  reading: { meter_id: string; reading_date: string; value: number; cost?: number; co2_kg?: number; notes?: string }
) => invoke("create_reading", reading, tenantId);

export const bulkReadings = (
  tenantId: string,
  readings: { meter_id: string; reading_date: string; value: number; cost?: number; co2_kg?: number }[]
) => invoke("bulk_readings", { readings }, tenantId);

// ─── Dashboard ────────────────────────────────────────────
export const dashboardStats = (tenantId: string, month?: number, year?: number) =>
  invoke("dashboard_stats", { ...(month && { month }), ...(year && { year }) }, tenantId);

// ─── Webhooks ─────────────────────────────────────────────
export const sendWebhookEvent = (
  tenantId: string,
  event: string,
  data: unknown
) => invoke("webhook", { event, data }, tenantId);
