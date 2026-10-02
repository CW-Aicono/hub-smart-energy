import { authenticateChargePoint } from "./backendApi";

export interface ChargePointRecord {
  id: string;
  ocpp_id: string;
  tenant_id: string;
  auth_required: boolean;
  connection_protocol: string;
}

export async function loadChargePoint(
  ocppId: string,
  authorization?: string,
): Promise<{ chargePoint: ChargePointRecord | null; statusCode: number; message: string; authSkipped?: boolean }> {
  const result = await authenticateChargePoint(ocppId, authorization);
  return {
    chargePoint: result.authorized ? result.chargePoint ?? null : null,
    statusCode: result.statusCode,
    message: result.message,
    authSkipped: result.authSkipped,
  };
}
