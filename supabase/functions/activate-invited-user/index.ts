import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

    const body = await req.json();

    // ── MODE: Retrieve invite action_link by token (no auth needed) ──
    // Called from /accept-invite page when user clicks the button
    if (body.getInviteLink) {
      const { tokenId } = body;
      if (!tokenId) throw new Error("Missing tokenId");

      const { data: tokenRow, error: tokenError } = await supabase
        .from("invite_tokens")
        .select("*")
        .eq("id", tokenId)
        .single();

      if (tokenError || !tokenRow) {
        return new Response(
          JSON.stringify({ success: false, error: "Einladungslink nicht gefunden oder abgelaufen." }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (tokenRow.used_at) {
        return new Response(
          JSON.stringify({ success: false, error: "Dieser Einladungslink wurde bereits verwendet." }),
          { status: 410, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ success: false, error: "Dieser Einladungslink ist abgelaufen." }),
          { status: 410, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Mark as used
      await supabase
        .from("invite_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenId);

      return new Response(
        JSON.stringify({ success: true, actionLink: tokenRow.action_link, email: tokenRow.email }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── All other modes require authentication ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callingUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !callingUser) throw new Error("Not authenticated");

    // Check if calling user is admin or super_admin
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id);

    const roles = (callerRoles || []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      throw new Error("Insufficient permissions");
    }

    // Get caller's tenant_id
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", callingUser.id)
      .single();
    const tenantId = callerProfile?.tenant_id;

    const { redirectTo } = body;

    // ── MODE 1: Direct invite (new flow – no invitation record needed) ──
    if (body.directInvite) {
      const { email, name, role, tenantId: overrideTenantId } = body;
      if (!email) throw new Error("Missing email");

      const effectiveTenantId = overrideTenantId || tenantId;

      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      let newUserId: string;

      if (createError) {
        if (createError.message?.toLowerCase().includes("already") || createError.message?.toLowerCase().includes("exists")) {
          // User already exists – find them and reuse
          const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          if (listError) throw new Error("Benutzer konnte nicht gefunden werden");
          const existingUser = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (!existingUser) throw new Error("Benutzer mit dieser E-Mail konnte nicht gefunden werden.");
          newUserId = existingUser.id;
        } else {
          throw new Error(`Benutzer konnte nicht erstellt werden: ${createError.message}`);
        }
      } else {
        newUserId = newUserData.user.id;
        // Wait for trigger
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      // Update profile with tenant + name
      await supabase
        .from("profiles")
        .update({
          tenant_id: effectiveTenantId || null,
          contact_person: name || null,
        })
        .eq("user_id", newUserId);

      // Set role
      if (role === "admin" || role === "super_admin") {
        await supabase
          .from("user_roles")
          .update({ role })
          .eq("user_id", newUserId);
      }

      // Generate password-reset link
      const appSetPasswordUrl = redirectTo || `https://hub-smart-energy.lovable.app/set-password`;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: appSetPasswordUrl },
      });

      if (linkError || !linkData?.properties?.action_link) {
        throw new Error("Passwort-Link konnte nicht generiert werden");
      }

      // Store action_link in DB and send UUID-based URL to protect against email scanners
      const { data: tokenRow, error: tokenInsertError } = await supabase
        .from("invite_tokens")
        .insert({ action_link: linkData.properties.action_link, email })
        .select("id")
        .single();

      if (tokenInsertError || !tokenRow) {
        throw new Error("Invite-Token konnte nicht gespeichert werden");
      }

      // The email gets a link to our own page, not directly to Supabase
      const appOrigin = new URL(appSetPasswordUrl).origin;
      const safeInviteUrl = `${appOrigin}/accept-invite?t=${tokenRow.id}`;

      // Send email
      const emailSent = await sendInvitationEmail(supabase, email, name, safeInviteUrl, effectiveTenantId, role || "user");

      return new Response(
        JSON.stringify({ success: true, userId: newUserId, emailSent, inviteUrl: safeInviteUrl }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── MODE 2: Legacy invitation record flow ──
    const { invitationId } = body;
    if (!invitationId) throw new Error("Missing invitationId");

    const { data: invitation, error: invError } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (invError || !invitation) throw new Error("Invitation not found");
    if (invitation.accepted_at) throw new Error("Invitation already accepted");

    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
      email: invitation.email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
        throw new Error("Ein Benutzer mit dieser E-Mail existiert bereits.");
      }
      throw new Error(`Benutzer konnte nicht erstellt werden: ${createError.message}`);
    }

    const newUserId = newUserData.user.id;

    await new Promise(resolve => setTimeout(resolve, 500));

    if (tenantId) {
      await supabase
        .from("profiles")
        .update({ tenant_id: tenantId })
        .eq("user_id", newUserId);
    }

    if (invitation.role === "admin") {
      await supabase
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", newUserId);
    }

    await supabase
      .from("user_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId);

    const appSetPasswordUrl = redirectTo || `https://hub-smart-energy.lovable.app/set-password`;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: invitation.email,
      options: { redirectTo: appSetPasswordUrl },
    });

    let emailSent = false;
    if (!linkError && linkData?.properties?.action_link) {
      // Store action_link in DB and send UUID-based URL
      const { data: tokenRow } = await supabase
        .from("invite_tokens")
        .insert({ action_link: linkData.properties.action_link, email: invitation.email })
        .select("id")
        .single();

      if (tokenRow) {
        const appOrigin = new URL(appSetPasswordUrl).origin;
        const safeInviteUrl = `${appOrigin}/accept-invite?t=${tokenRow.id}`;
        emailSent = await sendInvitationEmail(supabase, invitation.email, null, safeInviteUrl, tenantId, invitation.role);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUserId,
        emailSent,
        message: emailSent
          ? "Benutzer erstellt. Eine E-Mail zum Setzen des Passworts wurde versendet."
          : "Benutzer erstellt. Bitte teilen Sie dem Nutzer mit, die 'Passwort vergessen'-Funktion zu verwenden.",
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in activate-invited-user:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

async function sendInvitationEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
  name: string | null | undefined,
  actionLink: string,
  tenantId: string | null | undefined,
  role: string,
): Promise<boolean> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return false;

  try {
    let tenantName = "Smart Energy Hub";
    let primaryColor = "#1a365d";
    let accentColor = "#2d8a6e";

    if (tenantId) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, branding")
        .eq("id", tenantId)
        .single();
      if (tenant) {
        tenantName = tenant.name || tenantName;
        const branding = (tenant.branding as Record<string, string>) || {};
        primaryColor = branding.primaryColor || primaryColor;
        accentColor = branding.accentColor || accentColor;
      }
    }

    const { Resend } = await import("npm:resend@2.0.0");
    const resend = new Resend(RESEND_API_KEY);
    const roleLabel = role === "admin" ? "Administrator" : "Benutzer";

    await resend.emails.send({
      from: resendFrom(tenantName),
      to: [email],
      subject: `Ihr Konto wurde erstellt – ${tenantName}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Sie wurden eingeladen!</h1>
    <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">${tenantName} – ${roleLabel}</div>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hallo${name ? ` ${name}` : ""},</p>
    <p>Für Sie wurde ein Konto bei <strong>${tenantName}</strong> erstellt.</p>
    <p>Bitte klicken Sie auf den folgenden Button, um ein Passwort zu vergeben und sich anzumelden:</p>
    <a href="${actionLink}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 16px 0;">
      Passwort festlegen &amp; Anmelden
    </a>
    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      Dieser Link ist <strong>7 Tage</strong> gültig.
    </p>
    <p style="font-size: 12px; color: #9ca3af; margin-top: 12px;">
      Falls Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.
    </p>
  </div>
</body>
</html>`,
    });
    return true;
  } catch (emailErr) {
    console.error("Error sending invitation email:", emailErr);
    return false;
  }
}

serve(handler);
