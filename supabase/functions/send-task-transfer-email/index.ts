import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

interface TaskTransferRequest {
  contactName: string;
  contactEmail: string;
  taskTitle: string;
  taskDescription?: string;
  dueDate?: string;
  transferNote?: string;
  tenantId: string;
}

interface TenantBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

async function getTenantBranding(tenantId: string): Promise<TenantBranding> {
  const defaults: TenantBranding = {
    name: "Smart Energy Hub",
    logoUrl: null,
    primaryColor: "#1a365d",
    accentColor: "#2d8a6e",
  };

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

function buildTaskEmailHTML(req: TaskTransferRequest, branding: TenantBranding): string {
  const dueDateLine = req.dueDate
    ? `<p style="margin: 0 0 15px;"><strong>Fällig bis:</strong> ${new Date(req.dueDate).toLocaleDateString("de-DE")}</p>`
    : "";

  const noteLine = req.transferNote
    ? `<div style="background:#f1f5f9;border-left:3px solid ${branding.accentColor};padding:12px 16px;border-radius:4px;margin:0 0 15px;">
         <p style="margin:0;font-size:14px;color:#475569;"><strong>Übergabenotiz:</strong></p>
         <p style="margin:4px 0 0;font-size:14px;color:#334155;">${req.transferNote}</p>
       </div>`
    : "";

  const descLine = req.taskDescription
    ? `<p style="margin: 0 0 15px; color: #4b5563;">${req.taskDescription}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Neue Aufgabe zugewiesen</h1>
    <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">${branding.name}</div>
  </div>
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin: 0 0 15px;">Hallo ${req.contactName},</p>
    <p style="margin: 0 0 15px;">Ihnen wurde folgende Aufgabe zugewiesen:</p>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 20px;">
      <h2 style="margin:0 0 10px;font-size:18px;color:${branding.primaryColor}">${req.taskTitle}</h2>
      ${descLine}
      ${dueDateLine}
    </div>
    ${noteLine}
    <p style="margin: 15px 0 0; font-size: 12px; color: #9ca3af;">
      Diese E-Mail wurde automatisch von ${branding.name} versendet.
    </p>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(RESEND_API_KEY);
    const body: TaskTransferRequest = await req.json();

    if (!body.contactEmail || !body.taskTitle) {
      throw new Error("Missing required fields: contactEmail and taskTitle");
    }

    const branding = await getTenantBranding(body.tenantId);

    const emailResponse = await resend.emails.send({
      from: resendFrom(branding.name),
      to: [body.contactEmail],
      subject: `Aufgabe: ${body.taskTitle} – ${branding.name}`,
      html: buildTaskEmailHTML(body, branding),
    });

    console.log("Task transfer email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-task-transfer-email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
