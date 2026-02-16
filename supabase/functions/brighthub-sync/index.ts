import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRIGHTHUB_API_URL =
  "https://jcewrsouppdsvaipdpsy.supabase.co/functions/v1/energy-api";

async function computeSignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function callBrightHub(
  action: string,
  body: Record<string, unknown>,
  apiKey: string
) {
  const response = await fetch(`${BRIGHTHUB_API_URL}?action=${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-energy-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "BrightHub API error");
  return result.data;
}

async function sendWebhook(
  event: string,
  data: unknown,
  apiKey: string,
  webhookSecret: string
) {
  const body = JSON.stringify({ event, data });
  const signature = await computeSignature(body, webhookSecret);

  const response = await fetch(`${BRIGHTHUB_API_URL}?action=webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-energy-api-key": apiKey,
      "x-energy-webhook-signature": signature,
    },
    body,
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Webhook error");
  return result.data;
}

async function sendWithRetry(
  event: string,
  data: unknown,
  apiKey: string,
  webhookSecret: string,
  maxRetries = 3
) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await sendWebhook(event, data, apiKey, webhookSecret);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, body: actionBody, tenantId } = await req.json();

    // Get BrightHub settings for the tenant
    const { data: settings, error: settingsErr } = await supabase
      .from("brighthub_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (settingsErr || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: "BrightHub nicht konfiguriert" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.api_key) {
      return new Response(
        JSON.stringify({ success: false, error: "BrightHub API-Key fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: unknown;

    if (action === "webhook") {
      // Webhook send
      const { event, data: webhookData } = actionBody;
      if (!settings.webhook_secret) {
        return new Response(
          JSON.stringify({ success: false, error: "Webhook-Secret fehlt" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = await sendWithRetry(
        event,
        webhookData,
        settings.api_key,
        settings.webhook_secret
      );
    } else {
      // Regular API call
      result = await callBrightHub(action, actionBody || {}, settings.api_key);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("brighthub-sync error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
