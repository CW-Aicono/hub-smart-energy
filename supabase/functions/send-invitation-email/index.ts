import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";

interface InvitationEmailRequest {
  email: string;
  inviteLink: string;
  invitedByEmail?: string;
  role: "admin" | "user";
  tenantId?: string;
}

interface TenantBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

async function getTenantBranding(tenantId: string | undefined): Promise<TenantBranding> {
  const defaults: TenantBranding = {
    name: "Smart Energy Hub",
    logoUrl: null,
    primaryColor: "#1a365d",
    accentColor: "#2d8a6e",
  };

  if (!tenantId) return defaults;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data } = await supabase
      .from("tenants")
      .select("name, logo_url, branding")
      .eq("id", tenantId)
      .single();

    if (!data) return defaults;

    const branding = (data.branding as Record<string, string>) || {};
    return {
      name: data.name || defaults.name,
      logoUrl: data.logo_url || null,
      primaryColor: branding.primaryColor || defaults.primaryColor,
      accentColor: branding.accentColor || defaults.accentColor,
    };
  } catch {
    return defaults;
  }
}

function buildInvitationHTML(
  email: string,
  inviteLink: string,
  invitedByEmail: string | undefined,
  roleLabel: string,
  branding: TenantBranding,
): string {
  const logoTag = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.name}" style="max-height:48px;max-width:150px;object-fit:contain;border-radius:6px" />`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <table style="width:100%"><tr>
      <td style="vertical-align:middle">
        <h1 style="color: white; margin: 0; font-size: 24px;">Sie wurden eingeladen!</h1>
        <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">${branding.name}</div>
      </td>
      ${logoTag ? `<td style="text-align:right;vertical-align:middle">${logoTag}</td>` : ""}
    </tr></table>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin: 0 0 15px;">Hallo,</p>
    <p style="margin: 0 0 15px;">
      ${invitedByEmail ? `<strong>${invitedByEmail}</strong> hat Sie eingeladen, <strong>${branding.name}</strong> beizutreten.` : `Sie wurden eingeladen, <strong>${branding.name}</strong> beizutreten.`}
    </p>
    <p style="margin: 0 0 15px;">
      Ihre Rolle: <strong>${roleLabel}</strong>
    </p>
    <p style="margin: 0 0 25px;">
      Klicken Sie auf den folgenden Button, um Ihr Konto zu erstellen:
    </p>
    <a href="${inviteLink}" style="display: inline-block; background: ${branding.primaryColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500;">
      Einladung annehmen
    </a>
    <p style="margin: 25px 0 0; font-size: 14px; color: #6b7280;">
      Dieser Link ist 7 Tage gültig.
    </p>
    <p style="margin: 15px 0 0; font-size: 12px; color: #9ca3af;">
      Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.
    </p>
  </div>
  <div style="text-align:center;padding-top:16px">
    <span style="font-size:11px;color:#94a3b8">${branding.name}</span>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-invitation-email function called");
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      throw new Error("RESEND_API_KEY is not configured");
    }
    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "info@aicono.org";

    const resend = new Resend(RESEND_API_KEY);
    const { email, inviteLink, invitedByEmail, role, tenantId }: InvitationEmailRequest = await req.json();

    console.log(`Sending invitation email to ${email} with role ${role}`);

    if (!email || !inviteLink) {
      throw new Error("Missing required fields: email and inviteLink are required");
    }

    const branding = await getTenantBranding(tenantId);
    const roleLabel = role === "admin" ? "Administrator" : "Benutzer";

    const emailResponse = await resend.emails.send({
      from: `${branding.name} <${FROM_EMAIL}>`,
      to: [email],
      subject: `Einladung – ${branding.name}`,
      html: buildInvitationHTML(email, inviteLink, invitedByEmail, roleLabel, branding),
    });

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-invitation-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
