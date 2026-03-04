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

  const lexHeaders = {
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

    // Build a map of lexware_invoice_id -> local invoice
    const lexIdMap = new Map<string, { id: string; status: string }>();
    for (const inv of invoices) {
      lexIdMap.set(inv.lexware_invoice_id, { id: inv.id, status: inv.status });
    }

    // Use voucherlist endpoint to fetch statuses in bulk
    // Query each status type to find matching invoices
    const statusesToCheck = ["draft", "open", "paid", "paidoff", "overdue", "voided"];
    let updated = 0;

    for (const voucherStatus of statusesToCheck) {
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const url = `${LEXWARE_BASE}/voucherlist?voucherType=invoice&voucherStatus=${voucherStatus}&page=${page}&size=250`;
        const res = await fetch(url, { headers: lexHeaders });

        if (!res.ok) {
          const errBody = await res.text();
          console.log(`Voucherlist ${voucherStatus} page ${page}: HTTP ${res.status} - ${errBody}`);
          break;
        }

        const data = await res.json();
        const content = data.content || [];

        for (const voucher of content) {
          const localInv = lexIdMap.get(voucher.voucherId);
          if (!localInv) continue;

          const mappedStatus = STATUS_MAP[voucherStatus] || localInv.status;
          if (mappedStatus !== localInv.status) {
            await supabase
              .from("tenant_invoices")
              .update({ status: mappedStatus })
              .eq("id", localInv.id);
            updated++;
            console.log(`Updated ${localInv.id}: ${localInv.status} -> ${mappedStatus}`);
          }

          // Remove from map so we don't check again
          lexIdMap.delete(voucher.voucherId);
        }

        hasMore = !data.last && content.length > 0;
        page++;
      }

      // Stop early if all invoices are matched
      if (lexIdMap.size === 0) break;
    }

    return new Response(
      JSON.stringify({ success: true, updated, checked: invoices.length }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Sync error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
