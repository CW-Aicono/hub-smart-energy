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

function randomWebSocketKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function toHttpHandshakeUrl(wsUrl: string): string {
  if (/^wss:\/\//i.test(wsUrl)) return wsUrl.replace(/^wss:\/\//i, "https://");
  if (/^ws:\/\//i.test(wsUrl)) return wsUrl.replace(/^ws:\/\//i, "http://");
  return wsUrl;
}

async function checkUpstreamHealth(params: {
  target: string;
  cpId: string;
}): Promise<{ ok: boolean; status?: number; statusText?: string; body?: string; url: string; healthUrl: string; error?: string }> {
  const upstreamBase = params.target.replace(/\/+$/, "");
  const upstreamWsUrl = `${upstreamBase}/${encodeURIComponent(params.cpId)}`;
  const healthUrl = `${toHttpHandshakeUrl(upstreamBase)}/health`;

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      redirect: "manual",
    });

    const body = (await response.text().catch(() => "")).slice(0, 500);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      url: upstreamWsUrl,
      healthUrl,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      url: upstreamWsUrl,
      healthUrl,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const upgradeHeader = req.headers.get("upgrade") || "";

  // HTTP endpoint: list charge points for super-admins (bypasses RLS)
  if (upgradeHeader.toLowerCase() !== "websocket") {
    let body: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch { /* ignore invalid/empty body */ }
    }
    const action = url.searchParams.get("action") || (typeof body?.action === "string" ? body.action : null);

    if (action === "check-upstream") {
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

      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: roleRow } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const target = typeof body?.target === "string" ? body.target : "";
      const cpId = typeof body?.cp === "string" ? body.cp : "";
      if (!target || !cpId || !/^wss?:\/\//i.test(target)) {
        return new Response(JSON.stringify({ error: "Missing or invalid target/cp" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: cp, error: cpErr } = await adminClient
        .from("charge_points")
        .select("ocpp_password")
        .eq("ocpp_id", cpId)
        .maybeSingle();
      if (cpErr || !cp) {
        return new Response(JSON.stringify({ error: `Unknown charge point: ${cpId}` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await checkUpstreamHealth({ target, cpId });
      console.log(`[ocpp-sim-proxy] upstream health check cp=${cpId} target=${target} result=${JSON.stringify(result)}`);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
  let pendingClientClose: { code: number; reason: string } | null = null;
  const connectStart = Date.now();
  const queuedFromClient: (string | ArrayBuffer | Blob)[] = [];

  const closeClientWithUpstreamReason = (code: number, reason: string) => {
    const safeCode = code >= 4000 && code <= 4999 ? code : 4400;
    const safeReason = reason.slice(0, 120);
    if (clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.close(safeCode, safeReason); } catch { /* ignore */ }
      return;
    }
    pendingClientClose = { code: safeCode, reason: safeReason };
  };

  clientWs.onopen = () => {
    if (pendingClientClose) {
      const pending = pendingClientClose;
      pendingClientClose = null;
      closeClientWithUpstreamReason(pending.code, pending.reason);
    }
  };

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
    const guess = !upstreamOpen
      ? (lastUpstreamError
          ? `handshake failed: ${lastUpstreamError}`
          : (ev.code === 1006 || ev.code === 0
              ? "handshake failed (check ocpp_id, server key, TLS/subprotocol, and Hetzner logs)"
              : `closed before open (code=${ev.code})`))
      : (ev.reason || `closed (code=${ev.code})`);
    closeClientWithUpstreamReason(4400, `Upstream ${phase}: ${guess}`);
  };

  upstream.onerror = (e) => {
    lastUpstreamError = (e as ErrorEvent)?.message ?? String(e);
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
