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

    // Query each status type with delay to avoid rate limiting
    const statusesToCheck = ["open", "paid", "paidoff", "overdue", "voided"];
    let updated = 0;
    const summaryByStatus: Record<string, { count: number; totalAmount: number; openAmount: number }> = {};
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (const voucherStatus of statusesToCheck) {
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const url = `${LEXWARE_BASE}/voucherlist?voucherType=invoice&voucherStatus=${voucherStatus}&page=${page}&size=250`;
        const res = await fetch(url, { headers: lexHeaders });

        if (!res.ok) {
          const errBody = await res.text();
          console.log(`Voucherlist ${voucherStatus} page ${page}: HTTP ${res.status} - ${errBody}`);
          if (res.status === 429) {
            // Wait and retry once
            await sleep(2000);
            const retryRes = await fetch(url, { headers: lexHeaders });
            if (!retryRes.ok) { await retryRes.text(); break; }
            const retryData = await retryRes.json();
            const retryContent = retryData.content || [];
            // Process retry content same as below
            if (page === 0 && retryContent.length > 0) {
              console.log(`[DEBUG] Sample ${voucherStatus} voucher:`, JSON.stringify(retryContent[0], null, 2));
            }
            for (const voucher of retryContent) {
              if (!summaryByStatus[voucherStatus]) summaryByStatus[voucherStatus] = { count: 0, totalAmount: 0, openAmount: 0 };
              summaryByStatus[voucherStatus].count++;
              summaryByStatus[voucherStatus].totalAmount += Number(voucher.totalAmount ?? 0);
              summaryByStatus[voucherStatus].openAmount += Number(voucher.openAmount ?? 0);
              const localInv = lexIdMap.get(voucher.voucherId);
              if (!localInv) continue;
              const mappedStatus = STATUS_MAP[voucherStatus] || localInv.status;
              if (mappedStatus !== localInv.status) {
                await supabase.from("tenant_invoices").update({ status: mappedStatus }).eq("id", localInv.id);
                updated++;
              }
              lexIdMap.delete(voucher.voucherId);
            }
            hasMore = !retryData.last && retryContent.length > 0;
            page++;
            continue;
          }
          break;
        }

        const data = await res.json();
        const content = data.content || [];

        // DEBUG: Log first voucher to see all available fields
        if (page === 0 && content.length > 0) {
          console.log(`[DEBUG] Sample ${voucherStatus} voucher:`, JSON.stringify(content[0], null, 2));
        }

        for (const voucher of content) {
          if (!summaryByStatus[voucherStatus]) summaryByStatus[voucherStatus] = { count: 0, totalAmount: 0, openAmount: 0 };
          summaryByStatus[voucherStatus].count++;
          summaryByStatus[voucherStatus].totalAmount += Number(voucher.totalAmount ?? 0);
          summaryByStatus[voucherStatus].openAmount += Number(voucher.openAmount ?? 0);

          const localInv = lexIdMap.get(voucher.voucherId);
          if (!localInv) continue;

          const mappedStatus = STATUS_MAP[voucherStatus] || localInv.status;
          if (mappedStatus !== localInv.status) {
            await supabase.from("tenant_invoices").update({ status: mappedStatus }).eq("id", localInv.id);
            updated++;
            console.log(`Updated ${localInv.id}: ${localInv.status} -> ${mappedStatus}`);
          }

          lexIdMap.delete(voucher.voucherId);
        }

        hasMore = !data.last && content.length > 0;
        page++;
      }

      // Stop early if all invoices are matched
      if (lexIdMap.size === 0 && Object.keys(summaryByStatus).length >= statusesToCheck.length) break;

      // Delay between status types to avoid rate limiting
      await sleep(500);
    }

    console.log("[DEBUG] Summary by status:", JSON.stringify(summaryByStatus, null, 2));

    return new Response(
      JSON.stringify({ success: true, updated, checked: invoices.length, summaryByStatus }),
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
