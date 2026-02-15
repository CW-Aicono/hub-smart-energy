import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OCM_BASE = "https://api.openchargemap.io/v3/poi";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const latitude = url.searchParams.get("latitude");
    const longitude = url.searchParams.get("longitude");
    const distance = url.searchParams.get("distance") || "25"; // km
    const maxResults = url.searchParams.get("maxresults") || "200";

    if (!latitude || !longitude) {
      return new Response(JSON.stringify({ error: "latitude and longitude required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      output: "json",
      latitude,
      longitude,
      distance,
      distanceunit: "KM",
      maxresults: maxResults,
      compact: "true",
      verbose: "false",
      countrycode: "DE",
    });

    // Optional API key
    const apiKey = Deno.env.get("OPENCHARGEMAP_API_KEY");
    if (apiKey) params.set("key", apiKey);

    const ocmUrl = `${OCM_BASE}?${params.toString()}`;
    const resp = await fetch(ocmUrl);

    if (!resp.ok) {
      throw new Error(`OpenChargeMap API error: ${resp.status}`);
    }

    const data = await resp.json();

    // Map to simplified format
    const points = (data as any[]).map((poi) => {
      const addr = poi.AddressInfo || {};
      const connections = poi.Connections || [];

      // Extract max power
      const maxPower = connections.reduce((max: number, c: any) => Math.max(max, c.PowerKW || 0), 0);

      // Extract connector types and map to our format
      const connectorTypes = [...new Set(connections.map((c: any) => {
        const title = (c.ConnectionType?.Title || "").toLowerCase();
        if (title.includes("chademo")) return "CHAdeMO";
        if (title.includes("ccs") || title.includes("combo")) return "CCS";
        if (title.includes("type 2") || title.includes("mennekes")) return "Type2";
        if (title.includes("type 1")) return "Type1";
        if (title.includes("schuko")) return "Schuko";
        return "Other";
      }).filter(Boolean))];

      const connectorCount = connections.length || 1;

      // Status
      const isOperational = poi.StatusType?.IsOperational !== false;

      return {
        id: `ocm-${poi.ID}`,
        ocpp_id: `ocm-${poi.ID}`,
        name: addr.Title || `Ladestation ${poi.ID}`,
        status: isOperational ? "available" : "unavailable",
        address: [addr.AddressLine1, addr.Postcode, addr.Town].filter(Boolean).join(", "),
        latitude: addr.Latitude || null,
        longitude: addr.Longitude || null,
        max_power_kw: maxPower || 0,
        connector_type: connectorTypes.join(",") || "Other",
        connector_count: connectorCount,
        vendor: poi.OperatorInfo?.Title || null,
        model: null,
        isAppCompatible: false,
      };
    }).filter((p: any) => p.latitude && p.longitude);

    return new Response(JSON.stringify(points), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("OpenChargeMap proxy error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
