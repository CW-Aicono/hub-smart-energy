import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify tenant ownership
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    const url = new URL(req.url);
    const latitude = parseFloat(url.searchParams.get("latitude") ?? "");
    const longitude = parseFloat(url.searchParams.get("longitude") ?? "");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const locationId = url.searchParams.get("location_id");
    const tenantId = url.searchParams.get("tenant_id");
    const referenceTemp = parseFloat(url.searchParams.get("reference_temperature") ?? "15");

    if (isNaN(latitude) || isNaN(longitude) || !startDate || !endDate || !locationId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "Missing required params" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile || profile.tenant_id !== tenantId) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache
    const { data: cached } = await supabase
      .from("weather_degree_days")
      .select("*")
      .eq("location_id", locationId)
      .eq("reference_temperature", referenceTemp)
      .gte("month", startDate.substring(0, 7) + "-01")
      .lte("month", endDate.substring(0, 7) + "-01")
      .order("month", { ascending: true });

    // Determine needed months
    const neededMonths: string[] = [];
    const startD = new Date(startDate);
    const endD = new Date(endDate);
    const cursor = new Date(startD.getFullYear(), startD.getMonth(), 1);
    const endMonth = new Date(endD.getFullYear(), endD.getMonth(), 1);
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    while (cursor <= endMonth) {
      const monthStr = cursor.toISOString().substring(0, 10);
      if (cursor <= currentMonth) {
        const cachedMonth = (cached ?? []).find((c: Record<string, unknown>) => c.month === monthStr);
        if (!cachedMonth || monthStr === currentMonth.toISOString().substring(0, 10)) {
          neededMonths.push(monthStr);
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    let freshData: Record<string, unknown>[] = [];

    if (neededMonths.length > 0) {
      const apiStart = neededMonths[0];
      const lastNeeded = neededMonths[neededMonths.length - 1];
      const lastDate = new Date(lastNeeded);
      lastDate.setMonth(lastDate.getMonth() + 1);
      lastDate.setDate(lastDate.getDate() - 1);
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const apiEnd = lastDate > fiveDaysAgo
        ? fiveDaysAgo.toISOString().substring(0, 10)
        : lastDate.toISOString().substring(0, 10);

      // Skip API call if end date is before start date (current month, no archive data yet)
      if (apiEnd >= apiStart) {
        const meteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${apiStart}&end_date=${apiEnd}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;

        console.log("Fetching:", meteoUrl);
        const meteoRes = await fetch(meteoUrl);
        if (!meteoRes.ok) {
          const errText = await meteoRes.text();
          console.error("Meteo error:", meteoRes.status, errText);
          return new Response(
            JSON.stringify({ error: "Weather data unavailable" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const meteoData = await meteoRes.json();
        const dates: string[] = meteoData.daily?.time ?? [];
        const temps: number[] = meteoData.daily?.temperature_2m_mean ?? [];

        const monthlyMap: Record<string, { hdd: number; cdd: number; tempSum: number; count: number }> = {};

        for (let i = 0; i < dates.length; i++) {
          const date = dates[i];
          const temp = temps[i];
          if (temp === null || temp === undefined) continue;

          const monthKey = date.substring(0, 7) + "-01";
          if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = { hdd: 0, cdd: 0, tempSum: 0, count: 0 };
          }

          const m = monthlyMap[monthKey];
          m.tempSum += temp;
          m.count += 1;
          if (temp < referenceTemp) m.hdd += referenceTemp - temp;
          if (temp > referenceTemp) m.cdd += temp - referenceTemp;
        }

        const upsertRows = Object.entries(monthlyMap).map(([month, val]) => ({
          location_id: locationId,
          tenant_id: tenantId,
          month,
          heating_degree_days: Math.round(val.hdd * 100) / 100,
          cooling_degree_days: Math.round(val.cdd * 100) / 100,
          avg_temperature: Math.round((val.tempSum / val.count) * 100) / 100,
          reference_temperature: referenceTemp,
        }));

        if (upsertRows.length > 0) {
          const { error: upsertErr } = await supabase
            .from("weather_degree_days")
            .upsert(upsertRows, { onConflict: "location_id,month,reference_temperature" });

          if (upsertErr) console.error("Upsert error:", upsertErr);
        }

        freshData = upsertRows;
      } else {
        console.log(`Skipping API: apiEnd ${apiEnd} < apiStart ${apiStart}`);
      }
    }

    // Merge cached + fresh
    const allData: Record<string, unknown> = {};
    for (const row of cached ?? []) {
      allData[(row as Record<string, string>).month] = row;
    }
    for (const row of freshData) {
      allData[(row as Record<string, string>).month] = row;
    }

    const result = Object.values(allData).sort((a: unknown, b: unknown) =>
      ((a as Record<string, string>).month).localeCompare((b as Record<string, string>).month)
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
