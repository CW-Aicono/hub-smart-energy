import { supabase } from "./supabaseClient";
import { log } from "./logger";

export interface ChargePointRecord {
  id: string;
  ocpp_id: string;
  tenant_id: string;
  ocpp_password: string | null;
}

export async function loadChargePoint(ocppId: string): Promise<ChargePointRecord | null> {
  const { data, error } = await supabase
    .from("charge_points")
    .select("id, ocpp_id, tenant_id, ocpp_password")
    .eq("ocpp_id", ocppId)
    .maybeSingle();
  if (error) {
    log.error("loadChargePoint failed", { error: error.message, ocppId });
    return null;
  }
  return data as ChargePointRecord | null;
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
