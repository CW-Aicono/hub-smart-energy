import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const LEXWARE_BASE = "https://api.lexware.io/v1";

const STATUS_MAP: Record<string, string> = {
  draft: "draft",
  open: "sent",
  paid: "paid",
  paidoff: "paid",
  overdue: "overdue",
  voided: "voided",
};

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const LEXWARE_API_KEY = Deno.env.get("LEXWARE_API_KEY");
  if (!LEXWARE_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "LEXWARE_API_KEY not configured" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const headers = {
    Authorization: `Bearer ${LEXWARE_API_KEY}`,
    Accept: "application/json",
  };

  try {
    // Fetch all invoices that have been sent to Lexware
    const { data: invoices, error: dbErr } = await supabase
      .from("tenant_invoices")
      .select("id, lexware_invoice_id, status")
      .not("lexware_invoice_id", "is", null);

    if (dbErr) throw dbErr;
    if (!invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, checked: 0 }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let updated = 0;

    for (const inv of invoices) {
      try {
        const res = await fetch(`${LEXWARE_BASE}/invoices/${inv.lexware_invoice_id}`, { headers });
        if (!res.ok) continue;

        const lexData = await res.json();
        const lexStatus = lexData.voucherStatus || lexData.status;
        const mappedStatus = STATUS_MAP[lexStatus] || inv.status;

        if (mappedStatus !== inv.status) {
          await supabase
            .from("tenant_invoices")
            .update({ status: mappedStatus })
            .eq("id", inv.id);
          updated++;
        }
      } catch {
        // Skip individual failures silently
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated, checked: invoices.length }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
