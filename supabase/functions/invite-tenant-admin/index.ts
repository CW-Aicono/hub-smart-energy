import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";
import { checkInviteConflict } from "../_shared/invite-conflict.ts";

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify calling user is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callingUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !callingUser) throw new Error("Not authenticated");

    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id);

    const roles = (callerRoles || []).map((r: { role: string }) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("admin")) {
      throw new Error("Insufficient permissions");
    }

    const { tenantId, adminEmail, adminName, role, redirectTo } = await req.json();

    // Input validation (BSI CON.8 H1)
    if (!tenantId || typeof tenantId !== "string") throw new Error("Invalid tenantId");
    if (!adminEmail || typeof adminEmail !== "string" || !adminEmail.includes("@"))
      throw new Error("Invalid email");
    if (adminName && typeof adminName !== "string") throw new Error("Invalid adminName");
    if (role && !["admin", "user"].includes(role)) throw new Error("Invalid role");
    const assignedRole = role === "user" ? "user" : "admin";

    // Get tenant info for branding
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, branding")
      .eq("id", tenantId)
      .single();

    if (!tenant) throw new Error("Tenant not found");

    const tenantName = tenant.name;
    const branding = (tenant.branding as Record<string, string>) || {};
    const primaryColor = branding.primaryColor || "#1a365d";
    const accentColor = branding.accentColor || "#2d8a6e";

    // ── Uniqueness / cross-tenant guard ──
    const callerIsSuper = roles.includes("super_admin");
    const force = !!(await Promise.resolve()) ? false : false; // placeholder, see below
    // Re-read body fields we already parsed for force flag
    const bodyForce = (typeof (globalThis as unknown as { __reqBody?: { force?: boolean } }).__reqBody?.force === "boolean")
      ? (globalThis as unknown as { __reqBody: { force?: boolean } }).__reqBody.force
      : false;
    const conflict = await checkInviteConflict({
      supabase,
      email: adminEmail,
      intent: "tenant_invite",
      tenantId,
      force: !!bodyForce,
      callerIsSuper,
    });
    if (!conflict.ok) {
      return new Response(
        JSON.stringify({ success: false, error: conflict.error }),
        { status: conflict.status ?? 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let newUserId: string;
    if (conflict.existingUserId) {
      newUserId = conflict.existingUserId;
    } else {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: tempPassword,
        email_confirm: true,
      });
      if (createError || !newUserData?.user) {
        throw new Error(`Benutzer konnte nicht erstellt werden: ${createError?.message ?? "unbekannt"}`);
      }
      newUserId = newUserData.user.id;
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // Set tenant and display name on profile
    await supabase
      .from("profiles")
      .update({
        tenant_id: tenantId,
        contact_person: adminName || null,
      })
      .eq("user_id", newUserId);

    // Set role: ensure exactly one role row for this user.
    await supabase.from("user_roles").delete().eq("user_id", newUserId);
    await supabase.from("user_roles").insert({ user_id: newUserId, role: assignedRole });

    // Generate password-reset link (user sets their own password)
    const appUrl = redirectTo || `https://hub-smart-energy.lovable.app/set-password`;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: adminEmail,
      options: { redirectTo: appUrl },
    });

    if (linkError || !linkData?.properties?.action_link) {
      throw new Error("Passwort-Reset-Link konnte nicht generiert werden");
    }

    const actionLink = linkData.properties.action_link;

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const resend = new Resend(RESEND_API_KEY);
    const fromAddress = resendFrom(tenantName);
    console.log("[invite-tenant-admin] Sending email", {
      to: adminEmail,
      from: fromAddress,
      tenantId,
      userId: newUserId,
    });

    const emailResponse = await resend.emails.send({
      from: fromAddress,
      to: [adminEmail],
      subject: `Ihr Administrator-Konto bei ${tenantName}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Willkommen bei ${tenantName}</h1>
    <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">Administrator-Zugang</div>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hallo${adminName ? ` ${adminName}` : ""},</p>
    <p>Für Sie wurde ein <strong>Administrator-Konto</strong> bei <strong>${tenantName}</strong> eingerichtet.</p>
    <p>Bitte klicken Sie auf den folgenden Button, um ein Passwort für Ihr Konto zu vergeben und sich anzumelden:</p>
    <a href="${actionLink}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 16px 0;">
      Passwort festlegen &amp; Anmelden
    </a>
    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      Dieser Link ist <strong>7 Tage</strong> gültig. Danach können Sie die Funktion „Passwort vergessen" auf der Anmeldeseite nutzen.
    </p>
    <p style="font-size: 12px; color: #9ca3af; margin-top: 12px;">
      Falls Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.
    </p>
  </div>
</body>
</html>`,
    });

    if (emailResponse.error) {
      console.error("[invite-tenant-admin] Resend error", {
        to: adminEmail,
        from: fromAddress,
        error: emailResponse.error,
      });
      throw new Error(
        `E-Mail konnte nicht versendet werden: ${emailResponse.error.message || JSON.stringify(emailResponse.error)}`
      );
    }

    console.log("[invite-tenant-admin] Resend success", {
      to: adminEmail,
      messageId: emailResponse.data?.id,
    });

    // Record invitation entry so the UI can list pending/expired invites and re-send them.
    // Remove any prior pending invitation for this email+tenant first to avoid duplicates.
    const emailLower = adminEmail.toLowerCase();
    const { error: deletePrevError } = await supabase
      .from("user_invitations")
      .delete()
      .eq("tenant_id", tenantId)
      .ilike("email", emailLower)
      .is("accepted_at", null);
    if (deletePrevError) {
      console.warn("[invite-tenant-admin] Could not clean previous invitations", deletePrevError);
    }

    const { error: invitationError } = await supabase
      .from("user_invitations")
      .insert({
        tenant_id: tenantId,
        email: emailLower,
        role: assignedRole,
        invited_by: callingUser.id,
      });
    if (invitationError) {
      // Do not fail the whole flow – the user is already created and email sent.
      console.error("[invite-tenant-admin] Could not record invitation", invitationError);
    }

    return new Response(
      JSON.stringify({ success: true, userId: newUserId, emailId: emailResponse.data?.id ?? null }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in invite-tenant-admin:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
