import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify calling user is authenticated and is admin
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

    const { invitationId, redirectTo } = await req.json();
    if (!invitationId) throw new Error("Missing invitationId");

    // Fetch the invitation
    const { data: invitation, error: invError } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (invError || !invitation) throw new Error("Invitation not found");
    if (invitation.accepted_at) throw new Error("Invitation already accepted");

    // Get the caller's tenant_id for assigning to the new user
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", callingUser.id)
      .single();

    const tenantId = callerProfile?.tenant_id;

    // Generate a secure temporary password
    const tempPassword = crypto.randomUUID() + "Aa1!";

    // Create the user via admin API
    const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
      email: invitation.email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm the email since admin is activating
    });

    if (createError) {
      // Check if user already exists
      if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
        throw new Error("Ein Benutzer mit dieser E-Mail existiert bereits.");
      }
      throw new Error(`Benutzer konnte nicht erstellt werden: ${createError.message}`);
    }

    const newUserId = newUserData.user.id;

    // The handle_new_user trigger should auto-create the profile,
    // but we need to update it with the tenant_id
    if (tenantId) {
      // Wait briefly for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 500));

      await supabase
        .from("profiles")
        .update({ tenant_id: tenantId })
        .eq("user_id", newUserId);
    }

    // Assign the invited role
    if (invitation.role === "admin") {
      await supabase
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", newUserId);
    }

    // Mark invitation as accepted
    await supabase
      .from("user_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId);

    // Send password reset email so user can set their own password
    // We use the admin generateLink method to get a recovery link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: invitation.email,
      options: {
        redirectTo: redirectTo || `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/profile`,
      },
    });

    // Send the recovery email via Resend
    let emailSent = false;
    if (!linkError && linkData?.properties?.action_link) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        try {
          // Get tenant branding for the email
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

          await resend.emails.send({
            from: `${tenantName} <noreply@mailtest.my-ips.de>`,
            to: [invitation.email],
            subject: `Ihr Konto wurde erstellt – ${tenantName}`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Ihr Konto wurde erstellt</h1>
    <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">${tenantName}</div>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hallo,</p>
    <p>Ihr Konto bei <strong>${tenantName}</strong> wurde von einem Administrator erstellt.</p>
    <p>Bitte klicken Sie auf den folgenden Button, um Ihr Passwort festzulegen:</p>
    <a href="${linkData.properties.action_link}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 10px 0;">
      Passwort festlegen
    </a>
    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      Dieser Link ist 24 Stunden gültig.
    </p>
  </div>
</body>
</html>`,
          });
          emailSent = true;
        } catch (emailErr) {
          console.error("Error sending activation email:", emailErr);
        }
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

serve(handler);
