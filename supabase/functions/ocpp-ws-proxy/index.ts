const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OCPP_SUBPROTOCOL = "ocpp1.6";

Deno.serve((req) => {
  // Extract charge point ID from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /ocpp-ws-proxy/{chargePointId}
  const chargePointId = pathParts[pathParts.length - 1];

  if (!chargePointId || chargePointId === "ocpp-ws-proxy") {
    return new Response(
      JSON.stringify({ error: "Missing charge point ID. Use: /ocpp-ws-proxy/{chargePointId}" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for WebSocket upgrade
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

  // Upgrade to WebSocket with OCPP subprotocol
  const { socket, response } = Deno.upgradeWebSocket(req, {
    protocol: OCPP_SUBPROTOCOL,
  });

  const ocppCentralUrl = `${supabaseUrl}/functions/v1/ocpp-central?cp=${encodeURIComponent(chargePointId)}`;

  console.log(`[ocpp-ws-proxy] WebSocket connected: chargePointId=${chargePointId}`);

  socket.onopen = () => {
    console.log(`[ocpp-ws-proxy] Socket open for ${chargePointId}`);
  };

  socket.onmessage = async (event) => {
    const rawData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);

    console.log(`[ocpp-ws-proxy] Received from ${chargePointId}: ${rawData.substring(0, 200)}`);

    try {
      // Forward message as HTTP POST to ocpp-central
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

      // Send response back via WebSocket
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(responseText);
      }
    } catch (error) {
      console.error(`[ocpp-ws-proxy] Error forwarding message for ${chargePointId}:`, error.message);

      // Send OCPP CALLERROR back
      try {
        const parsed = JSON.parse(rawData);
        const uniqueId = parsed[1] || "0";
        const errorResponse = JSON.stringify([
          4, // CALLERROR
          uniqueId,
          "InternalError",
          "Proxy failed to forward message",
          {},
        ]);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(errorResponse);
        }
      } catch {
        // Cannot parse original message, just log
        console.error(`[ocpp-ws-proxy] Could not send error response for ${chargePointId}`);
      }
    }
  };

  socket.onclose = (event) => {
    console.log(`[ocpp-ws-proxy] Socket closed for ${chargePointId}: code=${event.code} reason=${event.reason}`);
  };

  socket.onerror = (error) => {
    console.error(`[ocpp-ws-proxy] Socket error for ${chargePointId}:`, error);
  };

  return response;
});
