import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

    const body = await req.json();

    const json = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    // ── MODE: Retrieve a fresh sign-in link by token (no auth needed) ──
    // The token is NOT consumed here – only after the password was saved (consumeInvite).
    if (body.getInviteLink) {
      const { tokenId } = body;
      if (!tokenId || typeof tokenId !== "string") return json({ success: false, code: "not_found", error: "Einladungslink unvollständig." }, 400);

      const { data: tokenRow } = await supabase.from("invite_tokens").select("*").eq("id", tokenId).maybeSingle();
      if (!tokenRow) return json({ success: false, code: "not_found", error: "Einladungslink nicht gefunden." }, 404);
      if (tokenRow.used_at) return json({ success: false, code: "used", error: "Dieser Einladungslink wurde bereits verwendet." }, 410);
      if (new Date(tokenRow.expires_at) < new Date()) return json({ success: false, code: "expired", error: "Dieser Einladungslink ist abgelaufen." }, 410);

      // Recovery links are single-use → generate a fresh one on every click.
      let redirectTo = `${resolveOrigin(null)}/set-password`;
      try {
        const rt = new URL(tokenRow.action_link).searchParams.get("redirect_to");
        if (rt) redirectTo = `${resolveOrigin(rt)}/set-password`;
      } catch { /* keep default */ }
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery", email: tokenRow.email, options: { redirectTo },
      });
      if (linkError || !linkData?.properties?.action_link) {
        return json({ success: false, code: "error", error: "Anmeldelink konnte nicht erzeugt werden." }, 500);
      }
      return json({ success: true, actionLink: linkData.properties.action_link, email: tokenRow.email });
    }

    // ── MODE: Mark invite as used after the password was saved (auth: invited user) ──
    if (body.consumeInvite) {
      const authH = req.headers.get("Authorization");
      if (!authH || typeof body.tokenId !== "string") return json({ success: false }, 400);
      const { data: { user } } = await supabase.auth.getUser(authH.replace("Bearer ", ""));
      if (!user?.email) return json({ success: false }, 401);
      await supabase.from("invite_tokens").update({ used_at: new Date().toISOString() })
        .eq("id", body.tokenId).ilike("email", user.email).is("used_at", null);
      return json({ success: true });
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

    // ── MODE: Resend invitation / access link for an existing user (roles stay untouched) ──
    if (body.resendInvite) {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) return json({ success: false, error: "E-Mail fehlt." }, 400);
      const callerIsSuper = roles.includes("super_admin");
      const { data: target } = await supabase.from("profiles").select("user_id, tenant_id, contact_person").ilike("email", email).maybeSingle();
      if (!callerIsSuper) {
        // Kunden-Admin: only users of the own tenant (home tenant or membership)
        let allowed = !!target && !!tenantId && target.tenant_id === tenantId;
        if (!allowed && target && tenantId) {
          const { data: m } = await supabase.from("user_tenant_memberships").select("user_id").eq("user_id", target.user_id).eq("tenant_id", tenantId).maybeSingle();
          allowed = !!m;
        }
        if (!allowed) return json({ success: false, error: "Nur Benutzer der eigenen Organisation." }, 403);
      }
      const origin = resolveOrigin(typeof redirectTo === "string" ? redirectTo : req.headers.get("Origin"));
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery", email, options: { redirectTo: `${origin}/set-password` },
      });
      if (linkError || !linkData?.properties?.action_link) return json({ success: false, error: "Für diese E-Mail existiert kein Konto." }, 404);
      // Invalidate older open links
      await supabase.from("invite_tokens").update({ used_at: new Date().toISOString() }).ilike("email", email).is("used_at", null);
      const { data: tokenRow, error: tErr } = await supabase.from("invite_tokens")
        .insert({ action_link: linkData.properties.action_link, email }).select("id").single();
      if (tErr || !tokenRow) return json({ success: false, error: "Einladung konnte nicht gespeichert werden." }, 500);
      const url = `${origin}/accept-invite?t=${tokenRow.id}`;
      const emailSent = await sendInvitationEmail(supabase, email, target?.contact_person, url, target?.tenant_id ?? null, body.role || "user");
      return json({ success: true, emailSent });
    }

    // ── MODE 1: Direct invite (new flow – no invitation record needed) ──
    if (body.directInvite) {
      const { email, name, role, tenantId: overrideTenantId, force, customRoleId } = body;
      if (!email) throw new Error("Missing email");

      const callerIsSuper = roles.includes("super_admin");
      if (overrideTenantId && overrideTenantId !== tenantId && !callerIsSuper) {
        return new Response(
          JSON.stringify({ success: false, error: "Nur Benutzer der eigenen Organisation können eingeladen werden." }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const effectiveTenantId = overrideTenantId || tenantId;
      const isSuperAdminInvite = role === "super_admin";

      // Only super_admins may invite super_admins
      if (isSuperAdminInvite && !callerIsSuper) {
        return new Response(
          JSON.stringify({ success: false, error: "Nur Portal-Admins dürfen Plattform-Administratoren einladen." }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // ── Uniqueness / cross-tenant guard ──
      const conflict = await checkInviteConflict({
        supabase,
        email,
        intent: isSuperAdminInvite ? "super_admin_invite" : "tenant_invite",
        tenantId: effectiveTenantId ?? null,
        force: !!force,
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
        // Existing user the conflict checker explicitly accepted (same tenant, orphan, or forced override)
        newUserId = conflict.existingUserId;
      } else {
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });
        if (createError || !newUserData?.user) {
          throw new Error(`Benutzer konnte nicht erstellt werden: ${createError?.message ?? "unbekannt"}`);
        }
        newUserId = newUserData.user.id;
        // Wait for handle_new_user trigger
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      // Update profile with tenant + name.
      // Super-admin invites: tenant_id MUST be NULL (Super-Admin/Tenant separation).
      const profileTenantId = isSuperAdminInvite ? null : (effectiveTenantId || null);
      // custom_role_id only applies to non-super-admin tenant invites.
      const profileCustomRoleId = isSuperAdminInvite
        ? null
        : (typeof customRoleId === "string" && customRoleId ? customRoleId : null);
      await supabase
        .from("profiles")
        .update({
          tenant_id: profileTenantId,
          contact_person: name || null,
          custom_role_id: profileCustomRoleId,
        })
        .eq("user_id", newUserId);

      // Set role: ensure exactly one role row for this user.
      if (role === "admin" || role === "super_admin" || role === "user") {
        await supabase.from("user_roles").delete().eq("user_id", newUserId);
        await supabase.from("user_roles").insert({ user_id: newUserId, role });
      }

      // Generate password-reset link
      const appSetPasswordUrl = `${resolveOrigin(typeof redirectTo === "string" ? redirectTo : req.headers.get("Origin"))}/set-password`;
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

    const appSetPasswordUrl = `${resolveOrigin(typeof redirectTo === "string" ? redirectTo : req.headers.get("Origin"))}/set-password`;
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

/** Only production/staging hosts are allowed in mail links – never preview hosts. */
function resolveOrigin(candidate: string | null | undefined): string {
  const fallback = (Deno.env.get("APP_URL") || "https://hub-smart-energy.lovable.app").replace(/\/$/, "");
  if (!candidate) return fallback;
  try {
    const u = new URL(candidate);
    const h = u.hostname;
    if (u.protocol === "https:" && (h === "aicono.org" || h.endsWith(".aicono.org") || h === "hub-smart-energy.lovable.app")) return u.origin;
  } catch { /* ignore */ }
  return fallback;
}

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
