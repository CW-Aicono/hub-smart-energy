import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OCPP_SUBPROTOCOL = "ocpp1.6";
const COMMAND_POLL_INTERVAL = 3000; // Check for pending commands every 3s
const FORWARD_MAX_ATTEMPTS = 3;
const TRANSIENT_EDGE_ERROR = /503|temporarily unavailable|SUPABASE_EDGE_RUNTIME_ERROR|BOOT_ERROR|Service is temporarily unavailable/i;

function createSupabase() {
  return createClient(supabaseUrl, serviceKey);
}

async function logMessage(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  direction: "incoming" | "outgoing",
  rawData: string
) {
  let messageType: string | null = null;
  try {
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      if (parsed[0] === 2) messageType = parsed[2] || null;
      else if (parsed[0] === 3) messageType = "CALLRESULT";
      else if (parsed[0] === 4) messageType = `CALLERROR:${parsed[2] || "unknown"}`;
    }
  } catch { /* raw_message will still be stored */ }

  try {
    await supabase.from("ocpp_message_log").insert({
      charge_point_id: chargePointId,
      direction,
      message_type: messageType,
      raw_message: (() => { try { return JSON.parse(rawData); } catch { return rawData; } })(),
    });
  } catch (e) {
    console.error(`[ocpp-ws-proxy] Failed to log message:`, e);
  }
}

function generateUniqueId(): string {
  return crypto.randomUUID().substring(0, 36);
}

function shortSession(): string {
  return crypto.randomUUID().substring(0, 8);
}

function parseOcppFrame(rawData: string): { uniqueId: string; action: string | null } {
  try {
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      return {
        uniqueId: typeof parsed[1] === "string" ? parsed[1] : "0",
        action: typeof parsed[2] === "string" ? parsed[2] : null,
      };
    }
  } catch { /* handled by fallback */ }
  return { uniqueId: "0", action: null };
}

function isOcppResponseFrame(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) && (parsed[0] === 3 || parsed[0] === 4) && typeof parsed[1] === "string";
  } catch {
    return false;
  }
}

function fallbackOcppResponse(rawData: string, reason: string): string {
  const { uniqueId, action } = parseOcppFrame(rawData);
  if (action === "Heartbeat") return JSON.stringify([3, uniqueId, { currentTime: new Date().toISOString() }]);
  if (action === "StatusNotification" || action === "MeterValues") return JSON.stringify([3, uniqueId, {}]);
  return JSON.stringify([4, uniqueId, "InternalError", reason, {}]);
}

async function forwardToOcppCentral(ocppCentralUrl: string, rawData: string) {
  let lastText = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt < FORWARD_MAX_ATTEMPTS; attempt++) {
    const httpResponse = await fetch(ocppCentralUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: rawData,
    });

    const responseText = await httpResponse.text();
    lastText = responseText;
    lastStatus = httpResponse.status;

    const transient = httpResponse.status >= 500 || TRANSIENT_EDGE_ERROR.test(responseText);
    if (httpResponse.ok && isOcppResponseFrame(responseText)) return responseText;
    if (!transient || attempt === FORWARD_MAX_ATTEMPTS - 1) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }

  console.warn(`[ocpp-ws-proxy] ocpp-central unavailable/invalid response status=${lastStatus} body=${lastText.substring(0, 200)}`);
  return fallbackOcppResponse(rawData, "OCPP backend temporarily unavailable");
}

// Log once at boot whether ws.ping() is available in this runtime
let pingProbeLogged = false;
function probePingSupport(socket: WebSocket, sessionId: string) {
  if (pingProbeLogged) return;
  pingProbeLogged = true;
  const supported = typeof (socket as any).ping === "function";
  console.log(`[ocpp-ws-proxy] [${sessionId}] ping() supported: ${supported ? "yes" : "no"}`);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const chargePointId = pathParts[pathParts.length - 1];

  if (!chargePointId || chargePointId === "ocpp-ws-proxy") {
    return new Response(
      JSON.stringify({ error: "Missing charge point ID. Use: /ocpp-ws-proxy/{chargePointId}" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({
        info: "OCPP WebSocket Proxy",
        usage: `Connect via WebSocket to wss://.../ocpp-ws-proxy/${chargePointId}`,
        subprotocol: OCPP_SUBPROTOCOL,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Optional Basic Auth: validate charge point password if configured
  const supabaseForAuth = createSupabase();
  const { data: cpRecord } = await supabaseForAuth
    .from("charge_points")
    .select("ocpp_password")
    .eq("ocpp_id", chargePointId)
    .maybeSingle();

  if (cpRecord?.ocpp_password) {
    const authHeader = req.headers.get("Authorization") || "";
    let providedPassword = "";

    if (authHeader.startsWith("Basic ")) {
      try {
        const decoded = atob(authHeader.substring(6));
        // Format: chargePointId:password
        const colonIdx = decoded.indexOf(":");
        providedPassword = colonIdx >= 0 ? decoded.substring(colonIdx + 1) : "";
      } catch { /* invalid base64 */ }
    }

    if (providedPassword !== cpRecord.ocpp_password) {
      console.warn(`[ocpp-ws-proxy] Auth failed for ${chargePointId}: invalid password`);
      return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Basic realm=\"OCPP\"" } });
    }
    console.log(`[ocpp-ws-proxy] Auth OK for ${chargePointId}`);
  }

  const { socket, response } = Deno.upgradeWebSocket(req, {
    protocol: OCPP_SUBPROTOCOL,
    idleTimeout: 240, // seconds; default 120 is too tight for chargers like Bender/Nidec
  });

  const ocppCentralUrl = `${supabaseUrl}/functions/v1/ocpp-central?cp=${encodeURIComponent(chargePointId)}`;
  const supabase = createSupabase();
  let commandPollTimer: number | undefined;
  let pingTimer: number | undefined;

  // Listen for pong frames (verification of keep-alive)
  try {
    (socket as any).addEventListener?.("pong", () => {
      console.log(`[ocpp-ws-proxy] Pong received from ${chargePointId}`);
    });
  } catch { /* not supported in all runtimes */ }

  // Track pending CALL responses from charger (for remote commands)
  const pendingCalls = new Map<string, { commandId: string; resolve: (data: unknown) => void }>();

  const sessionId = shortSession();
  let lastIncomingAt: string | null = null;
  let lastIncomingFrame: string | null = null;
  let lastOutgoingAt: string | null = null;
  let lastOutgoingFrame: string | null = null;
  const openedAt = new Date().toISOString();

  console.log(`[ocpp-ws-proxy] [${sessionId}] WebSocket connected: chargePointId=${chargePointId} openedAt=${openedAt}`);

  // Poll for pending commands and send them via WebSocket
  async function pollPendingCommands() {
    if (socket.readyState !== WebSocket.OPEN) return;

    try {
      // Also pick up scheduled commands whose time has arrived
      const { data: commands } = await supabase
        .from("pending_ocpp_commands")
        .select("*")
        .eq("charge_point_ocpp_id", chargePointId)
        .in("status", ["pending", "scheduled"])
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order("created_at", { ascending: true })
        .limit(5);

      if (!commands || commands.length === 0) return;

      for (const cmd of commands) {
        const uniqueId = generateUniqueId();
        let ocppCall: unknown[];

        switch (cmd.command) {
          case "RemoteStartTransaction":
            ocppCall = [2, uniqueId, "RemoteStartTransaction", {
              connectorId: cmd.payload.connectorId || 1,
              idTag: cmd.payload.idTag || "APP_USER",
            }];
            break;
          case "RemoteStopTransaction":
            ocppCall = [2, uniqueId, "RemoteStopTransaction", {
              transactionId: cmd.payload.transactionId,
            }];
            break;
          case "Reset":
            ocppCall = [2, uniqueId, "Reset", {
              type: cmd.payload.type || "Soft",
            }];
            break;
          default:
            console.log(`[ocpp-ws-proxy] Unknown command: ${cmd.command}`);
            await supabase
              .from("pending_ocpp_commands")
              .update({ status: "rejected", processed_at: new Date().toISOString(), result: { error: "Unknown command" } })
              .eq("id", cmd.id);
            continue;
        }

        const callStr = JSON.stringify(ocppCall);
        console.log(`[ocpp-ws-proxy] Sending command to ${chargePointId}: ${callStr}`);

        // Log outgoing command
        await logMessage(supabase, chargePointId, "outgoing", callStr);

        // Mark as sent
        await supabase
          .from("pending_ocpp_commands")
          .update({ status: "sent", processed_at: new Date().toISOString() })
          .eq("id", cmd.id);

        // Track for response
        pendingCalls.set(uniqueId, {
          commandId: cmd.id,
          resolve: async (result: unknown) => {
            await supabase
              .from("pending_ocpp_commands")
              .update({ status: "completed", result: result as Record<string, unknown> })
              .eq("id", cmd.id);
          },
        });

        socket.send(callStr);
      }
    } catch (e) {
      console.error(`[ocpp-ws-proxy] Error polling commands:`, e);
    }
  }

  socket.onopen = async () => {
    console.log(`[ocpp-ws-proxy] [${sessionId}] Socket open for ${chargePointId}`);
    probePingSupport(socket, sessionId);
    await supabase
      .from("charge_points")
      .update({ ws_connected: true, ws_connected_since: new Date().toISOString() } as any)
      .eq("ocpp_id", chargePointId);
    commandPollTimer = setInterval(pollPendingCommands, COMMAND_POLL_INTERVAL);
    pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          (socket as any).ping?.();
        } catch (e) {
          console.warn(`[ocpp-ws-proxy] [${sessionId}] ping() failed for ${chargePointId}:`, (e as Error).message);
        }
      }
    }, 25_000);
  };

  socket.onmessage = async (event) => {
    const rawData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
    lastIncomingAt = new Date().toISOString();
    lastIncomingFrame = rawData.substring(0, 500);

    console.log(`[ocpp-ws-proxy] [${sessionId}] Received from ${chargePointId}: ${rawData.substring(0, 200)}`);

    await logMessage(supabase, chargePointId, "incoming", rawData);

    // Check if this is a CALLRESULT/CALLERROR for one of our remote commands
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed) && (parsed[0] === 3 || parsed[0] === 4)) {
        const uniqueId = parsed[1] as string;
        const pending = pendingCalls.get(uniqueId);
        if (pending) {
          pendingCalls.delete(uniqueId);
          const resultPayload = parsed[0] === 3
            ? { status: "Accepted", payload: parsed[2] }
            : { status: "Rejected", errorCode: parsed[2], errorDescription: parsed[3] };
          console.log(`[ocpp-ws-proxy] Command response for ${chargePointId}: ${JSON.stringify(resultPayload)}`);
          await pending.resolve(resultPayload);
          return; // Don't forward to ocpp-central, this was our own command
        }
      }
    } catch { /* not JSON, continue normal flow */ }

    try {
      const httpResponse = await fetch(ocppCentralUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: rawData,
      });

      const responseText = await httpResponse.text();
      lastOutgoingAt = new Date().toISOString();
      lastOutgoingFrame = responseText.substring(0, 500);

      console.log(`[ocpp-ws-proxy] [${sessionId}] Response for ${chargePointId}: ${responseText.substring(0, 200)}`);

      await logMessage(supabase, chargePointId, "outgoing", responseText);

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(responseText);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ocpp-ws-proxy] Error forwarding message for ${chargePointId}:`, errorMessage);

      try {
        const parsed = JSON.parse(rawData);
        const uniqueId = parsed[1] || "0";
        const errorResponse = JSON.stringify([
          4,
          uniqueId,
          "InternalError",
          "Proxy failed to forward message",
          {},
        ]);

        await logMessage(supabase, chargePointId, "outgoing", errorResponse);

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(errorResponse);
        }
      } catch {
        console.error(`[ocpp-ws-proxy] Could not send error response for ${chargePointId}`);
      }
    }
  };

  socket.onclose = async (event) => {
    const closedAt = new Date().toISOString();
    console.log(`[ocpp-ws-proxy] [${sessionId}] Socket closed for ${chargePointId}: code=${event.code} reason="${event.reason}" wasClean=${event.wasClean} openedAt=${openedAt} closedAt=${closedAt} lastIncomingAt=${lastIncomingAt} lastOutgoingAt=${lastOutgoingAt} lastIncomingFrame=${lastIncomingFrame} lastOutgoingFrame=${lastOutgoingFrame}`);
    if (commandPollTimer) { clearInterval(commandPollTimer); commandPollTimer = undefined; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = undefined; }
    pendingCalls.clear();
    await supabase
      .from("charge_points")
      .update({ ws_connected: false, ws_connected_since: null } as any)
      .eq("ocpp_id", chargePointId);
  };

  socket.onerror = (error) => {
    console.error(`[ocpp-ws-proxy] [${sessionId}] Socket error for ${chargePointId}:`, error);
    if (commandPollTimer) { clearInterval(commandPollTimer); commandPollTimer = undefined; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = undefined; }
  };

  return response;
});
