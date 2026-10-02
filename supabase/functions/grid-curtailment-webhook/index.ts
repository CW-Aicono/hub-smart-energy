// K2 §14a EnWG — DSO Webhook Endpoint
//
// Empfängt Steuersignale vom Netzbetreiber (oder Aggregator wie Gridhound).
// Auth: HMAC-SHA256 über Raw-Body, geteilter Secret aus grid_operator_connections.webhook_secret.
// Header:   x-dso-signature: <hex-hmac>
//           x-connection-id: <uuid der grid_operator_connections>
//
// Payload (vereinfachtes JSON):
//   {
//     "valid_from":       "2026-06-06T18:00:00Z",
//     "valid_until":      "2026-06-06T22:00:00Z",
//     "curtailment_percent": 30,
//     "reference":        "DSO-Auftrag-12345"   // optional
//   }
//
// Anti-Replay: received_at darf max. ±5 min von now() abweichen (siehe X-Timestamp-Header).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dso-signature, x-connection-id, x-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BodySchema = z.object({
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime(),
  curtailment_percent: z.number().int().min(0).max(100),
  reference: z.string().max(120).optional(),
});

async function verifyHmac(secret: string, body: string, signatureHex: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // konstante Zeit
  if (expected.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const connectionId = req.headers.get("x-connection-id");
    const signature = req.headers.get("x-dso-signature");
    const timestamp = req.headers.get("x-timestamp");
    if (!connectionId || !signature) {
      return new Response(JSON.stringify({ error: "Missing x-connection-id or x-dso-signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anti-Replay (±5 min)
    if (timestamp) {
      const ts = Date.parse(timestamp);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "Timestamp outside acceptance window" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const raw = await req.text();

    // Connection laden
    const { data: conn, error: connErr } = await admin
      .from("grid_operator_connections")
      .select("id, tenant_id, location_id, webhook_secret, active")
      .eq("id", connectionId)
      .maybeSingle();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: "Unknown connection" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await verifyHmac(conn.webhook_secret, raw, signature);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conn.active) {
      // Trotzdem speichern (für Audit), aber nicht anwenden
      await admin.from("grid_curtailment_events").insert({
        tenant_id: conn.tenant_id,
        connection_id: conn.id,
        valid_from: parsed.data.valid_from,
        valid_until: parsed.data.valid_until,
        curtailment_percent: parsed.data.curtailment_percent,
        source: "webhook",
        payload: { ...parsed.data, skipped: "connection_inactive" },
      });
      return new Response(JSON.stringify({ ok: true, applied: false, reason: "connection_inactive" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event, error: evErr } = await admin
      .from("grid_curtailment_events")
      .insert({
        tenant_id: conn.tenant_id,
        connection_id: conn.id,
        valid_from: parsed.data.valid_from,
        valid_until: parsed.data.valid_until,
        curtailment_percent: parsed.data.curtailment_percent,
        source: "webhook",
        payload: parsed.data,
      })
      .select("id")
      .single();
    if (evErr) throw new Error(evErr.message);

    // Apply asynchron triggern (fire & forget)
    const applyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/grid-curtailment-apply`;
    fetch(applyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ event_id: event.id }),
    }).catch((e) => console.error("[grid-webhook] apply trigger failed", e));

    return new Response(JSON.stringify({ ok: true, event_id: event.id }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[grid-curtailment-webhook] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
