import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { encrypt, decrypt, isEncrypted, mask } from "../_shared/crypto.ts";

const json = (body: unknown, status = 200, corsHeaders: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encKey = Deno.env.get("BRIGHTHUB_ENCRYPTION_KEY");
    if (!encKey) {
      console.error("BRIGHTHUB_ENCRYPTION_KEY not configured");
      return json({ success: false, error: "Server configuration error" }, 500, corsHeaders);
    }

    const body = await req.json();
    const { action } = body;

    // ── Migrate uses service-role auth (no user JWT needed) ──
    if (action === "migrate") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") || "";
      if (token !== supabaseServiceKey && token !== supabaseAnonKey) {
        // Also allow user JWT if they are admin – but for simplicity, 
        // validate via service-role key match
        // Try user JWT auth as fallback
        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader || "" } },
        });
        const { error: claimsError } = await authClient.auth.getClaims(token);
        if (claimsError) {
          return json({ success: false, error: "Unauthorized" }, 401, corsHeaders);
        }
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: allSettings, error } = await supabase
        .from("brighthub_settings")
        .select("id, api_key, webhook_secret");

      if (error) {
        console.error("Migrate fetch error:", error.message);
        return json({ success: false, error: "Database error" }, 500, corsHeaders);
      }

      let migrated = 0;
      for (const s of (allSettings || [])) {
        const updates: Record<string, string> = {};
        if (s.api_key && !isEncrypted(s.api_key)) {
          updates.api_key = await encrypt(s.api_key, encKey);
        }
        if (s.webhook_secret && !isEncrypted(s.webhook_secret)) {
          updates.webhook_secret = await encrypt(s.webhook_secret, encKey);
        }
        if (Object.keys(updates).length > 0) {
          await supabase
            .from("brighthub_settings")
            .update(updates as any)
            .eq("id", s.id);
          migrated++;
        }
      }

      return json({ success: true, migrated }, 200, corsHeaders);
    }

    // ── Auth for load/save ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401, corsHeaders);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: claimsUser }, error: claimsError } = await authClient.auth.getUser(token);
    if (claimsError || !claimsUser) {
      return json({ success: false, error: "Invalid token" }, 401, corsHeaders);
    }
    const userId = claimsUser.id;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();
    if (!profile?.tenant_id) {
      return json({ success: false, error: "No tenant" }, 403, corsHeaders);
    }

    const { tenantId, locationId } = body;

    if (tenantId && tenantId !== profile.tenant_id) {
      return json({ success: false, error: "Forbidden" }, 403, corsHeaders);
    }
    const tid = tenantId || profile.tenant_id;

    // ── LOAD ──
    if (action === "load") {
      const { data: settings, error } = await supabase
        .from("brighthub_settings")
        .select("*")
        .eq("tenant_id", tid)
        .eq("location_id", locationId)
        .maybeSingle();

      if (error) {
        console.error("DB error:", error.message);
        return json({ success: false, error: "Database error" }, 500, corsHeaders);
      }
      if (!settings) {
        return json({ success: true, data: null }, 200, corsHeaders);
      }

      // Decrypt to get last 4 chars for masking, but never send plaintext
      let maskedApiKey = "";
      let maskedWebhookSecret = "";
      try {
        const plainApiKey = await decrypt(settings.api_key, encKey);
        maskedApiKey = mask(plainApiKey);
      } catch {
        maskedApiKey = mask(settings.api_key);
      }
      try {
        const plainSecret = await decrypt(settings.webhook_secret, encKey);
        maskedWebhookSecret = mask(plainSecret);
      } catch {
        maskedWebhookSecret = mask(settings.webhook_secret);
      }

      return json({
        success: true,
        data: {
          ...settings,
          api_key: maskedApiKey,
          webhook_secret: maskedWebhookSecret,
          _has_api_key: !!settings.api_key && settings.api_key.length > 0,
          _has_webhook_secret: !!settings.webhook_secret && settings.webhook_secret.length > 0,
        },
      }, 200, corsHeaders);
    }

    // ── SAVE ──
    if (action === "save") {
      const {
        api_key,
        webhook_secret,
        webhook_url,
        is_enabled,
        auto_sync_readings,
      } = body;

      // Encrypt credentials if provided (non-masked values)
      const isMasked = (v: string) => v?.startsWith("••••••");

      let encApiKey: string | undefined;
      let encWebhookSecret: string | undefined;

      if (api_key && !isMasked(api_key)) {
        encApiKey = await encrypt(api_key, encKey);
      }
      if (webhook_secret && !isMasked(webhook_secret)) {
        encWebhookSecret = await encrypt(webhook_secret, encKey);
      }

      // Check if settings exist
      const { data: existing } = await supabase
        .from("brighthub_settings")
        .select("id")
        .eq("tenant_id", tid)
        .eq("location_id", locationId)
        .maybeSingle();

      const updateFields: Record<string, unknown> = {
        webhook_url: webhook_url ?? "",
        is_enabled: is_enabled ?? false,
        auto_sync_readings: auto_sync_readings ?? false,
      };
      if (encApiKey !== undefined) updateFields.api_key = encApiKey;
      if (encWebhookSecret !== undefined) updateFields.webhook_secret = encWebhookSecret;

      if (existing) {
        const { error } = await supabase
          .from("brighthub_settings")
          .update(updateFields as any)
          .eq("id", existing.id);
        if (error) {
          console.error("Update error:", error.message);
          return json({ success: false, error: "Save failed" }, 500, corsHeaders);
        }
      } else {
        const { error } = await supabase
          .from("brighthub_settings")
          .insert({
            ...updateFields,
            tenant_id: tid,
            location_id: locationId,
            api_key: encApiKey || "",
            webhook_secret: encWebhookSecret || "",
          } as any);
        if (error) {
          console.error("Insert error:", error.message);
          return json({ success: false, error: "Save failed" }, 500, corsHeaders);
        }
      }

      return json({ success: true }, 200, corsHeaders);
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400, corsHeaders);
  } catch (err) {
    console.error("brighthub-crypto error:", err instanceof Error ? err.message : err);
    return json({ success: false, error: "Internal error" }, 500, corsHeaders);
  }
});
