// Public-facing quote viewer: returns quote details + signed PDF URL by token.
// No auth required - access controlled by unguessable public_token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: quote, error } = await supabase
      .from("sales_quotes")
      .select("id, project_id, version, geraete_summe, installation_summe, total_einmalig, modul_summe_monatlich, pdf_storage_path, signed_at, rejected_at, rejection_reason, signer_name, viewed_at, created_at, sales_projects(kunde_name, kontakt_name, adresse, kunde_typ)")
      .eq("public_token", token)
      .maybeSingle();

    if (error || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate signed URL for PDF (1 hour)
    let pdf_url: string | null = null;
    if (quote.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from("sales-quotes")
        .createSignedUrl(quote.pdf_storage_path, 3600);
      pdf_url = signed?.signedUrl ?? null;
    }

    // Log "viewed" event (only first time per session - we keep it simple)
    if (!quote.viewed_at) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const ua = req.headers.get("user-agent") ?? null;
      await supabase.from("sales_quotes").update({ viewed_at: new Date().toISOString() }).eq("id", quote.id);
      await supabase.from("sales_quote_events").insert({
        quote_id: quote.id,
        event_type: "viewed",
        ip_address: ip,
        user_agent: ua,
      });
    }

    return new Response(JSON.stringify({ quote, pdf_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sales-public-quote error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
