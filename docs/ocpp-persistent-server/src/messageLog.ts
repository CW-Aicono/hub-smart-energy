import { supabase } from "./supabaseClient";
import { log } from "./logger";

export async function logOcppMessage(
  chargePointId: string,
  direction: "incoming" | "outgoing",
  raw: string,
) {
  let messageType: string | null = null;
  let parsedJson: unknown = raw;
  try {
    const parsed = JSON.parse(raw);
    parsedJson = parsed;
    if (Array.isArray(parsed)) {
      if (parsed[0] === 2) messageType = parsed[2] ?? null;
      else if (parsed[0] === 3) messageType = "CALLRESULT";
      else if (parsed[0] === 4) messageType = `CALLERROR:${parsed[2] ?? "unknown"}`;
    }
  } catch { /* keep raw */ }

  const { error } = await supabase.from("ocpp_message_log").insert({
    charge_point_id: chargePointId,
    direction,
    message_type: messageType,
    raw_message: parsedJson,
  });
  if (error) log.warn("ocpp_message_log insert failed", { error: error.message, chargePointId });
}
