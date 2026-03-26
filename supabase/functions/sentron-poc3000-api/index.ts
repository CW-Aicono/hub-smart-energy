import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Edge Function: sentron-poc3000-api
 *
 * Polls a Siemens Sentron Powercenter 3000 local REST API and writes
 * power readings into meter_power_readings.
 *
 * Supported actions (POST body):
 *   action=sync     – fetch current values for configured devices and store
 *   action=discover – list devices available on the Powercenter
 */

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const body = await req.json();
    const {
      action = "sync",
      integration_id,
      config,
      tenant_id,
    } = body as {
      action?: string;
      integration_id?: string;
      config?: Record<string, string>;
      tenant_id?: string;
    };

    if (!config?.api_url) {
      return new Response(
        JSON.stringify({ error: "api_url is required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const apiUrl = config.api_url.replace(/\/+$/, "");

    // ── DISCOVER ──────────────────────────────────────────────
    if (action === "discover") {
      const res = await fetch(`${apiUrl}/api/v1/items`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const text = await res.text();
        return new Response(
          JSON.stringify({ error: `Powercenter returned ${res.status}`, detail: text }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const items = await res.json();
      return new Response(JSON.stringify({ items }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── SYNC ──────────────────────────────────────────────────
    if (action === "sync") {
      if (!config.device_ids) {
        return new Response(
          JSON.stringify({ error: "device_ids is required for sync" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const deviceIds = config.device_ids
        .split(",")
        .map((id: string) => id.trim())
        .filter(Boolean);

      const results: Array<{
        deviceId: string;
        status: string;
        readingsCount?: number;
        error?: string;
      }> = [];

      for (const deviceId of deviceIds) {
        try {
          const res = await fetch(`${apiUrl}/api/v1/items/${deviceId}/values`, {
            headers: { Accept: "application/json" },
          });

          if (!res.ok) {
            const text = await res.text();
            results.push({ deviceId, status: "error", error: `HTTP ${res.status}: ${text}` });
            continue;
          }

          const data = await res.json();

          // The Powercenter returns an array of measurement objects.
          // We look for entries whose unit is "W" (active power).
          const powerEntries = Array.isArray(data)
            ? data.filter(
                (entry: Record<string, unknown>) =>
                  entry.unit === "W" || entry.unit === "kW",
              )
            : [];

          if (powerEntries.length === 0) {
            results.push({ deviceId, status: "no_power_values" });
            continue;
          }

          // Try to find an associated meter by matching the device ID in meter metadata
          // (external_id field). If not found, skip.
          const { data: meters } = await supabase
            .from("meters")
            .select("id, tenant_id, energy_type")
            .eq("external_id", deviceId)
            .limit(1);

          const meter = meters?.[0];
          if (!meter) {
            results.push({
              deviceId,
              status: "no_meter_mapping",
              error: "No meter with matching external_id found",
            });
            continue;
          }

          const readings = powerEntries.map(
            (entry: Record<string, unknown>) => {
              let powerW = Number(entry.value) || 0;
              if (entry.unit === "kW") powerW *= 1000;
              return {
                meter_id: meter.id,
                tenant_id: meter.tenant_id,
                energy_type: meter.energy_type || "electricity",
                power_value: powerW / 1000, // store as kW
                recorded_at: new Date().toISOString(),
                source: "sentron_poc3000",
              };
            },
          );

          const { error: insertError } = await supabase
            .from("meter_power_readings")
            .insert(readings);

          if (insertError) {
            results.push({ deviceId, status: "insert_error", error: insertError.message });
          } else {
            results.push({ deviceId, status: "ok", readingsCount: readings.length });
          }
        } catch (err) {
          results.push({ deviceId, status: "error", error: String(err) });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
