import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OCPP_SUBPROTOCOL = "ocpp1.6";
const COMMAND_POLL_INTERVAL = 3000; // Check for pending commands every 3s

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

  console.log(`[ocpp-ws-proxy] WebSocket connected: chargePointId=${chargePointId}`);

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
    console.log(`[ocpp-ws-proxy] Socket open for ${chargePointId}`);
    // Mark charge point as WS-connected
    await supabase
      .from("charge_points")
      .update({ ws_connected: true, ws_connected_since: new Date().toISOString() } as any)
      .eq("ocpp_id", chargePointId);
    // Start polling for pending commands
    commandPollTimer = setInterval(pollPendingCommands, COMMAND_POLL_INTERVAL);
    // Server-side keep-alive: send WebSocket ping every 25s to prevent idle timeouts
    // and satisfy chargers (e.g. Bender, Nidec) that expect periodic pongs.
    pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          (socket as any).ping?.();
        } catch (e) {
          console.warn(`[ocpp-ws-proxy] ping() failed for ${chargePointId}:`, (e as Error).message);
        }
      }
    }, 25_000);
  };

  socket.onmessage = async (event) => {
    const rawData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);

    console.log(`[ocpp-ws-proxy] Received from ${chargePointId}: ${rawData.substring(0, 200)}`);

    // Log incoming message
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

      console.log(`[ocpp-ws-proxy] Response for ${chargePointId}: ${responseText.substring(0, 200)}`);

      // Log outgoing message
      await logMessage(supabase, chargePointId, "outgoing", responseText);

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(responseText);
      }
    } catch (error) {
      console.error(`[ocpp-ws-proxy] Error forwarding message for ${chargePointId}:`, error.message);

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
    console.log(`[ocpp-ws-proxy] Socket closed for ${chargePointId}: code=${event.code} reason=${event.reason}`);
    if (commandPollTimer) clearInterval(commandPollTimer);
    // Mark charge point as WS-disconnected
    await supabase
      .from("charge_points")
      .update({ ws_connected: false, ws_connected_since: null } as any)
      .eq("ocpp_id", chargePointId);
  };

  socket.onerror = (error) => {
    console.error(`[ocpp-ws-proxy] Socket error for ${chargePointId}:`, error);
    if (commandPollTimer) clearInterval(commandPollTimer);
  };

  return response;
});
