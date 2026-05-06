// send-auth-email
// Sends branded auth emails (password reset, signup confirm, email change, magic link)
// via Resend with info@staging.aicono.org as the From address.
//
// Public endpoint (verify_jwt = false) — protected by per-IP rate limiting and
// silent suppression for unknown users (information-disclosure protection).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { resendFrom } from "../_shared/resend-from.ts";
import { renderAuthEmail, type AuthEmailType } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  type: z.enum(["password_reset", "signup_confirm", "email_change", "magic_link"]),
  email: z.string().email().max(254),
  redirectTo: z.string().url().optional(),
  locale: z.enum(["de", "en", "es", "nl"]).optional(),
  recipientName: z.string().max(120).optional(),
  newEmail: z.string().email().max(254).optional(), // for email_change
});

// Simple in-memory IP rate limit (per worker instance).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, arr);
    return false;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

const TYPE_TO_GENERATE_LINK: Record<AuthEmailType, "recovery" | "signup" | "email_change_current" | "magiclink"> = {
  password_reset: "recovery",
  signup_confirm: "signup",
  email_change: "email_change_current",
  magic_link: "magiclink",
};

async function logAudit(
  admin: ReturnType<typeof createClient>,
  type: string,
  recipient: string,
  status: "sent" | "failed" | "suppressed_user_not_found" | "rate_limited",
  resendMessageId?: string,
  error?: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await admin.from("email_send_audit").insert({
      type,
      recipient,
      status,
      resend_message_id: resendMessageId ?? null,
      error: error ?? null,
      metadata,
    });
  } catch (e) {
    console.error("[send-auth-email] audit log failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceKey || !resendKey) {
    console.error("[send-auth-email] missing env vars");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let parsed;
  try {
    const json = await req.json();
    parsed = BodySchema.safeParse(json);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { type, email, redirectTo, locale, recipientName, newEmail } = parsed.data;

  if (!checkRateLimit(ip)) {
    await logAudit(admin, type, email, "rate_limited", undefined, undefined, { ip });
    // Generic OK to avoid disclosing rate-limit existence
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const linkType = TYPE_TO_GENERATE_LINK[type];
    const linkOpts: Record<string, unknown> = {};
    if (redirectTo) linkOpts.redirectTo = redirectTo;
    if (type === "email_change" && newEmail) linkOpts.newEmail = newEmail;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: linkType as never,
      email,
      options: linkOpts,
    });

    if (linkError || !linkData?.properties?.action_link) {
      const msg = linkError?.message ?? "no action_link";
      const isUserMissing =
        /user.*not.*found/i.test(msg) || /no.*user/i.test(msg) || (linkError as { status?: number })?.status === 404;

      if (type === "password_reset" && isUserMissing) {
        await logAudit(admin, type, email, "suppressed_user_not_found", undefined, msg);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error("[send-auth-email] generateLink error", linkError);
      await logAudit(admin, type, email, "failed", undefined, msg);
      return new Response(JSON.stringify({ error: "Could not generate link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = linkData.properties.action_link;
    const rendered = renderAuthEmail(type, actionLink, { recipientName, locale });

    const fromAddress = resendFrom("AICONO");
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        reply_to: Deno.env.get("RESEND_FROM_EMAIL") ?? "info@staging.aicono.org",
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });

    const resendJson = (await resendRes.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!resendRes.ok) {
      const errMsg = resendJson?.message ?? `Resend HTTP ${resendRes.status}`;
      console.error("[send-auth-email] resend send failed", resendJson);
      await logAudit(admin, type, email, "failed", undefined, errMsg);
      return new Response(JSON.stringify({ error: "Email send failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logAudit(admin, type, email, "sent", resendJson.id);

    return new Response(JSON.stringify({ ok: true, messageId: resendJson.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-auth-email] unexpected error", e);
    await logAudit(admin, type, email, "failed", undefined, msg);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
