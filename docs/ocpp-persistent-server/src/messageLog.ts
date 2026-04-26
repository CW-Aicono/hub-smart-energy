import { log } from "./logger";
import { logOcppFrame } from "./backendApi";

export async function logOcppMessage(
  chargePointId: string,
  direction: "incoming" | "outgoing",
  raw: string,
) {
  try {
    await logOcppFrame(chargePointId, direction, raw);
  } catch (error) {
    log.warn("ocpp_message_log insert failed", { error: (error as Error).message, chargePointId });
  }
}
