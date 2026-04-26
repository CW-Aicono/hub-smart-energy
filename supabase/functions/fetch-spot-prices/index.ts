import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch day-ahead prices from energy-charts.info (public API, no key needed)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 2);

    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];

    const apiUrl = `https://api.energy-charts.info/price?bzn=DE-LU&start=${start}&end=${end}`;
    const res = await fetch(apiUrl);

    if (!res.ok) {
      throw new Error(`energy-charts API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // energy-charts returns { unix_seconds: number[], price: number[] }
    const unixSeconds: number[] = data.unix_seconds || [];
    const prices: number[] = data.price || [];

    if (unixSeconds.length === 0) {
      return new Response(JSON.stringify({ message: "No price data available" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build rows for upsert
    const rows = unixSeconds.map((ts, i) => ({
      market_area: "DE-LU",
      price_eur_mwh: prices[i] ?? 0,
      timestamp: new Date(ts * 1000).toISOString(),
      price_type: "day_ahead",
    }));

    // Delete existing prices in this range to avoid duplicates, then insert
    const minTs = rows[0].timestamp;
    const maxTs = rows[rows.length - 1].timestamp;

    await supabase
      .from("spot_prices")
      .delete()
      .eq("market_area", "DE-LU")
      .gte("timestamp", minTs)
      .lte("timestamp", maxTs);

    const { error } = await supabase.from("spot_prices").insert(rows);
    if (error) throw error;

    return new Response(
      JSON.stringify({ message: `Inserted ${rows.length} spot prices`, range: `${minTs} → ${maxTs}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-spot-prices error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
