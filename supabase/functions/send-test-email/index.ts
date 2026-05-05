import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to } = await req.json().catch(() => ({ to: "christvs@t-online.de" }));
    const recipient = to || "christvs@t-online.de";

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY missing");

    const resend = new Resend(apiKey);
    const from = resendFrom("AICONO EMS");

    console.log(`[send-test-email] from="${from}" to="${recipient}"`);

    const result = await resend.emails.send({
      from,
      to: [recipient],
      subject: "AICONO EMS – Testmail (Resend-Konfiguration)",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width:560px; margin:0 auto; padding:24px;">
          <h2 style="color:#0f6fb3;">Testmail erfolgreich</h2>
          <p>Diese Mail bestätigt, dass der neue Resend-Account und die verifizierte Domain
          <strong>staging.aicono.org</strong> korrekt konfiguriert sind.</p>
          <p>Absender: <code>${from}</code></p>
          <p style="color:#666;font-size:12px;margin-top:32px;">AICONO EMS – automatisch generierte Testnachricht</p>
        </div>
      `,
    });

    console.log("[send-test-email] resend response:", JSON.stringify(result));

    if (result.error) {
      return new Response(JSON.stringify({ ok: false, error: result.error }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: result.data?.id, from, to: recipient }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-test-email] error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
