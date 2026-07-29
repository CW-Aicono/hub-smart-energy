// Ad-Hoc Charge Orchestrator
// Actions:
//   - preauth        { provider_id, terminal_id, charge_point_id, connector_id?, rule_id, customer_email? }
//   - start_charging { session_id }
//   - capture        { session_id, energy_kwh, duration_minutes }
//   - refund         { session_id, amount_cents }
//   - cancel         { session_id }
//   - mock_full_cycle { charge_point_id? }  -- Convenience: creates a completed mock session end-to-end
//
// Auth: user JWT; RLS enforces tenant + permission (charging.payments.configure / refund).
// Adapter selection: based on payment_providers.provider_type.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdapterFor } from "../_shared/paymentAdapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResp({ error: "Missing Authorization" }, 401);

  // Auth-scoped client (RLS respected) for reads/user identity
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes } = await userClient.auth.getUser(jwt);
  const user = userRes?.user;
  if (!user) return jsonResp({ error: "Unauthorized" }, 401);

  // Service client for state transitions + counters
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: profile } = await svc
    .from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle();

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }

  // Super-admin fallback: derive tenant from body or referenced session
  const { data: isSuper } = await svc.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  let tenant_id: string | null = profile?.tenant_id ?? null;
  if (!tenant_id && isSuper) {
    if (body?.tenant_id) {
      tenant_id = body.tenant_id;
    } else if (body?.session_id) {
      const { data: s } = await svc.from("adhoc_payment_sessions").select("tenant_id").eq("id", body.session_id).maybeSingle();
      tenant_id = s?.tenant_id ?? null;
    }
  }
  if (!tenant_id) return jsonResp({ error: "No tenant (super-admin: bitte tenant_id im Body angeben)" }, 403);
  const action = body.action as string;

  async function loadSession(session_id: string) {
    const { data, error } = await svc
      .from("adhoc_payment_sessions").select("*, provider:payment_providers(provider_type)")
      .eq("id", session_id).eq("tenant_id", tenant_id).maybeSingle();
    if (error || !data) throw new Error("Session nicht gefunden");
    return data;
  }

  async function logEvent(session_id: string | null, provider_id: string | null, direction: "inbound" | "outbound", event_type: string, payload: any) {
    await svc.from("payment_events").insert({
      tenant_id, session_id, provider_id, direction, event_type, payload,
    });
  }

  try {
    switch (action) {
      // ---------------- preauth ----------------
      case "preauth": {
        const { provider_id, terminal_id, charge_point_id, connector_id, rule_id, customer_email } = body;
        if (!provider_id) return jsonResp({ error: "provider_id required" }, 400);

        const { data: provider } = await svc.from("payment_providers").select("*").eq("id", provider_id).eq("tenant_id", tenant_id).maybeSingle();
        if (!provider) return jsonResp({ error: "Provider nicht gefunden" }, 404);

        // Resolve rule
        let rule: any = null;
        if (rule_id) {
          const { data } = await svc.from("adhoc_payment_rules").select("*").eq("id", rule_id).eq("tenant_id", tenant_id).maybeSingle();
          rule = data;
        }
        if (!rule) {
          const { data } = await svc.from("adhoc_payment_rules")
            .select("*").eq("tenant_id", tenant_id).eq("enabled", true)
            .order("priority", { ascending: false }).limit(1).maybeSingle();
          rule = data;
        }
        const preauth_cents = rule?.preauth_amount_cents ?? 5000;
        const currency = rule?.currency ?? "EUR";

        const { data: session, error: insErr } = await svc.from("adhoc_payment_sessions").insert({
          tenant_id, provider_id, terminal_id: terminal_id ?? null,
          charge_point_id: charge_point_id ?? null, connector_id: connector_id ?? null,
          rule_id: rule?.id ?? null, tariff_snapshot: rule?.tariff_id ? { tariff_id: rule.tariff_id } : {},
          preauth_amount_cents: preauth_cents, currency,
          state: "preauth_pending", customer_email: customer_email ?? null,
        } as any).select().single();
        if (insErr) throw insErr;

        const adapter = getAdapterFor(provider.provider_type);
        await logEvent(session.id, provider_id, "outbound", "preauth.request", { amount_cents: preauth_cents });
        const result = await adapter.preauth({
          session_id: session.id, amount_cents: preauth_cents, currency,
        });
        await logEvent(session.id, provider_id, "inbound", "preauth.response", result);

        if (!result.ok) {
          await svc.from("adhoc_payment_sessions").update({ state: "preauth_failed", error: { message: result.error ?? "unknown" } }).eq("id", session.id);
          return jsonResp({ ok: false, error: result.error ?? "Preauth failed" }, 200);
        }
        await svc.from("adhoc_payment_sessions").update({
          state: "preauth_ok", psp_reference: result.psp_reference,
          card_brand: result.card_brand, card_last4: result.card_last4,
        }).eq("id", session.id);
        return jsonResp({ ok: true, session_id: session.id, psp_reference: result.psp_reference });
      }

      // ---------------- start charging ----------------
      case "start_charging": {
        const session = await loadSession(body.session_id);
        if (session.state !== "preauth_ok") return jsonResp({ error: "Wrong state" }, 409);
        await svc.from("adhoc_payment_sessions").update({ state: "charging" }).eq("id", session.id);
        return jsonResp({ ok: true });
      }

      // ---------------- capture ----------------
      case "capture": {
        const session = await loadSession(body.session_id);
        if (!["preauth_ok", "charging"].includes(session.state)) return jsonResp({ error: "Wrong state" }, 409);

        const energy_kwh = Number(body.energy_kwh ?? 0);
        const duration_minutes = Number(body.duration_minutes ?? 0);

        // Compute amount from tariff snapshot
        let capture_cents = session.preauth_amount_cents;
        if (session.rule_id) {
          const { data: rule } = await svc.from("adhoc_payment_rules").select("*, tariff:charging_tariffs(*)").eq("id", session.rule_id).maybeSingle();
          if (rule?.tariff) {
            const perKwh = Number(rule.tariff.price_per_kwh || 0);
            const base = Number(rule.tariff.base_fee || 0);
            const gross = base + energy_kwh * perKwh;
            capture_cents = Math.max(rule.min_amount_cents ?? 50, Math.round(gross * 100));
            // cap to preauth
            capture_cents = Math.min(capture_cents, session.preauth_amount_cents);
          }
        }

        const adapter = getAdapterFor(session.provider?.provider_type ?? "other");
        await logEvent(session.id, session.provider_id, "outbound", "capture.request", { amount_cents: capture_cents });
        const result = await adapter.capture({
          session_id: session.id, psp_reference: session.psp_reference!,
          amount_cents: capture_cents, currency: session.currency,
        });
        await logEvent(session.id, session.provider_id, "inbound", "capture.response", result);

        if (!result.ok) {
          await svc.from("adhoc_payment_sessions").update({ state: "failed", error: { message: result.error } }).eq("id", session.id);
          return jsonResp({ ok: false, error: result.error }, 200);
        }

        const { data: invNumRes } = await svc.rpc("next_adhoc_invoice_number", { _tenant_id: tenant_id });
        await svc.from("adhoc_payment_sessions").update({
          state: "captured", captured_amount_cents: capture_cents,
          energy_kwh, duration_minutes, ended_at: new Date().toISOString(),
          invoice_number: invNumRes as string,
        }).eq("id", session.id);

        return jsonResp({ ok: true, invoice_number: invNumRes, amount_cents: capture_cents });
      }

      // ---------------- refund ----------------
      case "refund": {
        const session = await loadSession(body.session_id);
        if (!["captured", "partially_refunded"].includes(session.state)) return jsonResp({ error: "Wrong state" }, 409);
        const amount_cents = Number(body.amount_cents);
        const remaining = session.captured_amount_cents - (session.refunded_amount_cents ?? 0);
        if (amount_cents <= 0 || amount_cents > remaining) return jsonResp({ error: "Invalid amount" }, 400);

        const adapter = getAdapterFor(session.provider?.provider_type ?? "other");
        await logEvent(session.id, session.provider_id, "outbound", "refund.request", { amount_cents });
        const result = await adapter.refund({
          session_id: session.id, psp_reference: session.psp_reference!,
          amount_cents, currency: session.currency,
        });
        await logEvent(session.id, session.provider_id, "inbound", "refund.response", result);

        if (!result.ok) return jsonResp({ ok: false, error: result.error }, 200);

        const newRefunded = (session.refunded_amount_cents ?? 0) + amount_cents;
        const newState = newRefunded >= session.captured_amount_cents ? "refunded" : "partially_refunded";
        await svc.from("adhoc_payment_sessions").update({
          refunded_amount_cents: newRefunded, state: newState,
        }).eq("id", session.id);
        return jsonResp({ ok: true, refunded_total_cents: newRefunded, state: newState });
      }

      // ---------------- cancel ----------------
      case "cancel": {
        const session = await loadSession(body.session_id);
        if (!["preauth_ok", "preauth_pending", "created"].includes(session.state)) {
          return jsonResp({ error: "Wrong state" }, 409);
        }
        const adapter = getAdapterFor(session.provider?.provider_type ?? "other");
        if (session.psp_reference) {
          await adapter.cancel({ session_id: session.id, psp_reference: session.psp_reference });
        }
        await svc.from("adhoc_payment_sessions").update({ state: "cancelled", ended_at: new Date().toISOString() }).eq("id", session.id);
        return jsonResp({ ok: true });
      }

      // ---------------- mock_full_cycle (dev convenience) ----------------
      case "mock_full_cycle": {
        // 1) ensure a mock provider exists for tenant
        let { data: provider } = await svc.from("payment_providers")
          .select("*").eq("tenant_id", tenant_id).eq("provider_type", "other").maybeSingle();
        if (!provider) {
          const { data } = await svc.from("payment_providers").insert({
            tenant_id, provider_type: "other", display_name: "Mock (auto)",
            environment: "sandbox", is_active: true, config: { auto_created: true },
          } as any).select().single();
          provider = data!;
        }

        // 2) find a rule OR create tenant default
        let { data: rule } = await svc.from("adhoc_payment_rules")
          .select("*").eq("tenant_id", tenant_id).eq("scope", "tenant").maybeSingle();
        if (!rule) {
          const { data: firstTariff } = await svc.from("charging_tariffs")
            .select("id").eq("tenant_id", tenant_id).eq("is_active", true).limit(1).maybeSingle();
          const { data } = await svc.from("adhoc_payment_rules").insert({
            tenant_id, scope: "tenant", name: "Ad-Hoc Standard (auto)",
            tariff_id: firstTariff?.id ?? null, preauth_amount_cents: 5000, currency: "EUR",
          } as any).select().single();
          rule = data!;
        }

        // 3) pick any charge_point (optional)
        const { data: cp } = await svc.from("charge_points").select("id").eq("tenant_id", tenant_id).limit(1).maybeSingle();

        const adapter = getAdapterFor("other");
        const { data: session } = await svc.from("adhoc_payment_sessions").insert({
          tenant_id, provider_id: provider!.id, charge_point_id: cp?.id ?? null,
          rule_id: rule.id, preauth_amount_cents: rule.preauth_amount_cents, currency: rule.currency,
          state: "preauth_pending", customer_email: "test@example.com",
        } as any).select().single();

        const pre = await adapter.preauth({ session_id: session!.id, amount_cents: rule.preauth_amount_cents, currency: rule.currency });
        await logEvent(session!.id, provider!.id, "outbound", "preauth.request", { amount_cents: rule.preauth_amount_cents });
        await logEvent(session!.id, provider!.id, "inbound", "preauth.response", pre);

        await svc.from("adhoc_payment_sessions").update({
          state: "preauth_ok", psp_reference: pre.psp_reference,
          card_brand: pre.card_brand, card_last4: pre.card_last4,
        }).eq("id", session!.id);

        const energy_kwh = +(Math.random() * 25 + 5).toFixed(2);
        const cap = await adapter.capture({ session_id: session!.id, psp_reference: pre.psp_reference!, amount_cents: Math.min(rule.preauth_amount_cents, Math.round(energy_kwh * 45)), currency: rule.currency });
        await logEvent(session!.id, provider!.id, "outbound", "capture.request", { amount_cents: rule.preauth_amount_cents });
        await logEvent(session!.id, provider!.id, "inbound", "capture.response", cap);

        const capture_cents = Math.min(rule.preauth_amount_cents, Math.round(energy_kwh * 45));
        const { data: invNumRes } = await svc.rpc("next_adhoc_invoice_number", { _tenant_id: tenant_id });
        await svc.from("adhoc_payment_sessions").update({
          state: "captured", captured_amount_cents: capture_cents,
          energy_kwh, duration_minutes: Math.round(energy_kwh * 4),
          ended_at: new Date().toISOString(),
          invoice_number: invNumRes as string,
        }).eq("id", session!.id);

        return jsonResp({ ok: true, session_id: session!.id, invoice_number: invNumRes, energy_kwh, amount_cents: capture_cents });
      }

      default:
        return jsonResp({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("orchestrator error", e);
    return jsonResp({ error: (e as Error).message }, 500);
  }
});
