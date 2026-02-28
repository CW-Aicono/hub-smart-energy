import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function createSupabase() {
  return createClient(supabaseUrl, serviceKey);
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const locationIntegrationId = pathParts[pathParts.length - 1];

  if (!locationIntegrationId || locationIntegrationId === "ha-ws-proxy") {
    return new Response(
      JSON.stringify({ error: "Missing locationIntegrationId. Use: /ha-ws-proxy/{locationIntegrationId}" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({
        info: "Home Assistant WebSocket Proxy",
        usage: `Connect via WebSocket to wss://.../ha-ws-proxy/${locationIntegrationId}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  let haSocket: WebSocket | null = null;
  let haAuthenticated = false;

  console.log(`[ha-ws-proxy] Client connected for integration: ${locationIntegrationId}`);

  clientSocket.onopen = async () => {
    console.log(`[ha-ws-proxy] Client socket open, fetching HA credentials...`);

    try {
      const supabase = createSupabase();
      const { data: li, error } = await supabase
        .from("location_integrations")
        .select("config")
        .eq("id", locationIntegrationId)
        .maybeSingle();

      if (error || !li) {
        console.error(`[ha-ws-proxy] Integration not found:`, error);
        clientSocket.send(JSON.stringify({ type: "error", message: "Integration nicht gefunden" }));
        clientSocket.close(4000, "Integration not found");
        return;
      }

      const config = li.config as { api_url?: string; access_token?: string } | null;
      if (!config?.api_url || !config?.access_token) {
        clientSocket.send(JSON.stringify({ type: "error", message: "API URL oder Token fehlt" }));
        clientSocket.close(4001, "Missing credentials");
        return;
      }

      // Build WebSocket URL from HTTP URL
      const haWsUrl = config.api_url
        .replace(/\/+$/, "")
        .replace(/^https:/, "wss:")
        .replace(/^http:/, "ws:") + "/api/websocket";

      console.log(`[ha-ws-proxy] Connecting to HA WebSocket: ${haWsUrl}`);

      haSocket = new WebSocket(haWsUrl);

      haSocket.onopen = () => {
        console.log(`[ha-ws-proxy] Connected to HA WebSocket`);
      };

      haSocket.onmessage = (event) => {
        const rawData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);

        try {
          const msg = JSON.parse(rawData);

          // Handle HA auth flow
          if (msg.type === "auth_required") {
            console.log(`[ha-ws-proxy] HA requires auth, sending token...`);
            haSocket!.send(JSON.stringify({
              type: "auth",
              access_token: config!.access_token,
            }));
            return;
          }

          if (msg.type === "auth_ok") {
            haAuthenticated = true;
            console.log(`[ha-ws-proxy] HA auth successful (version: ${msg.ha_version})`);
            // Notify the client
            if (clientSocket.readyState === WebSocket.OPEN) {
              clientSocket.send(JSON.stringify({
                type: "auth_ok",
                ha_version: msg.ha_version,
              }));
            }
            return;
          }

          if (msg.type === "auth_invalid") {
            console.error(`[ha-ws-proxy] HA auth failed: ${msg.message}`);
            if (clientSocket.readyState === WebSocket.OPEN) {
              clientSocket.send(JSON.stringify({ type: "auth_invalid", message: msg.message }));
              clientSocket.close(4002, "HA auth invalid");
            }
            return;
          }

          // Forward all other messages to client
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(rawData);
          }
        } catch {
          // Forward raw data
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(rawData);
          }
        }
      };

      haSocket.onclose = (event) => {
        console.log(`[ha-ws-proxy] HA socket closed: code=${event.code} reason=${event.reason}`);
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: "ha_disconnected", code: event.code }));
          clientSocket.close(1000, "HA disconnected");
        }
      };

      haSocket.onerror = (error) => {
        console.error(`[ha-ws-proxy] HA socket error:`, error);
      };
    } catch (err) {
      console.error(`[ha-ws-proxy] Setup error:`, err);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ type: "error", message: "Proxy-Fehler" }));
        clientSocket.close(4003, "Proxy error");
      }
    }
  };

  // Forward client messages to HA
  clientSocket.onmessage = (event) => {
    const rawData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);

    if (!haSocket || haSocket.readyState !== WebSocket.OPEN) {
      console.warn(`[ha-ws-proxy] HA socket not ready, dropping message`);
      return;
    }

    if (!haAuthenticated) {
      console.warn(`[ha-ws-proxy] HA not authenticated yet, dropping message`);
      return;
    }

    console.log(`[ha-ws-proxy] Forwarding to HA: ${rawData.substring(0, 200)}`);
    haSocket.send(rawData);
  };

  clientSocket.onclose = (event) => {
    console.log(`[ha-ws-proxy] Client disconnected: code=${event.code}`);
    if (haSocket && haSocket.readyState === WebSocket.OPEN) {
      haSocket.close(1000, "Client disconnected");
    }
  };

  clientSocket.onerror = (error) => {
    console.error(`[ha-ws-proxy] Client socket error:`, error);
    if (haSocket && haSocket.readyState === WebSocket.OPEN) {
      haSocket.close(1000, "Client error");
    }
  };

  return response;
});
