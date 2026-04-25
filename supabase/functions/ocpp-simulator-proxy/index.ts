// OCPP-Simulator-Proxy
// Browser ↔ this Edge Function ↔ wss://<target>/<ocppId>
// - Validates the user's JWT and super_admin role
// - Looks up ocpp_password from charge_points table
// - Sets Authorization: Basic header on the upstream WebSocket
// - Forwards all OCPP frames bidirectionally 1:1
//
// URL format (client connects via WebSocket):
//   wss://<project-ref>.functions.supabase.co/ocpp-simulator-proxy
//     ?target=<encoded wss-or-ws url, no path>
//     &cp=<ocppId>
//     &access_token=<user JWT>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const OCPP_SUBPROTOCOL = "ocpp1.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const upgradeHeader = req.headers.get("upgrade") || "";

  // Health / info endpoint (HTTP)
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({
        info: "OCPP Simulator Proxy",
        usage:
          "Connect via WebSocket with ?target=<wss-host>&cp=<ocppId>&access_token=<jwt>",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Parameters
  const target = url.searchParams.get("target") || "";
  const cpId = url.searchParams.get("cp") || "";
  const token =
    url.searchParams.get("access_token") ||
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!target || !cpId) {
    return new Response("Missing target or cp parameter", {
      status: 400,
      headers: corsHeaders,
    });
  }
  if (!/^wss?:\/\//i.test(target)) {
    return new Response("target must start with ws:// or wss://", {
      status: 400,
      headers: corsHeaders,
    });
  }
  if (!token) {
    return new Response("Missing access_token", {
      status: 401,
      headers: corsHeaders,
    });
  }

  // 1) Verify user via JWT
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  const userId = claims.claims.sub as string;

  // 2) Check super_admin role using service role (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response("Forbidden: super_admin only", {
      status: 403,
      headers: corsHeaders,
    });
  }

  // 3) Load charge point + password
  const { data: cp, error: cpErr } = await adminClient
    .from("charge_points")
    .select("ocpp_id, ocpp_password")
    .eq("ocpp_id", cpId)
    .maybeSingle();
  if (cpErr || !cp) {
    return new Response(`Unknown charge point: ${cpId}`, {
      status: 404,
      headers: corsHeaders,
    });
  }

  // 4) Build upstream URL & auth header
  const upstreamBase = target.replace(/\/+$/, "");
  const upstreamUrl = `${upstreamBase}/${encodeURIComponent(cpId)}`;
  const upstreamHeaders: Record<string, string> = {};
  if (cp.ocpp_password) {
    const basic = btoa(`${cpId}:${cp.ocpp_password}`);
    upstreamHeaders["Authorization"] = `Basic ${basic}`;
  }

  // 5) Upgrade browser side
  const { socket: clientWs, response } = Deno.upgradeWebSocket(req, {
    protocol: OCPP_SUBPROTOCOL,
    idleTimeout: 240,
  });

  const sessionId = shortId();
  console.log(
    `[ocpp-sim-proxy] [${sessionId}] open cp=${cpId} target=${upstreamBase} hasPw=${!!cp.ocpp_password}`
  );

  // 6) Connect upstream WebSocket. Deno's WebSocket constructor doesn't allow
  // custom headers, so use fetch() upgrade pattern via Deno.upgradeWebSocket?
  // No — instead use the standard WebSocket but rely on URL credentials for
  // Basic auth (most servers including ours accept "wss://user:pass@host/path").
  let upstreamUrlWithAuth = upstreamUrl;
  if (cp.ocpp_password) {
    const u = new URL(upstreamUrl);
    u.username = encodeURIComponent(cpId);
    u.password = encodeURIComponent(cp.ocpp_password);
    upstreamUrlWithAuth = u.toString();
  }

  let upstream: WebSocket;
  try {
    upstream = new WebSocket(upstreamUrlWithAuth, [OCPP_SUBPROTOCOL]);
  } catch (e) {
    console.error(`[ocpp-sim-proxy] [${sessionId}] upstream ctor failed:`, e);
    try {
      clientWs.close(1011, "Upstream connection failed");
    } catch { /* ignore */ }
    return response;
  }

  let upstreamOpen = false;
  const queuedFromClient: (string | ArrayBuffer | Blob)[] = [];

  upstream.onopen = () => {
    upstreamOpen = true;
    console.log(`[ocpp-sim-proxy] [${sessionId}] upstream open`);
    for (const m of queuedFromClient) {
      try { upstream.send(m as any); } catch { /* ignore */ }
    }
    queuedFromClient.length = 0;
  };

  upstream.onmessage = (ev) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(ev.data);
    }
  };

  upstream.onclose = (ev) => {
    console.log(
      `[ocpp-sim-proxy] [${sessionId}] upstream closed code=${ev.code} reason="${ev.reason}"`
    );
    try {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(ev.code === 1006 ? 1011 : ev.code, ev.reason || "Upstream closed");
      }
    } catch { /* ignore */ }
  };

  upstream.onerror = (e) => {
    console.error(`[ocpp-sim-proxy] [${sessionId}] upstream error`, e);
  };

  clientWs.onmessage = (ev) => {
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
      upstream.send(ev.data);
    } else {
      queuedFromClient.push(ev.data);
    }
  };

  clientWs.onclose = () => {
    console.log(`[ocpp-sim-proxy] [${sessionId}] client closed`);
    try {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close();
      }
    } catch { /* ignore */ }
  };

  clientWs.onerror = (e) => {
    console.error(`[ocpp-sim-proxy] [${sessionId}] client error`, e);
  };

  return response;
});
