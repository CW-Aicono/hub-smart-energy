import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const LEXWARE_BASE = "https://api.lexware.io/v1";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const LEXWARE_API_KEY = Deno.env.get("LEXWARE_API_KEY");
  if (!LEXWARE_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "LEXWARE_API_KEY not configured" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const headers = {
    Authorization: `Bearer ${LEXWARE_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    const body = await req.json();
    const { action, invoiceIds } = body;

    if (action === "send-invoices") {
      if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        throw new Error("invoiceIds array required");
      }

      // Fetch invoices with tenant data
      const { data: invoices, error: invErr } = await supabase
        .from("tenant_invoices")
        .select("*, tenants(id, name, street, house_number, city, postal_code, contact_email, lexware_contact_id)")
        .in("id", invoiceIds);
      if (invErr) throw invErr;
      if (!invoices || invoices.length === 0) throw new Error("No invoices found");

      const results: any[] = [];

      for (const inv of invoices) {
        try {
          // Skip already synced
          if (inv.lexware_invoice_id) {
            results.push({ invoiceId: inv.id, status: "skipped", reason: "already_synced", lexwareId: inv.lexware_invoice_id });
            continue;
          }

          const tenant = inv.tenants;
          if (!tenant) {
            results.push({ invoiceId: inv.id, status: "error", reason: "no_tenant" });
            continue;
          }

          // 1. Ensure contact exists in Lexware
          let lexwareContactId = tenant.lexware_contact_id;
          if (!lexwareContactId) {
            lexwareContactId = await ensureContact(headers, supabase, tenant);
          }

          // 2. Create invoice in Lexware
          const lineItems = buildLineItems(inv);
          const lexwareInvoice = {
            voucherDate: (inv.period_end || new Date().toISOString().split("T")[0]) + "T00:00:00.000+01:00",
            address: { contactId: lexwareContactId },
            lineItems: lineItems,
            totalPrice: {
              currency: "EUR",
            },
            taxConditions: {
              taxType: "net",
            },
            title: `Rechnung ${inv.invoice_number || ""}`.trim(),
            introduction: `Abrechnungszeitraum: ${inv.period_start || ""} – ${inv.period_end || ""}`,
            remark: "Vielen Dank für Ihr Vertrauen.",
            shippingConditions: {
              shippingType: "none",
            },
          };

          const lexRes = await fetch(`${LEXWARE_BASE}/invoices`, {
            method: "POST",
            headers,
            body: JSON.stringify(lexwareInvoice),
          });

          if (!lexRes.ok) {
            const errBody = await lexRes.text();
            results.push({ invoiceId: inv.id, status: "error", reason: `Lexware API ${lexRes.status}: ${errBody}` });
            continue;
          }

          const lexData = await lexRes.json();
          const lexwareInvoiceId = lexData.id;

          // 3. Store Lexware invoice ID
          await supabase
            .from("tenant_invoices")
            .update({ lexware_invoice_id: lexwareInvoiceId })
            .eq("id", inv.id);

          results.push({ invoiceId: inv.id, status: "success", lexwareId: lexwareInvoiceId });
        } catch (innerErr: any) {
          results.push({ invoiceId: inv.id, status: "error", reason: innerErr.message });
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});

async function ensureContact(
  headers: Record<string, string>,
  supabase: any,
  tenant: any
): Promise<string> {
  const street = [tenant.street, tenant.house_number].filter(Boolean).join(" ");
  const contactPayload: any = {
    version: 0,
    roles: { customer: {} },
    company: {
      name: tenant.name || "Unbenannt",
    },
  };

  if (street) {
    contactPayload.addresses = {
      billing: [{
        street,
        city: tenant.city || undefined,
        zip: tenant.postal_code || undefined,
        countryCode: "DE",
      }],
    };
  }

  if (tenant.contact_email) {
    contactPayload.emailAddresses = {
      business: [tenant.contact_email],
    };
  }

  const res = await fetch(`${LEXWARE_BASE}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify(contactPayload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create Lexware contact: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const contactId = data.id;

  // Store contact ID on tenant
  await supabase
    .from("tenants")
    .update({ lexware_contact_id: contactId })
    .eq("id", tenant.id);

  return contactId;
}

function buildLineItems(invoice: any): any[] {
  const items: any[] = [];
  const lineItemsRaw = invoice.line_items;

  if (Array.isArray(lineItemsRaw)) {
    for (const li of lineItemsRaw) {
      if (li.type === "module") {
        items.push({
          type: "custom",
          name: `Modul: ${li.label || li.code}`,
          quantity: 1,
          unitName: "Monat",
          unitPrice: {
            currency: "EUR",
            netAmount: Number(li.amount || 0),
            taxRatePercentage: 19,
          },
        });
      } else if (li.type === "support") {
        items.push({
          type: "custom",
          name: `Support-Sitzung ${li.started_at ? new Date(li.started_at).toLocaleDateString("de-DE") : ""}`.trim(),
          description: li.reason || `${li.duration_min} Min. (${li.blocks_15min} × 15 Min.)`,
          quantity: li.blocks_15min || 1,
          unitName: "Block (15 Min.)",
          unitPrice: {
            currency: "EUR",
            netAmount: Number(li.price_per_block || 0),
            taxRatePercentage: 19,
          },
        });
      }
    }
  }

  // Fallback if no line items
  if (items.length === 0) {
    items.push({
      type: "custom",
      name: `Rechnung ${invoice.invoice_number || ""}`.trim(),
      quantity: 1,
      unitName: "Pauschale",
      unitPrice: {
        currency: "EUR",
        netAmount: Number(invoice.amount || 0),
        taxRatePercentage: 19,
      },
    });
  }

  return items;
}
