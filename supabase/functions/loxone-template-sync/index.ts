// Loxone Template Sync
// -----------------------------------------------------------------------------
// Discovery + Parameter-Push für die AICONO Loxone-Template-Bibliothek.
//
// Naming-Konvention der VIs auf dem Miniserver:
//   AICO_<TemplateKey>_<InstanceID>_<Param>
//   Beispiel: AICO_WallboxDLM_Haus1_Cap_kW
//
// Aktionen:
//   - discover  : liest LoxAPP3.json, füllt location_loxone_templates
//   - push      : überträgt aktuelle Regel-Parameter auf den Miniserver
//   - heartbeat : re-push aller aktiven loxone_local/hybrid Regeln (Cron)
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const LOX_TIMEOUT_MS = 10_000;
const AICO_PREFIX = "AICO_";

interface LoxoneConfig {
  serial_number: string;
  username: string;
  password: string;
  local_host?: string;
}

interface LoxoneControl {
  name: string;
  type: string;
  uuidAction: string;
  states?: Record<string, string>;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = LOX_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// Loxone Remote Connect resolver (connect.loxonecloud.com returns 307 with dyndns URL).
// The legacy `dns.loxonecloud.com?getip` endpoint has been discontinued (2026-05).
async function resolveCloudHost(serial: string): Promise<string | null> {
  const tryEndpoint = async (url: string, follow: boolean): Promise<string | null> => {
    const res = await fetchWithTimeout(url, { method: "GET", redirect: follow ? "follow" : "manual" });
    if (!follow && res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const u = new URL(loc);
        return `${u.protocol}//${u.host}`;
      }
    }
    if (res.ok) {
      const u = new URL(res.url);
      return `${u.protocol}//${u.host}`;
    }
    return null;
  };
  try {
    const b = await tryEndpoint(`https://connect.loxonecloud.com/${serial}`, false);
    if (b) return b;
  } catch (e) {
    console.warn(`Remote Connect resolve failed for ${serial}:`, e);
  }
  try {
    const b = await tryEndpoint(`http://dns.loxonecloud.com/${serial}`, true);
    if (b) return b;
  } catch (e) {
    console.warn(`Legacy DNS resolve failed for ${serial}:`, e);
  }
  return null;
}

async function resolveBaseUrl(cfg: LoxoneConfig): Promise<string | null> {
  const local = cfg.local_host?.trim();
  if (local) {
    const n = local.startsWith("http") ? local : `http://${local}`;
    return n.replace(/\/+$/, "");
  }
  return await resolveCloudHost(cfg.serial_number);
}

type ViBinding = { uuid?: string; name?: string; controlType: string; source?: string };

const ensureTemplateKey = (key: string) => key.startsWith(AICO_PREFIX) ? key : `${AICO_PREFIX}${key}`;

// Parse "AICO_<TemplateKey>__<InstanceID>__<Param>" (Doppel-Unterstrich als Trenner
// gemäß AICONO Multiplikator-Konzept). Fallback: legacy single-underscore Namen
// "AICO_<TemplateKey>_<InstanceID>_<Param>" werden ebenfalls akzeptiert.
function parseAicoName(name: string): { templateKey: string; instanceId: string; param: string } | null {
  if (!name.startsWith(AICO_PREFIX)) return null;
  const rest = name.slice(AICO_PREFIX.length);

  // Bevorzugt: Doppel-Unterstrich (spezifiziertes Format)
  if (rest.includes("__")) {
    const parts = rest.split("__");
    if (parts.length < 3) return null;
    const [rawTemplateKey, instanceId, ...paramParts] = parts;
    if (!rawTemplateKey || !instanceId || paramParts.length === 0) return null;
    return { templateKey: ensureTemplateKey(rawTemplateKey), instanceId, param: paramParts.join("__") };
  }

  // Legacy Fallback: einfacher Unterstrich
  const parts = rest.split("_");
  if (parts.length < 3) return null;
  const [rawTemplateKey, instanceId, ...paramParts] = parts;
  if (!rawTemplateKey || !instanceId || paramParts.length === 0) return null;
  return { templateKey: ensureTemplateKey(rawTemplateKey), instanceId, param: paramParts.join("_") };
}

// LoxAPP3.json enthält Virtual Inputs je nach Konfiguration/Firmware nicht,
// weil sie keine App-Visualisierung haben. Deshalb prüfen wir bekannte
// AICONO-VI-Namen zusätzlich direkt per Loxone-Webservice.
const KNOWN_TEMPLATE_PARAM_FALLBACKS: Record<string, string[]> = {
  AICO_GridProtect: ["GridLimitKW", "ReactionMs", "EnableProtection"],
};

function parameterNamesFromRegistry(parameters: unknown): string[] {
  if (!Array.isArray(parameters)) return [];
  return parameters
    .map((p: any) => p?.name ?? p?.key)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

async function virtualInputExists(baseUrl: string, auth: string, name: string): Promise<boolean> {
  const encodedName = encodeURIComponent(name);
  const endpoints = [
    `${baseUrl}/jdev/sps/io/${encodedName}/state`,
    `${baseUrl}/dev/sps/io/${encodedName}/state`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, { headers: { Authorization: auth } }, 1_200);
      if (res.ok) return true;
      if (res.status === 401) throw new Error("Authentifizierung fehlgeschlagen");
    } catch (e) {
      if ((e as Error).message === "Authentifizierung fehlgeschlagen") throw e;
    }
  }
  return false;
}

async function discoverKnownVirtualInputs(
  ctx: RunContext,
  baseUrl: string,
  auth: string,
): Promise<Map<string, { templateKey: string; instanceId: string; bindings: Record<string, ViBinding> }>> {
  const { data: regs, error } = await ctx.supabase
    .from("loxone_template_registry")
    .select("template_key, parameters")
    .eq("is_active", true)
    .like("template_key", "AICO_%");
  if (error) throw new Error(`Katalog konnte nicht geladen werden: ${error.message}`);

  const found = new Map<string, { templateKey: string; instanceId: string; bindings: Record<string, ViBinding> }>();
  const instanceIds = ["1", "2", "3"];

  for (const reg of regs || []) {
    const templateKey = ensureTemplateKey((reg as any).template_key as string);
    const registryParams = parameterNamesFromRegistry((reg as any).parameters);
    const fallbackParams = KNOWN_TEMPLATE_PARAM_FALLBACKS[templateKey] || [];
    const allParams = fallbackParams.length > 0
      ? fallbackParams
      : Array.from(new Set(registryParams));
    if (allParams.length === 0) continue;

    // Nur wenige Marker prüfen. Wenn ein Marker existiert, speichern wir alle
    // erwarteten Parameternamen als direkte Namens-Bindings für spätere Pushes.
    const probeParams = fallbackParams.length > 0 ? fallbackParams : allParams.slice(0, 1);
    for (const instanceId of instanceIds) {
      let detected = false;
      for (const param of probeParams) {
        const viName = `${templateKey}__${instanceId}__${param}`;
        if (await virtualInputExists(baseUrl, auth, viName)) {
          detected = true;
          break;
        }
      }
      if (!detected) continue;

      const key = `${templateKey}::${instanceId}`;
      const bindings: Record<string, ViBinding> = {};
      for (const param of allParams) {
        bindings[param] = {
          name: `${templateKey}__${instanceId}__${param}`,
          controlType: "VirtualInput",
          source: "direct_name_probe",
        };
      }
      found.set(key, { templateKey, instanceId, bindings });
    }
  }

  return found;
}

interface RunContext {
  supabase: ReturnType<typeof createClient>;
  isServiceRole: boolean;
  userTenantId: string | null;
}

async function loadLocationIntegration(ctx: RunContext, locationIntegrationId: string) {
  const { data, error } = await ctx.supabase
    .from("location_integrations")
    .select("id, config, location_id, location:locations!inner(tenant_id)")
    .eq("id", locationIntegrationId)
    .maybeSingle();
  if (error || !data) throw new Error("Standort-Integration nicht gefunden");
  const tenantId = (data as any).location?.tenant_id as string;
  if (!ctx.isServiceRole && tenantId !== ctx.userTenantId) {
    throw new Error("Zugriff verweigert");
  }
  return {
    id: data.id as string,
    config: (data as any).config as LoxoneConfig,
    locationId: (data as any).location_id as string,
    tenantId,
  };
}

// ── DISCOVER ────────────────────────────────────────────────────────────────
async function actionDiscover(ctx: RunContext, locationIntegrationId: string) {
  const li = await loadLocationIntegration(ctx, locationIntegrationId);
  if (!li.config?.serial_number || !li.config?.username || !li.config?.password) {
    throw new Error("Loxone-Konfiguration unvollständig");
  }
  const baseUrl = await resolveBaseUrl(li.config);
  if (!baseUrl) throw new Error("Miniserver nicht erreichbar");
  const auth = `Basic ${btoa(`${li.config.username}:${li.config.password}`)}`;

  let controls: Record<string, LoxoneControl> = {};
  let structureWarning: string | undefined;
  const structRes = await fetchWithTimeout(`${baseUrl}/data/LoxAPP3.json`, {
    headers: { Authorization: auth },
  });
  if (!structRes.ok) {
    if (structRes.status === 401) throw new Error("Authentifizierung fehlgeschlagen");
    structureWarning = `LoxAPP3.json konnte nicht geladen werden (${structRes.status}); direkte VI-Prüfung wurde verwendet.`;
  } else {
    const structure = (await structRes.json()) as { controls?: Record<string, LoxoneControl> };
    controls = structure.controls || {};
  }

  // group by templateKey + instanceId
  const instances = new Map<string, {
    templateKey: string;
    instanceId: string;
    bindings: Record<string, ViBinding>;
  }>();

  for (const [, ctrl] of Object.entries(controls)) {
    const parsed = parseAicoName(ctrl.name || "");
    if (!parsed) continue;
    const key = `${parsed.templateKey}::${parsed.instanceId}`;
    if (!instances.has(key)) {
      instances.set(key, { templateKey: parsed.templateKey, instanceId: parsed.instanceId, bindings: {} });
    }
    instances.get(key)!.bindings[parsed.param] = {
      uuid: ctrl.uuidAction,
      controlType: ctrl.type,
      name: ctrl.name,
      source: "LoxAPP3",
    };
  }

  if (instances.size === 0) {
    const directNameInstances = await discoverKnownVirtualInputs(ctx, baseUrl, auth);
    for (const [key, instance] of directNameInstances) {
      instances.set(key, instance);
    }
  }

  // Registry-Versionen (für Vergleich neuer verfügbarer Versionen)
  const templateKeys = Array.from(new Set(Array.from(instances.values()).map((i) => i.templateKey)));
  const registryMap = new Map<string, string>();
  if (templateKeys.length > 0) {
    const { data: regs } = await ctx.supabase
      .from("loxone_template_registry")
      .select("template_key, version")
      .in("template_key", templateKeys)
      .eq("is_active", true);
    for (const r of regs || []) registryMap.set((r as any).template_key, (r as any).version);
  }

  const now = new Date().toISOString();
  const rows = Array.from(instances.values()).map((i) => ({
    tenant_id: li.tenantId,
    location_id: li.locationId,
    template_key: i.templateKey,
    instance_id: i.instanceId,
    installed_version: registryMap.get(i.templateKey) || "unknown",
    vi_bindings: i.bindings,
    discovered_at: now,
    last_seen_at: now,
  }));

  let upserted = 0;
  if (rows.length > 0) {
    const { error: upErr } = await ctx.supabase
      .from("location_loxone_templates")
      .upsert(rows, { onConflict: "location_id,template_key,instance_id" });
    if (upErr) throw new Error(`Speichern fehlgeschlagen: ${upErr.message}`);
    upserted = rows.length;
  }

  return {
    success: true,
    discovered: rows.length,
    upserted,
    hint: rows.length === 0
      ? "Auf diesem Miniserver wurden keine AICO_-Bausteine gefunden. Hinweis: Virtuelle Eingänge ohne App-Visualisierung wurden zusätzlich direkt per Webservice geprüft."
      : undefined,
    warning: structureWarning,
    instances: rows.map((r) => ({
      template_key: r.template_key,
      instance_id: r.instance_id,
      installed_version: r.installed_version,
      param_count: Object.keys(r.vi_bindings).length,
    })),
  };
}

// ── PUSH ────────────────────────────────────────────────────────────────────
function formatLoxoneValue(v: unknown): string {
  if (v === true) return "1";
  if (v === false) return "0";
  if (v === null || v === undefined) return "0";
  if (typeof v === "number") return String(v);
  return encodeURIComponent(String(v));
}

async function pushAutomation(ctx: RunContext, automationId: string, opts: { source: string }) {
  const { data: auto, error: autoErr } = await ctx.supabase
    .from("location_automations")
    .select("id, tenant_id, location_id, location_integration_id, loxone_template_key, loxone_template_instance_id, loxone_template_bindings, execution_mode, is_active, name")
    .eq("id", automationId)
    .maybeSingle();
  if (autoErr || !auto) throw new Error("Automation nicht gefunden");
  const a = auto as any;
  if (!ctx.isServiceRole && a.tenant_id !== ctx.userTenantId) throw new Error("Zugriff verweigert");
  if (!a.loxone_template_key || !a.loxone_template_instance_id) {
    throw new Error("Regel ist keinem Loxone-Template zugeordnet");
  }
  if (a.execution_mode === "cloud") {
    throw new Error("Regel läuft im Cloud-Modus (kein Push nötig)");
  }

  // Bindings laden
  const { data: tpl } = await ctx.supabase
    .from("location_loxone_templates")
    .select("vi_bindings, location_id")
    .eq("location_id", a.location_id)
    .eq("template_key", a.loxone_template_key)
    .eq("instance_id", a.loxone_template_instance_id)
    .maybeSingle();
  if (!tpl) throw new Error("Template-Instanz auf dem Miniserver nicht gefunden — bitte Discovery ausführen");
  const bindings = (tpl as any).vi_bindings as Record<string, ViBinding>;

  // Loxone-Verbindung
  const li = await loadLocationIntegration(ctx, a.location_integration_id);
  const baseUrl = await resolveBaseUrl(li.config);
  if (!baseUrl) throw new Error("Miniserver nicht erreichbar");
  const auth = `Basic ${btoa(`${li.config.username}:${li.config.password}`)}`;

  const params = (a.loxone_template_bindings || {}) as Record<string, unknown>;
  const started = Date.now();
  const results: Array<{ param: string; uuid?: string; ok: boolean; error?: string; value: unknown }> = [];

  for (const [param, value] of Object.entries(params)) {
    const bind = bindings[param];
    const target = bind?.uuid || bind?.name;
    if (!target) {
      results.push({ param, ok: false, error: "VI nicht gefunden", value });
      continue;
    }
    try {
      const url = `${baseUrl}/jdev/sps/io/${encodeURIComponent(target)}/${formatLoxoneValue(value)}`;
      const r = await fetchWithTimeout(url, { headers: { Authorization: auth } }, 5_000);
      if (!r.ok) {
        results.push({ param, uuid: bind.uuid || bind.name, ok: false, error: `HTTP ${r.status}`, value });
      } else {
        results.push({ param, uuid: bind.uuid || bind.name, ok: true, value });
      }
    } catch (e) {
      results.push({ param, uuid: bind.uuid || bind.name, ok: false, error: (e as Error).message, value });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const status = okCount === results.length ? "success" : okCount === 0 ? "error" : "partial";

  await ctx.supabase.from("automation_execution_log").insert({
    automation_id: a.id,
    tenant_id: a.tenant_id,
    trigger_type: opts.source,
    execution_source: "loxone_local",
    status,
    duration_ms: Date.now() - started,
    actions_executed: { pushed: results },
    error_message: status === "success" ? null : results.filter((r) => !r.ok).map((r) => `${r.param}: ${r.error}`).join("; "),
  });

  await ctx.supabase
    .from("location_loxone_templates")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("location_id", a.location_id)
    .eq("template_key", a.loxone_template_key)
    .eq("instance_id", a.loxone_template_instance_id);

  return { success: status !== "error", status, pushed: okCount, total: results.length, results };
}

async function actionPush(ctx: RunContext, automationId: string) {
  return await pushAutomation(ctx, automationId, { source: "manual_push" });
}

// ── HEARTBEAT (Cron) ────────────────────────────────────────────────────────
async function actionHeartbeat(ctx: RunContext) {
  if (!ctx.isServiceRole) throw new Error("Heartbeat nur mit Service-Role erlaubt");
  const { data: autos, error } = await ctx.supabase
    .from("location_automations")
    .select("id, tenant_id, name")
    .eq("is_active", true)
    .in("execution_mode", ["loxone_local", "hybrid"])
    .not("loxone_template_key", "is", null);
  if (error) throw new Error(error.message);

  const summary = { total: (autos || []).length, ok: 0, failed: 0, results: [] as any[] };
  for (const a of autos || []) {
    try {
      const r = await pushAutomation(ctx, (a as any).id, { source: "heartbeat" });
      if (r.status === "error") summary.failed++;
      else summary.ok++;
      summary.results.push({ automation_id: (a as any).id, name: (a as any).name, ...r });
    } catch (e) {
      summary.failed++;
      summary.results.push({ automation_id: (a as any).id, name: (a as any).name, success: false, error: (e as Error).message });
    }
  }
  return summary;
}

// ── HTTP-Entry ──────────────────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Nicht authentifiziert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    let isServiceRole = token === supabaseServiceKey;
    if (!isServiceRole) {
      try {
        const part = token.split(".")[1];
        if (part) {
          const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
          const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
          if (payload?.role === "service_role") isServiceRole = true;
        }
      } catch { /* ignore */ }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let userTenantId: string | null = null;

    if (!isServiceRole) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !user) {
        return new Response(JSON.stringify({ success: false, error: "Ungültige Anmeldung" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user.id).single();
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
      const isSuperAdmin = !!roleRow;
      if (!profile?.tenant_id && !isSuperAdmin) {
        return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userTenantId = (profile as any)?.tenant_id ?? null;
      if (isSuperAdmin) isServiceRole = true;
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;
    const ctx: RunContext = { supabase, isServiceRole, userTenantId };

    let result: unknown;
    switch (action) {
      case "discover":
        if (!body?.locationIntegrationId) throw new Error("locationIntegrationId erforderlich");
        result = await actionDiscover(ctx, body.locationIntegrationId);
        break;
      case "push":
        if (!body?.automationId) throw new Error("automationId erforderlich");
        result = await actionPush(ctx, body.automationId);
        break;
      case "heartbeat":
        result = await actionHeartbeat(ctx);
        break;
      default:
        throw new Error(`Unbekannte Aktion: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("loxone-template-sync error:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
