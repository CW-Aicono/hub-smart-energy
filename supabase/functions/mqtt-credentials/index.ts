/**
 * mqtt-credentials Edge Function
 * ===============================
 * Verwaltet die mandantenspezifischen MQTT-Zugangsdaten zur AICONO Cloud-Bridge.
 *
 * Endpunkte:
 *   POST /mqtt-credentials             → erzeugt neue Credentials (rotiert ggf.)
 *   GET  /mqtt-credentials             → listet aktive Credentials des Mandanten
 *
 * Das Klartext-Passwort wird NUR direkt in der POST-Antwort zurückgegeben und
 * danach ausschließlich als bcrypt-Hash in `mqtt_credentials.password_hash`
 * gespeichert.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function generatePassword(length = 32): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function tenantSlug(tenantId: string): string {
  return `t-${tenantId.slice(0, 8)}`;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Resolve user + tenant via JWT
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthenticated" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "No tenant" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Require admin role
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("mqtt_credentials")
      .select("id, username, topic_prefix, is_active, last_rotated_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ credentials: data }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const slug = tenantSlug(tenantId);
    const username = `tenant-${slug}`;
    const topicPrefix = `aicono/${slug}/#`;
    const password = generatePassword(32);
    const hash = await bcrypt.hash(password);

    // Deactivate existing credentials for this tenant (rotation)
    await admin
      .from("mqtt_credentials")
      .update({ is_active: false })
      .eq("tenant_id", tenantId);

    const { data, error } = await admin
      .from("mqtt_credentials")
      .insert({
        tenant_id: tenantId,
        username,
        password_hash: hash,
        topic_prefix: topicPrefix,
        is_active: true,
      })
      .select("id, username, topic_prefix, last_rotated_at")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // NOTE: writing to the Mosquitto ACL/passwd files happens out-of-band on the VPS
    // (e.g. via a separate sync job that polls `mqtt_credentials`).
    return new Response(
      JSON.stringify({
        ...data,
        password, // shown ONCE
        broker_url: "mqtts://mqtt.aicono.org:8883",
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  return new Response("Method Not Allowed", { status: 405, headers: cors });
});
