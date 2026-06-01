// Stufe 4 – Partner-Portal: Einladung eines weiteren Partner-Users (partner_user
// oder partner_admin) in den Partner des Aufrufers. Sendet Magic-Link zum
// Passwort-Setzen per Resend.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Not authenticated");

    const { data: membership } = await supabase
      .from("partner_members")
      .select("partner_id, partner_role, partners:partner_id(name)")
      .eq("user_id", user.id)
      .eq("partner_role", "partner_admin")
      .maybeSingle();
    if (!membership?.partner_id) {
      throw new Error("Nur Partner-Admins dürfen weitere Partner-User einladen.");
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : null;
    const role = body.role === "partner_admin" ? "partner_admin" : "partner_user";
    const redirectTo =
      body.redirectTo ?? "https://hub-smart-energy.lovable.app/set-password";

    if (!email.includes("@")) throw new Error("E-Mail ungültig.");

    // Auth-User finden/erstellen
    let userId: string;
    const { data: lookup } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = lookup?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      const tmp = crypto.randomUUID() + "Aa1!";
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email,
        password: tmp,
        email_confirm: true,
      });
      if (cErr || !created?.user) {
        throw new Error(`Benutzer konnte nicht erstellt werden: ${cErr?.message ?? "unbekannt"}`);
      }
      userId = created.user.id;
      await new Promise((r) => setTimeout(r, 400));
    }

    const { error: memErr } = await supabase
      .from("partner_members")
      .upsert(
        { partner_id: membership.partner_id, user_id: userId, partner_role: role },
        { onConflict: "partner_id,user_id" },
      );
    if (memErr) throw new Error(`Partner-Zuordnung fehlgeschlagen: ${memErr.message}`);

    if (name) {
      await supabase.from("profiles").update({ contact_person: name }).eq("user_id", userId);
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error("Passwort-Link konnte nicht erzeugt werden.");
    }
    const actionLink = linkData.properties.action_link;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY nicht konfiguriert.");
    const resend = new Resend(RESEND_API_KEY);
    const partnerName = (membership as any).partners?.name ?? "AICONO Partner";
    const greeting = name ? `Hallo ${name},` : "Hallo,";
    const roleLabel = role === "partner_admin" ? "Partner-Admin" : "Partner-User";

    const emailRes = await resend.emails.send({
      from: resendFrom("AICONO Partner-Portal"),
      to: [email],
      subject: `Einladung ins Partner-Portal – ${partnerName}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#1a365d,#2d8a6e);padding:30px;border-radius:10px 10px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;">Willkommen im AICONO Partner-Portal</h1>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${partnerName}</div>
  </div>
  <div style="background:#f9fafb;padding:30px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb;border-top:none;">
    <p>${greeting}</p>
    <p>Sie wurden als <strong>${roleLabel}</strong> für <strong>${partnerName}</strong> eingeladen.</p>
    <p>Bitte legen Sie über den folgenden Link Ihr Passwort fest:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${actionLink}" style="display:inline-block;background:#1a365d;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Passwort festlegen &amp; Anmelden</a>
    </p>
    <p style="font-size:13px;color:#6b7280;">Der Link ist 7 Tage gültig.</p>
  </div></body></html>`,
    });
    if (emailRes.error) throw new Error(`E-Mail-Versand fehlgeschlagen: ${emailRes.error.message ?? JSON.stringify(emailRes.error)}`);

    return new Response(
      JSON.stringify({ success: true, userId, role }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
