/**
 * gateway-wallbox-fetch
 * =====================
 * Liefert dem AICONO-Gateway alle Daten, die es zum Aufbau einer
 * Modbus-Wallbox-Bridge braucht (Instance + Template + Charge-Point OCPP-ID).
 *
 * Auth: Bearer GATEWAY_API_KEY (oder SUPABASE_SERVICE_ROLE_KEY).
 *
 * POST { instance_id: uuid }
 *   → 200 { instance: {...}, template: {...} }
 *   → 404 wenn Instance nicht existiert
 *   → 401 bei fehlendem/falschem Key
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_API_KEY = Deno.env.get("GATEWAY_API_KEY") ?? "";

function isGatewayToken(token: string): boolean {
  if (!token) return false;
  if (GATEWAY_API_KEY && token === GATEWAY_API_KEY) return true;
  if (token === SERVICE_KEY) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!isGatewayToken(token)) return json({ error: "unauthorized" }, 401);

  let body: { instance_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const instanceId = body.instance_id;
  if (!instanceId || typeof instanceId !== "string") {
    return json({ error: "instance_id required" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: inst, error: instErr } = await admin
    .from("wallbox_modbus_instances")
    .select("id, tenant_id, gateway_id, template_id, charge_point_id, label, modbus_host, modbus_port, unit_id, version")
    .eq("id", instanceId)
    .maybeSingle();

  if (instErr) return json({ error: instErr.message }, 500);
  if (!inst) return json({ error: "instance not found" }, 404);

  const { data: tpl, error: tplErr } = await admin
    .from("wallbox_modbus_templates")
    .select("*")
    .eq("id", inst.template_id)
    .maybeSingle();
  if (tplErr) return json({ error: tplErr.message }, 500);
  if (!tpl) return json({ error: "template not found" }, 404);

  let chargePointOcppId: string | null = null;
  if (inst.charge_point_id) {
    const { data: cp } = await admin
      .from("charge_points")
      .select("ocpp_id")
      .eq("id", inst.charge_point_id)
      .maybeSingle();
    chargePointOcppId = cp?.ocpp_id ?? null;
  }

  return json({
    instance: {
      id: inst.id,
      tenant_id: inst.tenant_id,
      gateway_id: inst.gateway_id,
      template_id: inst.template_id,
      charge_point_ocpp_id: chargePointOcppId ?? inst.id,
      label: inst.label,
      modbus_host: inst.modbus_host,
      modbus_port: inst.modbus_port,
      unit_id: inst.unit_id,
      version: inst.version,
    },
    template: tpl,
  });
});
