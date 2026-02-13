import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OCPP_SUBPROTOCOL = "ocpp1.6";

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
      // CALL [2, id, action, payload] -> action is index 2
      // CALLRESULT [3, id, payload] -> no action
      // CALLERROR [4, id, code, desc, details] -> code at index 2
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

Deno.serve((req) => {
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

  const { socket, response } = Deno.upgradeWebSocket(req, {
    protocol: OCPP_SUBPROTOCOL,
  });

  const ocppCentralUrl = `${supabaseUrl}/functions/v1/ocpp-central?cp=${encodeURIComponent(chargePointId)}`;
  const supabase = createSupabase();

  console.log(`[ocpp-ws-proxy] WebSocket connected: chargePointId=${chargePointId}`);

  let keepAliveTimer: number | undefined;

  socket.onopen = () => {
    console.log(`[ocpp-ws-proxy] Socket open for ${chargePointId}`);
    // Send WebSocket ping every 20s to keep the connection alive
    keepAliveTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(""); // empty frame as keep-alive
        } catch { /* ignore */ }
      }
    }, 20_000);
  };

  socket.onmessage = async (event) => {
    const rawData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);

    console.log(`[ocpp-ws-proxy] Received from ${chargePointId}: ${rawData.substring(0, 200)}`);

    // Log incoming message
    await logMessage(supabase, chargePointId, "incoming", rawData);

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

  socket.onclose = (event) => {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    console.log(`[ocpp-ws-proxy] Socket closed for ${chargePointId}: code=${event.code} reason=${event.reason}`);
  };

  socket.onerror = (error) => {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    console.error(`[ocpp-ws-proxy] Socket error for ${chargePointId}:`, error);
  };

  return response;
});
