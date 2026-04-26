/**
 * Edge Function: ocpp-simulator-control
 * Brücke zwischen Lovable UI und dem Hetzner OCPP-Simulator-Container.
 *
 * Aktionen (per query-param ?action=...):
 *  - status        GET    Liste aller Instanzen aus DB + Live-Status vom Container
 *  - start         POST   Body: { tenantId, vendor?, model?, protocol? }  -> legt charge_point + sim-instance an, startet sim
 *  - action        POST   Body: { instanceId, action: "startTx"|"stopTx" }
 *  - stop          POST   Body: { instanceId }
 *
 * Auth: nur super_admin.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SIM_API_BASE = "https://ocpp.aicono.org/sim-api";

interface SimDto {
  id: string;
  tenantId: string;
  ocppId: string;
  protocol: "ws" | "wss";
  serverHost: string;
  vendor: string;
  model: string;
  status: string;
  lastError: string | null;
  startedAt: string;
  meterWh: number;
  transactionId: number | null;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callSim(path: string, init: RequestInit, simKey: string, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${SIM_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${simKey}`,
        "Content-Type": "application/json",
      },
    });
    const text = await resp.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 504, data: { error: "Simulator API timeout", message } };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SIM_KEY = Deno.env.get("OCPP_SIMULATOR_API_KEY") ?? "";
  if (!SIM_KEY) {
    return json(500, { error: "OCPP_SIMULATOR_API_KEY secret missing" });
  }

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Missing bearer token" });
  }
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(
    authHeader.slice(7),
  );
  if (claimsErr || !claims?.claims?.sub) {
    return json(401, { error: "Unauthorized" });
  }
  const userId = claims.claims.sub as string;

  // Super-Admin-Check via service-role (umgeht RLS auf user_roles)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!roleRow) {
    return json(403, { error: "Forbidden: super_admin role required" });
  }

  const url = new URL(req.url);
  let bodyJson: any = null;
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    try {
      const text = await req.text();
      bodyJson = text ? JSON.parse(text) : null;
    } catch {
      bodyJson = null;
    }
  }
  const action =
    (bodyJson && typeof bodyJson.__action === "string"
      ? bodyJson.__action
      : null) ??
    url.searchParams.get("action") ??
    "status";

  try {
    // ---------------- STATUS ----------------
    if (action === "status") {
      const live = await callSim("/status", { method: "GET" }, SIM_KEY);
      const liveInstances: SimDto[] =
        (live.data as { instances?: SimDto[] } | null)?.instances ?? [];
      const liveById = new Map(liveInstances.map((i) => [i.id, i]));

      const { data: dbRows, error } = await supabaseAdmin
        .from("simulator_instances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Sync: live-Status in DB nachziehen
      const merged = (dbRows ?? []).map((row) => {
        const l = row.external_id ? liveById.get(row.external_id) : undefined;
        return {
          ...row,
          live_status: l?.status ?? null,
          live_meter_wh: l?.meterWh ?? null,
          live_transaction_id: l?.transactionId ?? null,
          live_last_error: l?.lastError ?? null,
        };
      });

      // Hintergrund-Sync (best effort)
      for (const row of dbRows ?? []) {
        const l = row.external_id ? liveById.get(row.external_id) : undefined;
        if (l && l.status !== row.status) {
          await supabaseAdmin
            .from("simulator_instances")
            .update({ status: l.status, last_error: l.lastError })
            .eq("id", row.id);
        } else if (!l && !["stopped", "error"].includes(row.status)) {
          // nicht mehr im Container -> als gestoppt markieren
          await supabaseAdmin
            .from("simulator_instances")
            .update({ status: "stopped", stopped_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      }

      return json(200, { instances: merged });
    }

    // ---------------- START ----------------
    if (action === "start" && req.method === "POST") {
      const body = bodyJson ?? {};
      const tenantId = body.tenantId as string;
      const vendor = (body.vendor as string) || "AICONO";
      const model = (body.model as string) || "Simulator";
      const protocol = "wss";

      if (!tenantId) return json(400, { error: "tenantId required" });

      // Limit prüfen (DB-seitig)
      const { count } = await supabaseAdmin
        .from("simulator_instances")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .not("status", "in", "(stopped,error)");
      if ((count ?? 0) >= 3) {
        return json(429, {
          error: "Maximal 3 aktive Simulator-Instanzen pro Tenant",
        });
      }

      // Eindeutige OCPP-ID generieren
      const ocppId = `sim-${tenantId.slice(0, 8)}-${crypto
        .randomUUID()
        .slice(0, 8)}`;

      // Charge Point in DB anlegen, damit OCPP-Server die Wallbox kennt
      const { data: cp, error: cpErr } = await supabaseAdmin
        .from("charge_points")
        .insert({
          tenant_id: tenantId,
          name: `Simulator ${ocppId}`,
          ocpp_id: ocppId,
          vendor,
          model,
          status: "available",
          connection_protocol: protocol,
          auth_required: false,
          max_power_kw: 22,
        })
        .select()
        .single();
      if (cpErr) throw cpErr;

      // Simulator beim Container starten
      const sim = await callSim(
        "/start",
        {
          method: "POST",
          body: JSON.stringify({
            tenantId,
            ocppId,
            protocol,
            vendor,
            model,
          }),
        },
        SIM_KEY,
      );
      if (!sim.ok) {
        // rollback charge_point
        await supabaseAdmin.from("charge_points").delete().eq("id", cp.id);
        return json(sim.status, {
          error: "Simulator start failed",
          details: sim.data,
        });
      }

      const simDto = sim.data as SimDto;

      // simulator_instances anlegen
      const { data: inst, error: instErr } = await supabaseAdmin
        .from("simulator_instances")
        .insert({
          tenant_id: tenantId,
          external_id: simDto.id,
          ocpp_id: ocppId,
          protocol,
          server_host: simDto.serverHost,
          vendor,
          model,
          status: simDto.status,
          charge_point_id: cp.id,
          created_by: userId,
        })
        .select()
        .single();
      if (instErr) throw instErr;

      return json(200, { instance: inst, live: simDto });
    }

    // ---------------- ACTION (startTx / stopTx) ----------------
    if (action === "action" && req.method === "POST") {
      const body = bodyJson ?? {};
      const instanceId = body.instanceId as string;
      const act = body.action as string;
      if (!instanceId || !["startTx", "stopTx"].includes(act)) {
        return json(400, { error: "instanceId and valid action required" });
      }
      const { data: row, error } = await supabaseAdmin
        .from("simulator_instances")
        .select("external_id")
        .eq("id", instanceId)
        .maybeSingle();
      if (error || !row?.external_id) {
        return json(404, { error: "Instance not found" });
      }
      const sim = await callSim(
        "/action",
        {
          method: "POST",
          body: JSON.stringify({ id: row.external_id, action: act }),
        },
        SIM_KEY,
        8000,
      );
      if (!sim.ok) {
        return json(sim.status, { error: "Action failed", details: sim.data });
      }
      const simDto = sim.data as SimDto;
      await supabaseAdmin
        .from("simulator_instances")
        .update({ status: simDto.status })
        .eq("id", instanceId);
      return json(200, { live: simDto });
    }

    // Helper: aktive Simulator-Charging-Sessions abschließen
    const closeSimSessions = async (
      tenantId: string | null | undefined,
      chargePointId: string | null | undefined,
    ) => {
      try {
        const q = supabaseAdmin
          .from("charging_sessions")
          .update({
            status: "completed",
            stop_time: new Date().toISOString(),
            stop_reason: "simulator_cleanup",
          })
          .eq("status", "active");
        if (chargePointId) {
          await q.eq("charge_point_id", chargePointId);
        } else if (tenantId) {
          // Fallback: verwaiste Simulator-Sessions ohne charge_point_id
          await q.eq("tenant_id", tenantId)
            .is("charge_point_id", null)
            .eq("id_tag", "SIM-IDTAG");
        }
      } catch (e) {
        console.error("closeSimSessions failed", e);
      }
    };

    // ---------------- STOP ----------------
    if (action === "stop" && req.method === "POST") {
      const body = bodyJson ?? {};
      const instanceId = body.instanceId as string;
      if (!instanceId) return json(400, { error: "instanceId required" });

      const { data: row, error } = await supabaseAdmin
        .from("simulator_instances")
        .select("external_id, charge_point_id, tenant_id")
        .eq("id", instanceId)
        .maybeSingle();
      if (error || !row) return json(404, { error: "Instance not found" });

      if (row.external_id) {
        await callSim(
          "/stop",
          {
            method: "POST",
            body: JSON.stringify({ id: row.external_id }),
          },
          SIM_KEY,
          8000,
        );
      }

      await supabaseAdmin
        .from("simulator_instances")
        .update({ status: "stopped", stopped_at: new Date().toISOString() })
        .eq("id", instanceId);

      // Aktive Ladevorgänge dieser Sim-Instanz beenden
      await closeSimSessions(row.tenant_id, row.charge_point_id);

      // Charge Point optional aufräumen
      if (row.charge_point_id) {
        await supabaseAdmin
          .from("charge_points")
          .delete()
          .eq("id", row.charge_point_id);
      }

      return json(200, { ok: true });
    }

    // ---------------- DELETE ----------------
    if (action === "delete" && req.method === "POST") {
      const body = bodyJson ?? {};
      const instanceId = body.instanceId as string;
      if (!instanceId) return json(400, { error: "instanceId required" });

      const { data: row } = await supabaseAdmin
        .from("simulator_instances")
        .select("external_id, charge_point_id, status, tenant_id")
        .eq("id", instanceId)
        .maybeSingle();

      // Best-effort: stoppe Sim-Instanz falls noch aktiv
      if (row?.external_id) {
        try {
          await callSim(
            "/stop",
            { method: "POST", body: JSON.stringify({ id: row.external_id }) },
            SIM_KEY,
            8000,
          );
        } catch (_) { /* ignore */ }
      }

      // Aktive Ladevorgänge dieser Sim-Instanz beenden
      if (row) {
        await closeSimSessions(row.tenant_id, row.charge_point_id);
      }

      // Charge Point aufräumen
      if (row?.charge_point_id) {
        await supabaseAdmin
          .from("charge_points")
          .delete()
          .eq("id", row.charge_point_id);
      }

      await supabaseAdmin
        .from("simulator_instances")
        .delete()
        .eq("id", instanceId);

      return json(200, { ok: true });
    }

    return json(400, { error: `Unknown action or method: ${action} ${req.method}` });
  } catch (e) {
    let msg: string;
    if (e instanceof Error) msg = e.message;
    else if (typeof e === "string") msg = e;
    else {
      try { msg = JSON.stringify(e); } catch { msg = String(e); }
    }
    console.error("ocpp-simulator-control error:", e);
    return json(500, { error: msg });
  }
});
