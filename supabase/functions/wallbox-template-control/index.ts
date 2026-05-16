// Wallbox Modbus Template & Instance control
// - Templates: Super-Admin only (write), all authenticated (read)
// - Instances: Tenant-Admin with gateway.manage permission
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCaller(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userClient.auth.getUser(token);
  return user;
}

async function isSuperAdmin(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return !!data;
}

async function hasGatewayManage(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin.rpc("has_permission", {
    _user_id: userId,
    _permission_code: "integrations.edit",
  });
  return !!data;
}

async function getTenantId(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

async function enqueueGatewayCommand(
  admin: ReturnType<typeof createClient>,
  gatewayId: string,
  tenantId: string,
  command: string,
  payload: Record<string, unknown>,
) {
  await admin.from("gateway_commands").insert({
    gateway_device_id: gatewayId,
    tenant_id: tenantId,
    command_type: command,
    payload,
    status: "pending",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // Path after function name: /wallbox-template-control/<rest>
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("wallbox-template-control");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  // sub = ["templates"] | ["templates", id] | ["templates", id, "export"]
  //     | ["instances"] | ["instances", id] | ["instances", id, "test"]

  const user = await getCaller(req);
  if (!user) return json(401, { error: "Unauthorized" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // ---------------- TEMPLATES ----------------
    if (sub[0] === "templates") {
      if (req.method === "GET" && sub.length === 1) {
        const { data, error } = await admin
          .from("wallbox_modbus_templates")
          .select("*")
          .order("vendor")
          .order("model");
        if (error) throw error;
        return json(200, { templates: data });
      }

      if (req.method === "GET" && sub.length === 3 && sub[2] === "export") {
        const { data, error } = await admin
          .from("wallbox_modbus_templates")
          .select("*")
          .eq("id", sub[1])
          .maybeSingle();
        if (error) throw error;
        if (!data) return json(404, { error: "Template not found" });
        return json(200, data);
      }

      // Super-admin gated mutations
      const su = await isSuperAdmin(admin, user.id);
      if (!su) return json(403, { error: "Super-admin required" });

      if (req.method === "POST" && sub.length === 1) {
        const body = await req.json();
        const { data, error } = await admin
          .from("wallbox_modbus_templates")
          .insert({
            vendor: body.vendor,
            model: body.model,
            firmware_min: body.firmware_min ?? null,
            firmware_max: body.firmware_max ?? null,
            default_unit_id: body.default_unit_id ?? 1,
            default_port: body.default_port ?? 502,
            read_map: body.read_map ?? [],
            write_map: body.write_map ?? {},
            status_map: body.status_map ?? {},
            poll_intervals: body.poll_intervals ?? { fast_ms: 3000, slow_ms: 30000 },
            notes: body.notes ?? null,
            is_active: body.is_active ?? false,
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;
        return json(200, { template: data });
      }

      if (req.method === "PUT" && sub.length === 2) {
        const body = await req.json();
        const updates: Record<string, unknown> = {};
        for (const k of [
          "vendor", "model", "firmware_min", "firmware_max",
          "default_unit_id", "default_port",
          "read_map", "write_map", "status_map", "poll_intervals",
          "notes", "is_active",
        ]) {
          if (k in body) updates[k] = body[k];
        }
        const { data, error } = await admin
          .from("wallbox_modbus_templates")
          .update(updates)
          .eq("id", sub[1])
          .select()
          .single();
        if (error) throw error;
        return json(200, { template: data });
      }

      if (req.method === "DELETE" && sub.length === 2) {
        const { error } = await admin
          .from("wallbox_modbus_templates")
          .delete()
          .eq("id", sub[1]);
        if (error) throw error;
        return json(200, { ok: true });
      }
    }

    // ---------------- INSTANCES ----------------
    if (sub[0] === "instances") {
      const tenantId = await getTenantId(admin, user.id);
      const su = await isSuperAdmin(admin, user.id);
      if (!tenantId && !su) return json(403, { error: "No tenant" });

      if (req.method === "GET" && sub.length === 1) {
        let q = admin.from("wallbox_modbus_instances").select(
          "*, template:wallbox_modbus_templates(vendor,model,version), gateway:gateway_devices(id,name), charge_point:charge_points(id,ocpp_id,vendor,model)"
        );
        if (!su) q = q.eq("tenant_id", tenantId);
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        return json(200, { instances: data });
      }

      const canManage = su || (await hasGatewayManage(admin, user.id));
      if (!canManage) return json(403, { error: "integrations.edit permission required" });

      if (req.method === "POST" && sub.length === 1) {
        const body = await req.json();
        if (!body.template_id || !body.gateway_id || !body.modbus_host) {
          return json(400, { error: "template_id, gateway_id, modbus_host required" });
        }

        // Fetch template for charge-point seeding
        const { data: tpl, error: tplErr } = await admin
          .from("wallbox_modbus_templates")
          .select("vendor, model")
          .eq("id", body.template_id)
          .single();
        if (tplErr) throw tplErr;

        // Create charge_point if not provided
        let chargePointFk = body.charge_point_id ?? null;
        if (!chargePointFk) {
          const ocppId = body.ocpp_id ??
            `wb-${tpl.vendor.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;
          const { data: cp, error: cpErr } = await admin
            .from("charge_points")
            .insert({
              tenant_id: tenantId,
              location_id: body.location_id ?? null,
              ocpp_id: ocppId,
              name: body.label ?? `${tpl.vendor} ${tpl.model}`,
              vendor: tpl.vendor,
              model: tpl.model,
              auth_required: false,
            })
            .select("id")
            .single();
          if (cpErr) throw cpErr;
          chargePointFk = cp.id;
        }

        const { data: inst, error: instErr } = await admin
          .from("wallbox_modbus_instances")
          .insert({
            tenant_id: tenantId,
            location_id: body.location_id ?? null,
            gateway_id: body.gateway_id,
            template_id: body.template_id,
            charge_point_id: chargePointFk,
            label: body.label ?? null,
            modbus_host: body.modbus_host,
            modbus_port: body.modbus_port ?? 502,
            unit_id: body.unit_id ?? 1,
            provision_status: "pending",
            created_by: user.id,
          })
          .select()
          .single();
        if (instErr) throw instErr;

        await enqueueGatewayCommand(admin, body.gateway_id, tenantId!, "provision_wallbox", {
          instance_id: inst.id,
        });

        return json(200, { instance: inst });
      }

      if (req.method === "PUT" && sub.length === 2) {
        const body = await req.json();
        const updates: Record<string, unknown> = {};
        for (const k of ["template_id", "modbus_host", "modbus_port", "unit_id", "label", "location_id"]) {
          if (k in body) updates[k] = body[k];
        }
        const { data: inst, error } = await admin
          .from("wallbox_modbus_instances")
          .update(updates)
          .eq("id", sub[1])
          .select()
          .single();
        if (error) throw error;

        if (inst.gateway_id) {
          await enqueueGatewayCommand(admin, inst.gateway_id, inst.tenant_id, "update_wallbox", {
            instance_id: inst.id,
          });
        }
        return json(200, { instance: inst });
      }

      if (req.method === "DELETE" && sub.length === 2) {
        const { data: inst } = await admin
          .from("wallbox_modbus_instances")
          .select("id, gateway_id, tenant_id")
          .eq("id", sub[1])
          .maybeSingle();
        if (!inst) return json(404, { error: "Instance not found" });

        if (inst.gateway_id) {
          await enqueueGatewayCommand(admin, inst.gateway_id, inst.tenant_id, "remove_wallbox", {
            instance_id: inst.id,
          });
        }
        const { error } = await admin
          .from("wallbox_modbus_instances")
          .delete()
          .eq("id", sub[1]);
        if (error) throw error;
        return json(200, { ok: true });
      }

      if (req.method === "POST" && sub.length === 3 && sub[2] === "test") {
        const { data: inst } = await admin
          .from("wallbox_modbus_instances")
          .select("id, gateway_id, tenant_id")
          .eq("id", sub[1])
          .maybeSingle();
        if (!inst) return json(404, { error: "Instance not found" });
        if (!inst.gateway_id) return json(400, { error: "No gateway assigned" });

        await enqueueGatewayCommand(admin, inst.gateway_id, inst.tenant_id, "test_wallbox", {
          instance_id: inst.id,
        });
        return json(200, { ok: true, queued: true });
      }
    }

    return json(404, { error: "Unknown route", path: sub });
  } catch (err) {
    console.error("[wallbox-template-control] error", err);
    return json(500, { error: (err as Error).message });
  }
});
