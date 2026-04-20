// Public endpoint to sign or reject a quote by token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token, action, signer_name, signer_email, signature_data, rejection_reason } = body;

    if (!token || !["sign", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: quote } = await supabase
      .from("sales_quotes")
      .select("id, project_id, signed_at, rejected_at")
      .eq("public_token", token)
      .maybeSingle();

    if (!quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quote.signed_at || quote.rejected_at) {
      return new Response(JSON.stringify({ error: "Angebot wurde bereits bearbeitet" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    const now = new Date().toISOString();

    if (action === "sign") {
      if (!signer_name || !signer_email || !signature_data) {
        return new Response(JSON.stringify({ error: "Name, E-Mail und Unterschrift sind erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("sales_quotes")
        .update({
          signed_at: now,
          signature_data: { png_base64: signature_data, signed_at: now },
          signer_name,
          signer_email,
          signer_ip: ip,
          signer_user_agent: ua,
        })
        .eq("id", quote.id);

      await supabase.from("sales_quote_events").insert({
        quote_id: quote.id,
        event_type: "signed",
        ip_address: ip,
        user_agent: ua,
        metadata: { signer_name, signer_email },
      });

      // Update project status to "accepted"
      await supabase
        .from("sales_projects")
        .update({ status: "accepted", accepted_at: now })
        .eq("id", quote.project_id);

      return new Response(JSON.stringify({ ok: true, status: "signed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // reject
    await supabase
      .from("sales_quotes")
      .update({ rejected_at: now, rejection_reason: rejection_reason ?? null })
      .eq("id", quote.id);

    await supabase.from("sales_quote_events").insert({
      quote_id: quote.id,
      event_type: "rejected",
      ip_address: ip,
      user_agent: ua,
      metadata: { reason: rejection_reason ?? null },
    });

    await supabase
      .from("sales_projects")
      .update({ status: "rejected" })
      .eq("id", quote.project_id);

    return new Response(JSON.stringify({ ok: true, status: "rejected" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sales-sign-quote error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
