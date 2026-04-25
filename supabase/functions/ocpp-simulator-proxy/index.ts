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

  // HTTP endpoint: list charge points for super-admins (bypasses RLS)
  if (upgradeHeader.toLowerCase() !== "websocket") {
    let bodyAction: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        bodyAction = typeof body?.action === "string" ? body.action : null;
      } catch { /* ignore invalid/empty body */ }
    }
    const action = url.searchParams.get("action") || bodyAction;

    if (action === "list-charge-points") {
      const token =
        url.searchParams.get("access_token") ||
        req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
        "";
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing access_token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = userData.user.id;
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: roleRow } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: cps, error: cpErr } = await adminClient
        .from("charge_points")
        .select("id, name, ocpp_id, ocpp_password, tenant_id")
        .order("name");
      if (cpErr) {
        return new Response(JSON.stringify({ error: cpErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Mask password — only return whether it exists
      const sanitized = (cps ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        ocpp_id: c.ocpp_id,
        has_password: !!c.ocpp_password,
        tenant_id: c.tenant_id,
      }));
      return new Response(JSON.stringify({ charge_points: sanitized }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        info: "OCPP Simulator Proxy",
        usage:
          "WebSocket: ?target=<wss-host>&cp=<ocppId>&access_token=<jwt> | HTTP: ?action=list-charge-points",
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
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  const userId = userData.user.id;

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
    const msg = (e as Error)?.message ?? String(e);
    console.error(`[ocpp-sim-proxy] [${sessionId}] upstream ctor failed:`, msg);
    try {
      clientWs.close(4001, `Upstream connect failed: ${msg}`.slice(0, 120));
    } catch { /* ignore */ }
    return response;
  }

  let upstreamOpen = false;
  let upstreamOpenedAt = 0;
  let lastUpstreamError = "";
  const connectStart = Date.now();
  const queuedFromClient: (string | ArrayBuffer | Blob)[] = [];

  upstream.onopen = () => {
    upstreamOpen = true;
    upstreamOpenedAt = Date.now();
    console.log(
      `[ocpp-sim-proxy] [${sessionId}] upstream open after ${upstreamOpenedAt - connectStart}ms ` +
      `subprotocol="${(upstream as any).protocol ?? ""}"`
    );
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
    const aliveMs = upstreamOpenedAt ? Date.now() - upstreamOpenedAt : 0;
    const phase = upstreamOpen ? `after ${aliveMs}ms open` : `before open (after ${Date.now() - connectStart}ms)`;
    console.log(
      `[ocpp-sim-proxy] [${sessionId}] upstream closed code=${ev.code} reason="${ev.reason}" ${phase} lastErr="${lastUpstreamError}"`
    );
    // Build a verbose reason for the browser so the UI can display the real cause.
    const guess = !upstreamOpen
      ? (lastUpstreamError
          ? `handshake failed: ${lastUpstreamError}`
          : (ev.code === 1006
              ? "handshake failed (likely 401/404/subprotocol mismatch — check ocpp_id, password, server logs)"
              : `closed before open (code=${ev.code})`))
      : (ev.reason || `closed (code=${ev.code})`);
    const fullReason = `Upstream ${phase}: ${guess}`.slice(0, 120);
    try {
      if (clientWs.readyState === WebSocket.OPEN) {
        // Use 4000-range so browser receives our reason intact (1006 is reserved/abnormal).
        clientWs.close(4000 + (ev.code % 1000), fullReason);
      }
    } catch { /* ignore */ }
  };

  upstream.onerror = (e) => {
    lastUpstreamError = (e as any)?.message ?? "unknown error";
    console.error(`[ocpp-sim-proxy] [${sessionId}] upstream error: ${lastUpstreamError}`);
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
