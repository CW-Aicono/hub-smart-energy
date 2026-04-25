import { supabase } from "./supabaseClient";
import { log } from "./logger";

export interface ChargePointRecord {
  id: string;
  ocpp_id: string;
  tenant_id: string;
  ocpp_password: string | null;
  auth_required: boolean;
  connection_protocol: string;
}

export async function loadChargePoint(ocppId: string): Promise<ChargePointRecord | null> {
  const { data, error } = await supabase
    .from("charge_points")
    .select("id, ocpp_id, tenant_id, ocpp_password, auth_required, connection_protocol")
    .eq("ocpp_id", ocppId)
    .maybeSingle();
  if (error) {
    log.error("loadChargePoint failed", { error: error.message, ocppId });
    return null;
  }
  if (!data) return null;
  // Defaults für Bestandsdatensätze ohne neue Spalten
  return {
    id: data.id,
    ocpp_id: data.ocpp_id,
    tenant_id: data.tenant_id,
    ocpp_password: data.ocpp_password ?? null,
    auth_required: data.auth_required ?? true,
    connection_protocol: data.connection_protocol ?? "wss",
  };
}

export function checkBasicAuth(authHeader: string | undefined, expectedPassword: string): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(authHeader.substring(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const provided = idx >= 0 ? decoded.substring(idx + 1) : "";
    return provided === expectedPassword;
  } catch {
    return false;
  }
}
