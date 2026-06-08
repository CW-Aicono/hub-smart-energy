// Edge-Function: ocpp-firmware-control
// Tenant-/Admin-API zum Anlegen, Abbrechen und Status-Triggern von Firmware-Update-Jobs
// für OCPP-Ladepunkte. Erzeugt eine kurzlebige Signed URL auf den privaten Bucket
// `cp-firmware` und reiht den `UpdateFirmware`-Befehl in `pending_ocpp_commands` ein.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const ok = (data: unknown = {}) => json(200, { ok: true, data });
const fail = (status: number, error: string) => json(status, { ok: false, error });

async function getUserContext(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as string);
  return {
    userId: user.id,
    tenantId: (profile?.tenant_id as string | null) ?? null,
    isSuperAdmin: roleList.includes("super_admin"),
  };
}

async function tenantCanAccessChargePoint(ctx: { tenantId: string | null; isSuperAdmin: boolean }, chargePointId: string) {
  const { data: cp } = await admin
    .from("charge_points")
    .select("id, tenant_id, ocpp_id, vendor, model, firmware_version")
    .eq("id", chargePointId)
    .maybeSingle();
  if (!cp) return null;
  if (!ctx.isSuperAdmin && cp.tenant_id !== ctx.tenantId) return null;
  return cp;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "Method not allowed");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid JSON");
  }

  const ctx = await getUserContext(req);
  if (!ctx) return fail(401, "Not authenticated");

  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "enqueue_job": {
        const chargePointId = String(body.charge_point_id ?? "");
        const artifactId = String(body.artifact_id ?? "");
        const retrieveDate = String(body.retrieve_date ?? new Date().toISOString());
        const retries = body.retries != null ? Number(body.retries) : null;
        const retryInterval = body.retry_interval != null ? Number(body.retry_interval) : null;
        if (!chargePointId || !artifactId) return fail(400, "Missing charge_point_id or artifact_id");

        const cp = await tenantCanAccessChargePoint(ctx, chargePointId);
        if (!cp) return fail(403, "No access to this charge point");

        const { data: artifact, error: artErr } = await admin
          .from("cp_firmware_artifacts")
          .select("*")
          .eq("id", artifactId)
          .maybeSingle();
        if (artErr) return fail(500, artErr.message);
        if (!artifact) return fail(404, "Firmware artifact not found");

        // Signed URL erzeugen — Gültigkeit: bis 6 h nach retrieveDate
        const retrieveMs = Date.parse(retrieveDate);
        const expirySeconds = Math.max(
          900, // mind. 15 Min
          Math.ceil(((Number.isFinite(retrieveMs) ? retrieveMs : Date.now()) + 6 * 60 * 60 * 1000 - Date.now()) / 1000),
        );
        const { data: signed, error: signErr } = await admin.storage
          .from("cp-firmware")
          .createSignedUrl(artifact.storage_path as string, expirySeconds);
        if (signErr || !signed?.signedUrl) return fail(500, `Signed URL failed: ${signErr?.message ?? "unknown"}`);

        const urlExpiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

        // Job anlegen
        const { data: job, error: jobErr } = await admin
          .from("cp_firmware_jobs")
          .insert({
            tenant_id: cp.tenant_id,
            charge_point_id: cp.id,
            artifact_id: artifact.id,
            status: "queued",
            retrieve_date: retrieveDate,
            retries,
            retry_interval: retryInterval,
            download_url: signed.signedUrl,
            url_expires_at: urlExpiresAt,
            triggered_by: ctx.userId,
          })
          .select("id")
          .single();
        if (jobErr) return fail(500, jobErr.message);

        // OCPP-Command einreihen — der Dispatcher pollt pending_ocpp_commands
        const { error: cmdErr } = await admin.from("pending_ocpp_commands").insert({
          charge_point_ocpp_id: cp.ocpp_id,
          command: "UpdateFirmware",
          payload: {
            location: signed.signedUrl,
            retrieveDate,
            ...(retries != null ? { retries } : {}),
            ...(retryInterval != null ? { retryInterval } : {}),
          },
          status: "pending",
          scheduled_at: retrieveDate, // Dispatcher sendet erst ab diesem Zeitpunkt
        });
        if (cmdErr) {
          await admin.from("cp_firmware_jobs").update({
            status: "failed",
            error_code: "enqueue_failed",
            error_message: cmdErr.message,
            finished_at: new Date().toISOString(),
          }).eq("id", job.id);
          return fail(500, cmdErr.message);
        }

        await admin.from("cp_firmware_jobs").update({ status: "dispatched" }).eq("id", job.id);
        return ok({ jobId: job.id });
      }

      case "cancel_job": {
        const jobId = String(body.job_id ?? "");
        if (!jobId) return fail(400, "Missing job_id");
        const { data: job } = await admin
          .from("cp_firmware_jobs")
          .select("id, tenant_id, status")
          .eq("id", jobId)
          .maybeSingle();
        if (!job) return fail(404, "Job not found");
        if (!ctx.isSuperAdmin && job.tenant_id !== ctx.tenantId) return fail(403, "No access");
        if (["installed", "failed", "cancelled"].includes(job.status as string)) {
          return fail(409, `Job already ${job.status}`);
        }
        await admin.from("cp_firmware_jobs").update({
          status: "cancelled",
          finished_at: new Date().toISOString(),
        }).eq("id", jobId);
        return ok();
      }

      case "request_status": {
        const chargePointId = String(body.charge_point_id ?? "");
        if (!chargePointId) return fail(400, "Missing charge_point_id");
        const cp = await tenantCanAccessChargePoint(ctx, chargePointId);
        if (!cp) return fail(403, "No access");
        await admin.from("pending_ocpp_commands").insert({
          charge_point_ocpp_id: cp.ocpp_id,
          command: "TriggerMessage",
          payload: { requestedMessage: "FirmwareStatusNotification" },
          status: "pending",
        });
        return ok();
      }

      default:
        return fail(400, `Unknown action: ${action}`);
    }
  } catch (e) {
    console.error("[ocpp-firmware-control]", e);
    return fail(500, e instanceof Error ? e.message : String(e));
  }
});
