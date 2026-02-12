import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvitationEmailRequest {
  email: string;
  inviteLink: string;
  invitedByEmail?: string;
  role: "admin" | "user";
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-invitation-email function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resend = new Resend(RESEND_API_KEY);
    const { email, inviteLink, invitedByEmail, role }: InvitationEmailRequest = await req.json();

    console.log(`Sending invitation email to ${email} with role ${role}`);

    // Validate required fields
    if (!email || !inviteLink) {
      console.error("Missing required fields: email or inviteLink");
      throw new Error("Missing required fields: email and inviteLink are required");
    }

    const roleLabel = role === "admin" ? "Administrator" : "Benutzer";

    const emailResponse = await resend.emails.send({
      from: "Einladung <noreply@mailtest.my-ips.de>",
      to: [email],
      subject: "Sie wurden eingeladen",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1a365d 0%, #2d8a6e 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Sie wurden eingeladen!</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="margin: 0 0 15px;">Hallo,</p>
              <p style="margin: 0 0 15px;">
                ${invitedByEmail ? `<strong>${invitedByEmail}</strong> hat Sie eingeladen, der Plattform beizutreten.` : "Sie wurden eingeladen, der Plattform beizutreten."}
              </p>
              <p style="margin: 0 0 15px;">
                Ihre Rolle: <strong>${roleLabel}</strong>
              </p>
              <p style="margin: 0 0 25px;">
                Klicken Sie auf den folgenden Button, um Ihr Konto zu erstellen:
              </p>
              <a href="${inviteLink}" style="display: inline-block; background: #1a365d; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                Einladung annehmen
              </a>
              <p style="margin: 25px 0 0; font-size: 14px; color: #6b7280;">
                Dieser Link ist 7 Tage gültig.
              </p>
              <p style="margin: 15px 0 0; font-size: 12px; color: #9ca3af;">
                Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("Error in send-invitation-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
