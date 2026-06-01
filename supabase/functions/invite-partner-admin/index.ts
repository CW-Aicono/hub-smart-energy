import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: only super_admin allowed
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callingUser }, error: authError } =
      await supabase.auth.getUser(token);
    if (authError || !callingUser) throw new Error("Not authenticated");

    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id);
    const roles = (callerRoles ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes("super_admin")) {
      throw new Error("Nur Super-Admin darf Partner anlegen.");
    }

    const body = await req.json();
    const partnerName = String(body.partnerName ?? "").trim();
    const partnerSlug = String(body.partnerSlug ?? "").trim().toLowerCase();
    const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
    const adminName = body.adminName ? String(body.adminName).trim() : null;
    const redirectTo =
      body.redirectTo ?? "https://hub-smart-energy.lovable.app/set-password";

    if (!partnerName) throw new Error("Firmenname fehlt.");
    if (!/^[a-z0-9-]{2,50}$/.test(partnerSlug))
      throw new Error("Slug ungültig (a-z, 0-9, '-', 2–50 Zeichen).");
    if (!adminEmail.includes("@")) throw new Error("E-Mail ungültig.");

    // 1) Partner anlegen (oder Slug-Konflikt erkennen)
    const { data: existing } = await supabase
      .from("partners")
      .select("id")
      .eq("slug", partnerSlug)
      .maybeSingle();
    if (existing) throw new Error(`Slug '${partnerSlug}' ist bereits vergeben.`);

    const { data: partner, error: insertError } = await supabase
      .from("partners")
      .insert({
        name: partnerName,
        slug: partnerSlug,
        contact_email: adminEmail,
        is_active: true,
      })
      .select("id, name")
      .single();
    if (insertError || !partner) {
      throw new Error(
        `Partner konnte nicht angelegt werden: ${insertError?.message ?? "unbekannt"}`,
      );
    }

    // 2) Auth-User erstellen oder bestehenden wiederverwenden
    let newUserId: string;
    const { data: lookupUsers } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existingUser = lookupUsers?.users?.find(
      (u) => u.email?.toLowerCase() === adminEmail,
    );

    if (existingUser) {
      newUserId = existingUser.id;
    } else {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUserData, error: createError } =
        await supabase.auth.admin.createUser({
          email: adminEmail,
          password: tempPassword,
          email_confirm: true,
        });
      if (createError || !newUserData?.user) {
        throw new Error(
          `Benutzer konnte nicht erstellt werden: ${createError?.message ?? "unbekannt"}`,
        );
      }
      newUserId = newUserData.user.id;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 3) partner_members-Eintrag (idempotent)
    const { error: memberError } = await supabase
      .from("partner_members")
      .upsert(
        {
          partner_id: partner.id,
          user_id: newUserId,
          partner_role: "partner_admin",
        },
        { onConflict: "partner_id,user_id" },
      );
    if (memberError) {
      console.error("[invite-partner-admin] partner_members upsert error", memberError);
      throw new Error(`Partner-Zuordnung fehlgeschlagen: ${memberError.message}`);
    }

    // 4) Profile (Name)
    if (adminName) {
      await supabase
        .from("profiles")
        .update({ contact_person: adminName })
        .eq("user_id", newUserId);
    }

    // 5) Passwort-Setz-Link erzeugen
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "recovery",
        email: adminEmail,
        options: { redirectTo },
      });
    if (linkError || !linkData?.properties?.action_link) {
      throw new Error("Passwort-Link konnte nicht erzeugt werden.");
    }
    const actionLink = linkData.properties.action_link;

    // 6) E-Mail versenden
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY nicht konfiguriert.");
    const resend = new Resend(RESEND_API_KEY);

    const fromAddress = resendFrom("AICONO Partner-Portal");
    const greeting = adminName ? `Hallo ${adminName},` : "Hallo,";

    const emailResponse = await resend.emails.send({
      from: fromAddress,
      to: [adminEmail],
      subject: `Ihr Partner-Zugang bei AICONO`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#1a365d 0%,#2d8a6e 100%);padding:30px;border-radius:10px 10px 0 0;">
    <h1 style="color:white;margin:0;font-size:24px;">Willkommen im AICONO Partner-Portal</h1>
    <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${partner.name}</div>
  </div>
  <div style="background:#f9fafb;padding:30px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb;border-top:none;">
    <p>${greeting}</p>
    <p>für <strong>${partner.name}</strong> wurde ein <strong>Partner-Admin-Konto</strong> bei AICONO eingerichtet.</p>
    <p>Bitte klicken Sie auf den Button, um ein Passwort zu vergeben und sich anzumelden:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${actionLink}" style="display:inline-block;background:#1a365d;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">
        Passwort festlegen &amp; Anmelden
      </a>
    </p>
    <p style="font-size:14px;color:#6b7280;">
      Dieser Link ist <strong>7 Tage</strong> gültig. Danach können Sie die Funktion „Passwort vergessen" auf der Anmeldeseite nutzen.
    </p>
    <p style="font-size:12px;color:#9ca3af;margin-top:12px;">
      Falls Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.
    </p>
  </div>
</body></html>`,
    });

    if (emailResponse.error) {
      console.error("[invite-partner-admin] Resend error", emailResponse.error);
      throw new Error(
        `E-Mail konnte nicht versendet werden: ${emailResponse.error.message ?? JSON.stringify(emailResponse.error)}`,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        partnerId: partner.id,
        userId: newUserId,
        emailId: emailResponse.data?.id ?? null,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error("Error in invite-partner-admin:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
