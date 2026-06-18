/**
 * gateway-update-control
 * ======================
 * Phase 4: Super-Admin steuert Remote-/Auto-Updates der Gateway-Flotte.
 *
 * Actions (POST mit body.action):
 *   - "fleet_list"            → Übersicht aller Gateways inkl. Update-Status
 *   - "channels_list"         → Liste aller Release-Channels
 *   - "channel_publish"       → Neue Version in Channel veröffentlichen
 *                               { channel, version, image_ref, release_notes? }
 *   - "channel_set_latest"    → is_latest-Flag auf eine Version setzen
 *                               { channel, version }
 *   - "queue_update"          → Manuelles Update-Job für ein Gateway
 *                               { gateway_device_id, target_version, image_ref?, channel? }
 *   - "queue_update_bulk"     → Update für mehrere Gateways auf einmal
 *                               { gateway_device_ids: string[], channel, target_version, image_ref? }
 *   - "cancel_update"         → Offenen Job abbrechen ({ job_id })
 *   - "set_auto_update"       → Auto-Update-Flag/Channel pro Gateway
 *                               { gateway_device_id, auto_update_enabled, update_channel? }
 *   - "jobs_list"             → Letzte N Jobs ({ limit?, gateway_device_id?, status? })
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

const VALID_CHANNELS = new Set(["stable", "beta", "dev"]);

async function resolveSuperAdmin(token: string) {
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser();
  if (!data?.user) return null;
  const { data: row } = await svc()
    .from("user_roles").select("role")
    .eq("user_id", data.user.id).eq("role", "super_admin").maybeSingle();
  if (!row) return null;
  return data.user.id;
}

async function enqueueUpdateCommand(jobId: string, deviceId: string, tenantId: string | null, imageRef: string, version: string) {
  const sb = svc();
  await sb.from("gateway_commands").insert({
    gateway_device_id: deviceId,
    tenant_id: tenantId,
    command_type: "pull_image",
    payload: { job_id: jobId, image_ref: imageRef, target_version: version },
    status: "pending",
  });
  await sb.from("gateway_update_jobs")
    .update({ status: "dispatched", dispatched_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function createUpdateJob(opts: {
  userId: string;
  deviceId: string;
  targetVersion: string;
  imageRef: string;
  channel: string;
  triggeredBy: "manual" | "auto" | "scheduled";
}) {
  const sb = svc();
  const { data: device } = await sb.from("gateway_devices")
    .select("id, tenant_id").eq("id", opts.deviceId).maybeSingle();
  if (!device) return { ok: false, error: "Device not found" };

  const { data: job, error } = await sb.from("gateway_update_jobs")
    .insert({
      gateway_device_id: opts.deviceId,
      tenant_id: device.tenant_id,
      target_version: opts.targetVersion,
      image_ref: opts.imageRef,
      channel: opts.channel,
      triggered_by: opts.triggeredBy,
      created_by: opts.userId,
      status: "queued",
    })
    .select("*").maybeSingle();
  if (error || !job) return { ok: false, error: error?.message || "Insert failed" };

  await enqueueUpdateCommand(job.id, opts.deviceId, device.tenant_id, opts.imageRef, opts.targetVersion);
  return { ok: true, job };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const userId = await resolveSuperAdmin(token);
  if (!userId) return json({ error: "Forbidden – super-admin only" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = String(body?.action || "");
  const sb = svc();

  if (action === "fleet_list") {
    const { data, error } = await sb
      .from("gateway_devices")
      .select("id, tenant_id, device_name, device_type, status, addon_version, latest_available_version, ha_version, last_heartbeat_at, auto_update_enabled, update_channel, last_update_check_at, last_update_attempt_at, last_update_error, location_id, location_integration_id, local_ip, mac_address, ws_connected_since, last_ws_ping_at, offline_buffer_count, local_time, created_at, updated_at")
      .order("last_heartbeat_at", { ascending: false, nullsFirst: false });
    if (error) return json({ error: error.message }, 500);

    const integrationIds = Array.from(new Set((data ?? [])
      .map((d: any) => d.location_integration_id)
      .filter(Boolean)));

    const integrationLocationMap: Record<string, string> = {};
    if (integrationIds.length > 0) {
      const { data: integrations, error: integrationError } = await sb
        .from("location_integrations")
        .select("id, location_id")
        .in("id", integrationIds);
      if (integrationError) return json({ error: integrationError.message }, 500);
      (integrations ?? []).forEach((i: any) => {
        if (i.id && i.location_id) integrationLocationMap[i.id] = i.location_id;
      });
    }

    const locationIds = Array.from(new Set((data ?? [])
      .map((d: any) => d.location_id ?? integrationLocationMap[d.location_integration_id])
      .filter(Boolean)));

    const locationNameMap: Record<string, string> = {};
    if (locationIds.length > 0) {
      const { data: locations, error: locationsError } = await sb
        .from("locations")
        .select("id, name")
        .in("id", locationIds);
      if (locationsError) return json({ error: locationsError.message }, 500);
      (locations ?? []).forEach((l: any) => {
        if (l.id && l.name) locationNameMap[l.id] = l.name;
      });
    }

    const devices = (data ?? []).map((d: any) => ({
      ...d,
      location_id: d.location_id ?? integrationLocationMap[d.location_integration_id] ?? null,
      location_name: locationNameMap[d.location_id ?? integrationLocationMap[d.location_integration_id]] ?? null,
    }));
    return json({ success: true, devices });
  }

  if (action === "channels_list") {
    const { data, error } = await sb.from("gateway_release_channels")
      .select("*")
      .order("released_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, channels: data ?? [] });
  }

  if (action === "channel_publish") {
    const channel = String(body?.channel || "");
    const version = String(body?.version || "").trim();
    const imageRef = String(body?.image_ref || "").trim();
    if (!VALID_CHANNELS.has(channel) || !version || !imageRef) {
      return json({ error: "channel/version/image_ref required" }, 400);
    }
    const { data, error } = await sb.from("gateway_release_channels")
      .insert({
        channel, version, image_ref: imageRef,
        release_notes: body?.release_notes ?? null,
        is_latest: Boolean(body?.is_latest),
        created_by: userId,
      })
      .select("*").maybeSingle();
    if (error) return json({ error: error.message }, 500);

    if (body?.is_latest) {
      await sb.from("gateway_release_channels")
        .update({ is_latest: false }).eq("channel", channel).neq("id", data!.id);
    }
    return json({ success: true, channel: data });
  }

  if (action === "channel_set_latest") {
    const channel = String(body?.channel || "");
    const version = String(body?.version || "");
    if (!VALID_CHANNELS.has(channel) || !version) return json({ error: "Invalid input" }, 400);

    await sb.from("gateway_release_channels")
      .update({ is_latest: false }).eq("channel", channel);
    const { data, error } = await sb.from("gateway_release_channels")
      .update({ is_latest: true }).eq("channel", channel).eq("version", version)
      .select("*").maybeSingle();
    if (error || !data) return json({ error: error?.message || "Not found" }, 404);
    return json({ success: true, channel: data });
  }

  if (action === "queue_update") {
    const deviceId = String(body?.gateway_device_id || "");
    const channel = String(body?.channel || "stable");
    let imageRef = String(body?.image_ref || "");
    let version = String(body?.target_version || "");
    if (!deviceId) return json({ error: "gateway_device_id required" }, 400);

    if (!imageRef || !version) {
      const { data: latest } = await sb.from("gateway_release_channels")
        .select("version, image_ref").eq("channel", channel).eq("is_latest", true).maybeSingle();
      if (!latest) return json({ error: "No latest version for channel" }, 400);
      imageRef = imageRef || latest.image_ref;
      version = version || latest.version;
    }
    const result = await createUpdateJob({
      userId, deviceId, targetVersion: version, imageRef, channel, triggeredBy: "manual",
    });
    if (!result.ok) return json({ error: result.error }, 400);
    return json({ success: true, job: result.job });
  }

  if (action === "queue_update_bulk") {
    const ids: string[] = Array.isArray(body?.gateway_device_ids) ? body.gateway_device_ids : [];
    const channel = String(body?.channel || "stable");
    let imageRef = String(body?.image_ref || "");
    let version = String(body?.target_version || "");
    if (ids.length === 0) return json({ error: "gateway_device_ids required" }, 400);

    if (!imageRef || !version) {
      const { data: latest } = await sb.from("gateway_release_channels")
        .select("version, image_ref").eq("channel", channel).eq("is_latest", true).maybeSingle();
      if (!latest) return json({ error: "No latest version for channel" }, 400);
      imageRef = imageRef || latest.image_ref;
      version = version || latest.version;
    }

    const jobs: unknown[] = [];
    for (const deviceId of ids) {
      const r = await createUpdateJob({
        userId, deviceId, targetVersion: version, imageRef, channel, triggeredBy: "manual",
      });
      if (r.ok) jobs.push(r.job);
    }
    return json({ success: true, jobs, count: jobs.length });
  }

  if (action === "cancel_update") {
    const jobId = String(body?.job_id || "");
    if (!jobId) return json({ error: "job_id required" }, 400);
    const { data, error } = await sb.from("gateway_update_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId).in("status", ["queued", "dispatched", "running"])
      .select("*").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, job: data });
  }

  if (action === "set_auto_update") {
    const deviceId = String(body?.gateway_device_id || "");
    if (!deviceId) return json({ error: "gateway_device_id required" }, 400);
    const patch: Record<string, unknown> = {
      auto_update_enabled: Boolean(body?.auto_update_enabled),
    };
    if (body?.update_channel && VALID_CHANNELS.has(String(body.update_channel))) {
      patch.update_channel = String(body.update_channel);
    }
    const { data, error } = await sb.from("gateway_devices")
      .update(patch).eq("id", deviceId).select("id, auto_update_enabled, update_channel").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, device: data });
  }

  if (action === "jobs_list") {
    const limit = Math.min(Number(body?.limit) || 50, 500);
    let q = sb.from("gateway_update_jobs")
      .select("*").order("created_at", { ascending: false }).limit(limit);
    if (body?.gateway_device_id) q = q.eq("gateway_device_id", String(body.gateway_device_id));
    if (body?.status) q = q.eq("status", String(body.status));
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, jobs: data ?? [] });
  }

  return json({ error: "Unknown action" }, 400);
});
