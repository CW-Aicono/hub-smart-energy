import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface OmadaTokenResponse {
  errorCode: number;
  msg: string;
  result: {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  };
}

async function tryGetAccessToken(
  baseUrl: string,
  omadaId: string,
  clientId: string,
  clientSecret: string
): Promise<{ token: string; omadaId: string } | { error: string }> {
  // Build list of attempts with different URL patterns AND content types
  const jsonAttempts = [
    {
      label: "JSON+query+body",
      url: `${baseUrl}/openapi/authorize/token?grant_type=client_credentials&omadacId=${omadaId}`,
      contentType: "application/json",
      body: JSON.stringify({ omadacId: omadaId, client_id: clientId, client_secret: clientSecret }),
    },
    {
      label: "JSON+query-only",
      url: `${baseUrl}/openapi/authorize/token?grant_type=client_credentials&omadacId=${omadaId}`,
      contentType: "application/json",
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    },
    {
      label: "JSON+body-only",
      url: `${baseUrl}/openapi/authorize/token?grant_type=client_credentials`,
      contentType: "application/json",
      body: JSON.stringify({ omadacId: omadaId, client_id: clientId, client_secret: clientSecret }),
    },
  ];

  // Some OC200 firmware versions (1.x) expect form-urlencoded
  const formAttempts = [
    {
      label: "FORM+query+body",
      url: `${baseUrl}/openapi/authorize/token?grant_type=client_credentials&omadacId=${omadaId}`,
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({ omadacId: omadaId, client_id: clientId, client_secret: clientSecret }).toString(),
    },
    {
      label: "FORM+body-only",
      url: `${baseUrl}/openapi/authorize/token?grant_type=client_credentials`,
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({ omadacId: omadaId, client_id: clientId, client_secret: clientSecret }).toString(),
    },
  ];

  const allAttempts = [...jsonAttempts, ...formAttempts];
  const errors: string[] = [];

  for (const attempt of allAttempts) {
    try {
      console.log(`Auth attempt [${attempt.label}]: ${attempt.url}`);
      const resp = await fetch(attempt.url, {
        method: "POST",
        headers: { "Content-Type": attempt.contentType },
        body: attempt.body,
      });
      const contentType = resp.headers.get("content-type") || "";
      const rawText = await resp.text();
      
      if (!contentType.includes("application/json")) {
        errors.push(`[${attempt.label}] Non-JSON (${resp.status}): ${rawText.substring(0, 120)}`);
        continue;
      }
      
      const data: OmadaTokenResponse = JSON.parse(rawText);
      if (data.errorCode === 0 && data.result?.accessToken) {
        console.log(`Auth succeeded with [${attempt.label}]`);
        return { token: data.result.accessToken, omadaId };
      }
      errors.push(`[${attempt.label}] Code ${data.errorCode}: ${data.msg}`);
    } catch (e) {
      errors.push(`[${attempt.label}] Fetch error: ${e.message}`);
    }
  }

  return { error: `All auth attempts failed (${allAttempts.length} patterns). Details:\n${errors.join("\n")}` };
}

async function omadaGet(baseUrl: string, path: string, token: string, omadaId: string) {
  const url = `${baseUrl}/openapi/v1/${omadaId}${path}`;
  console.log(`GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      Authorization: `AccessToken=${token}`,
      "Content-Type": "application/json",
    },
  });
  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await resp.text();
    throw new Error(`Omada API returned non-JSON for ${path} (${resp.status}): ${text.substring(0, 200)}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── AUTH ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Nicht authentifiziert" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { locationIntegrationId, action } = await req.json();

    // Load integration config
    const { data: li, error: liErr } = await supabase
      .from("location_integrations")
      .select("*, integrations(*), location:locations!inner(tenant_id)")
      .eq("id", locationIntegrationId)
      .single();

    if (liErr || !li) {
      return new Response(JSON.stringify({ success: false, error: "Integration not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Verify tenant ownership
    if ((li as any).location?.tenant_id !== profile.tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "Zugriff verweigert" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = (li.config || {}) as Record<string, string>;
    const baseUrl = (config.api_url || "").replace(/\/$/, "");
    const omadaId = config.omada_id || "";
    const clientId = config.client_id || "";
    const clientSecret = config.client_secret || "";

    if (!baseUrl || !omadaId || !clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Omada configuration (api_url, omada_id, client_id, client_secret)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Try with configured omadaId first, then with device_id if available
    const idsToTry = [omadaId];
    if (config.device_id && config.device_id !== omadaId) {
      idsToTry.push(config.device_id);
    }

    let authResult: { token: string; omadaId: string } | { error: string } = { error: "No IDs to try" };
    for (const id of idsToTry) {
      console.log(`Trying omadaId: ${id}`);
      authResult = await tryGetAccessToken(baseUrl, id, clientId, clientSecret);
      if ("token" in authResult) break;
    }
    console.log(`Auth result: ${"token" in authResult ? "success" : authResult.error}`);

    if ("error" in authResult) {
      return new Response(
        JSON.stringify({ success: false, error: authResult.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const { token, omadaId: resolvedOmadaId } = authResult;

    // Get sites first
    const sitesData = await omadaGet(baseUrl, "/sites", token, resolvedOmadaId);
    const sites = sitesData?.result?.data || [];

    if (action === "getSensors" || action === "getDevices") {
      const allDevices: any[] = [];

      for (const site of sites) {
        const siteId = site.siteId || site.id;

        // Fetch APs
        const aps = await omadaGet(baseUrl, `/sites/${siteId}/aps`, token, resolvedOmadaId);
        for (const ap of aps?.result?.data || []) {
          allDevices.push({
            uuid: `ap_${ap.mac}`,
            name: ap.name || ap.mac,
            type: "access_point",
            value: ap.status === 14 ? "online" : "offline",
            unit: "",
            category: "network",
            meta: { mac: ap.mac, model: ap.model, ip: ap.ip, site: site.name },
          });
        }

        // Fetch Switches
        const switches = await omadaGet(baseUrl, `/sites/${siteId}/switches`, token, resolvedOmadaId);
        for (const sw of switches?.result?.data || []) {
          allDevices.push({
            uuid: `sw_${sw.mac}`,
            name: sw.name || sw.mac,
            type: "switch",
            value: sw.status === 14 ? "online" : "offline",
            unit: "",
            category: "network",
            meta: { mac: sw.mac, model: sw.model, ip: sw.ip, site: site.name, poeRemaining: sw.poeRemain },
          });
        }

        // Fetch Gateways
        const gateways = await omadaGet(baseUrl, `/sites/${siteId}/gateways`, token, resolvedOmadaId);
        for (const gw of gateways?.result?.data || []) {
          allDevices.push({
            uuid: `gw_${gw.mac}`,
            name: gw.name || gw.mac,
            type: "gateway",
            value: gw.status === 14 ? "online" : "offline",
            unit: "",
            category: "network",
            meta: { mac: gw.mac, model: gw.model, ip: gw.ip, site: site.name },
          });
        }
      }

      return new Response(JSON.stringify({ success: true, sensors: allDevices }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "testConnection") {
      return new Response(
        JSON.stringify({ success: true, message: `Connected. Found ${sites.length} site(s).` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
