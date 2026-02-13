import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatDE(n: number, decimals = 2): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDateDE(d: string): string {
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}

function getLastMonth(): { from: string; to: string; label: string } {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-based last month
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return { from, to, label: `${monthNames[month - 1]} ${year}` };
}

function generateInvoiceNumber(tenantIndex: number, invoiceIndex: number, year: number, month: number): string {
  return `LI-${year}${String(month).padStart(2, "0")}-${String(tenantIndex).padStart(3, "0")}-${String(invoiceIndex).padStart(4, "0")}`;
}

function buildInvoiceHTML(
  invoiceNumber: string,
  userName: string,
  userEmail: string,
  sessions: any[],
  tariffName: string,
  pricePerKwh: number,
  baseFee: number,
  idleFeePerMinute: number,
  idleFeeGraceMinutes: number,
  currency: string,
  totalEnergy: number,
  totalIdleFee: number,
  totalAmount: number,
  period: { from: string; to: string; label: string },
  tenantName: string,
  logoUrl: string | null,
  primaryColor: string,
  accentColor: string,
): string {
  const currencySymbol = currency === "EUR" ? "€" : currency;

  // Session rows
  const sessionRows = sessions.map((s, i) => {
    const startDate = new Date(s.start_time);
    const endDate = s.stop_time ? new Date(s.stop_time) : null;
    const duration = endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60000) : 0;
    const durationStr = duration > 60 ? `${Math.floor(duration / 60)}h ${duration % 60}min` : `${duration}min`;
    const idleMinutes = Math.max(0, duration - idleFeeGraceMinutes);
    const sessionIdleFee = idleFeePerMinute > 0 && idleMinutes > 0 ? idleMinutes * idleFeePerMinute : 0;
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    return `<tr>
      <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${startDate.toLocaleDateString("de-DE")}</td>
      <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${startDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}${endDate ? " – " + endDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}</td>
      <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${durationStr}</td>
      <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right">${formatDE(s.energy_kwh)} kWh</td>
      <td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right">${formatDE(s.energy_kwh * pricePerKwh)} ${currencySymbol}</td>
      ${idleFeePerMinute > 0 ? `<td style="padding:8px 12px;font-size:12px;color:${sessionIdleFee > 0 ? '#dc2626' : '#94a3b8'};border-bottom:1px solid #f1f5f9;background:${bg};text-align:right">${sessionIdleFee > 0 ? formatDE(sessionIdleFee) + ' ' + currencySymbol : '—'}</td>` : ""}
    </tr>`;
  }).join("");

  const logoImgTag = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height:52px;max-width:160px;object-fit:contain;border-radius:6px" />`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><title>Laderechnung ${invoiceNumber}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #f8fafc; }
  .container { max-width: 700px; margin: 0 auto; padding: 32px; background: #fff; }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <table style="width:100%;background:linear-gradient(135deg,${primaryColor} 0%,${accentColor} 100%);border-radius:12px;margin-bottom:24px;border-spacing:0">
    <tr>
      <td style="padding:24px 28px;vertical-align:middle">
        <div style="font-size:20px;font-weight:700;color:white;margin-bottom:4px">Laderechnung</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.8)">${period.label}</div>
      </td>
      ${logoImgTag ? `<td style="padding:24px 28px;vertical-align:middle;text-align:right">${logoImgTag}</td>` : ""}
    </tr>
  </table>

  <!-- Invoice Meta -->
  <table style="width:100%;margin-bottom:24px;border-spacing:0">
    <tr>
      <td style="vertical-align:top;width:50%">
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Rechnungsnummer</div>
        <div style="font-size:14px;font-weight:600">${invoiceNumber}</div>
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Zeitraum</div>
        <div style="font-size:13px">${formatDateDE(period.from)} – ${formatDateDE(period.to)}</div>
      </td>
      <td style="vertical-align:top;width:50%">
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Kunde</div>
        <div style="font-size:14px;font-weight:600">${userName}</div>
        <div style="font-size:13px;color:#64748b">${userEmail}</div>
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Tarif</div>
        <div style="font-size:13px">${tariffName} (${formatDE(pricePerKwh, 4)} ${currencySymbol}/kWh)</div>
      </td>
    </tr>
  </table>

  <!-- KPI Cards -->
  <table style="width:100%;margin-bottom:24px;border-spacing:8px;border-collapse:separate">
    <tr>
      <td style="padding:8px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">⚡</div>
          <div style="font-size:22px;font-weight:700;color:#166534">${formatDE(totalEnergy)} kWh</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">Gesamtverbrauch</div>
        </div>
      </td>
      <td style="padding:8px">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">🔌</div>
          <div style="font-size:22px;font-weight:700;color:#1e40af">${sessions.length}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">Ladevorgänge</div>
        </div>
      </td>
      <td style="padding:8px">
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">💰</div>
          <div style="font-size:22px;font-weight:700;color:#92400e">${formatDE(totalAmount)} ${currencySymbol}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">Gesamtbetrag</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- Sessions Table -->
  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Ladevorgänge</div>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <thead>
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Datum</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Zeitraum</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Dauer</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Energie</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Betrag</th>
          ${idleFeePerMinute > 0 ? `<th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">Blockiergebühr</th>` : ""}
        </tr>
      </thead>
      <tbody>${sessionRows}</tbody>
      <tfoot>
        <tr style="font-weight:700;background:#f8fafc">
          <td colspan="3" style="padding:10px 12px;font-size:13px;border-top:2px solid #e2e8f0">Summe Energie</td>
          <td style="padding:10px 12px;font-size:13px;text-align:right;border-top:2px solid #e2e8f0">${formatDE(totalEnergy)} kWh</td>
          <td style="padding:10px 12px;font-size:13px;text-align:right;border-top:2px solid #e2e8f0">${formatDE(totalEnergy * pricePerKwh)} ${currencySymbol}</td>
          ${idleFeePerMinute > 0 ? `<td style="padding:10px 12px;font-size:13px;text-align:right;border-top:2px solid #e2e8f0"></td>` : ""}
        </tr>
        ${baseFee > 0 ? `<tr style="background:#f8fafc">
          <td colspan="${idleFeePerMinute > 0 ? 5 : 4}" style="padding:8px 12px;font-size:13px">Grundgebühr</td>
          <td style="padding:8px 12px;font-size:13px;text-align:right">${formatDE(baseFee)} ${currencySymbol}</td>
        </tr>` : ""}
        ${totalIdleFee > 0 ? `<tr style="background:#fef2f2">
          <td colspan="${idleFeePerMinute > 0 ? 5 : 4}" style="padding:8px 12px;font-size:13px;color:#dc2626">Blockiergebühr (${formatDE(idleFeePerMinute, 2)} ${currencySymbol}/Min. ab ${idleFeeGraceMinutes} Min.)</td>
          <td style="padding:8px 12px;font-size:13px;text-align:right;color:#dc2626">${formatDE(totalIdleFee)} ${currencySymbol}</td>
        </tr>` : ""}
        <tr style="font-weight:700;background:#f0f9ff">
          <td colspan="${idleFeePerMinute > 0 ? 5 : 4}" style="padding:12px;font-size:15px;border-top:2px solid #3b82f6;color:#1e40af">Gesamtbetrag</td>
          <td style="padding:12px;font-size:15px;text-align:right;border-top:2px solid #3b82f6;color:#1e40af">${formatDE(totalAmount)} ${currencySymbol}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;text-align:center">
    <div style="font-size:11px;color:#94a3b8">
      ${tenantName} · Laderechnung ${invoiceNumber} · Erstellt am ${new Date().toLocaleDateString("de-DE")}
    </div>
  </div>

</div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = resendKey ? new Resend(resendKey) : null;

    // Determine period (default: last month)
    const period = getLastMonth();

    // Optional: process only a specific tenant
    let tenantFilter: string | null = null;
    try {
      const body = await req.json();
      if (body.tenant_id) tenantFilter = body.tenant_id;
    } catch { /* no body = cron run, process all tenants */ }

    // Get all tenants with ev_charging module enabled
    let tenantQuery = supabase
      .from("tenant_modules")
      .select("tenant_id")
      .eq("module_code", "ev_charging")
      .eq("is_enabled", true);
    if (tenantFilter) tenantQuery = tenantQuery.eq("tenant_id", tenantFilter);
    const { data: tenantModules, error: tmErr } = await tenantQuery;
    if (tmErr) throw tmErr;

    const tenantIds = (tenantModules ?? []).map((tm: any) => tm.tenant_id);
    if (tenantIds.length === 0) {
      return new Response(JSON.stringify({ message: "No tenants with ev_charging module" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { tenant_id: string; invoices_created: number; emails_sent: number; errors: string[] }[] = [];

    for (const tenantId of tenantIds) {
      const tenantResult = { tenant_id: tenantId, invoices_created: 0, emails_sent: 0, errors: [] as string[] };

      try {
        // Get tenant info
        const { data: tenant } = await supabase.from("tenants").select("name, logo_url, branding").eq("id", tenantId).single();
        const tenantName = tenant?.name || "";
        const logoUrl = tenant?.logo_url || null;
        const branding = (tenant?.branding as Record<string, string>) || {};
        const primaryColor = branding.primaryColor || "#1e293b";
        const accentColor = branding.accentColor || "#334155";

        // Get active tariff for this tenant
        const { data: tariffs } = await supabase
          .from("charging_tariffs")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .limit(1);
        const tariff = tariffs?.[0];
        const pricePerKwh = tariff?.price_per_kwh ?? 0;
        const baseFee = tariff?.base_fee ?? 0;
        const idleFeePerMinute = tariff?.idle_fee_per_minute ?? 0;
        const idleFeeGraceMinutes = tariff?.idle_fee_grace_minutes ?? 60;
        const currency = tariff?.currency ?? "EUR";
        const tariffName = tariff?.name ?? "Standard";

        // Get all completed sessions for this tenant in the period
        const { data: sessions } = await supabase
          .from("charging_sessions")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          .gte("start_time", period.from + "T00:00:00Z")
          .lte("start_time", period.to + "T23:59:59Z")
          .order("start_time", { ascending: true });

        if (!sessions || sessions.length === 0) continue;

        // Get charging users with email
        const { data: chargingUsers } = await supabase
          .from("charging_users")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "active");

        if (!chargingUsers || chargingUsers.length === 0) continue;

        // Group sessions by user (via id_tag / rfid_tag matching)
        const userRfidMap = new Map<string, any>();
        for (const cu of chargingUsers) {
          if (cu.rfid_tag) userRfidMap.set(cu.rfid_tag, cu);
        }

        // Group sessions by charging user
        const userSessions = new Map<string, { user: any; sessions: any[] }>();
        for (const session of sessions) {
          const idTag = session.id_tag;
          if (!idTag) continue;
          const chargingUser = userRfidMap.get(idTag);
          if (!chargingUser) continue;

          if (!userSessions.has(chargingUser.id)) {
            userSessions.set(chargingUser.id, { user: chargingUser, sessions: [] });
          }
          userSessions.get(chargingUser.id)!.sessions.push(session);
        }

        let invoiceIndex = 1;
        const year = period.from.substring(0, 4);
        const month = period.from.substring(5, 7);

        for (const [userId, { user, sessions: userSessionList }] of userSessions) {
          try {
            const totalEnergy = userSessionList.reduce((sum, s) => sum + (s.energy_kwh || 0), 0);
            // Calculate idle fee per session
            const totalIdleFee = idleFeePerMinute > 0 ? userSessionList.reduce((sum, s) => {
              if (!s.stop_time) return sum;
              const duration = Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000);
              const idleMinutes = Math.max(0, duration - idleFeeGraceMinutes);
              return sum + idleMinutes * idleFeePerMinute;
            }, 0) : 0;
            const totalAmount = totalEnergy * pricePerKwh + baseFee + totalIdleFee;
            const invoiceNumber = generateInvoiceNumber(tenantIds.indexOf(tenantId) + 1, invoiceIndex, parseInt(year), parseInt(month));

            // Check if invoice already exists for this user/period
            const { data: existingInvoices } = await supabase
              .from("charging_invoices")
              .select("id")
              .eq("tenant_id", tenantId)
              .in("session_id", userSessionList.map((s: any) => s.id))
              .limit(1);

            if (existingInvoices && existingInvoices.length > 0) continue; // Already invoiced

            // Create invoice record for first session (representative)
            const { error: invErr } = await supabase.from("charging_invoices").insert({
              tenant_id: tenantId,
              session_id: userSessionList[0].id,
              tariff_id: tariff?.id ?? null,
              total_energy_kwh: totalEnergy,
              total_amount: totalAmount,
              idle_fee_amount: totalIdleFee,
              currency,
              status: "issued",
              invoice_number: invoiceNumber,
              issued_at: new Date().toISOString(),
            });

            if (invErr) {
              tenantResult.errors.push(`Invoice creation failed for user ${user.name}: ${invErr.message}`);
              continue;
            }

            tenantResult.invoices_created++;
            invoiceIndex++;

            // Send email if user has an email address
            if (user.email && resend) {
              const htmlContent = buildInvoiceHTML(
                invoiceNumber, user.name, user.email, userSessionList,
                tariffName, pricePerKwh, baseFee, idleFeePerMinute, idleFeeGraceMinutes, currency,
                totalEnergy, totalIdleFee, totalAmount, period, tenantName, logoUrl,
                primaryColor, accentColor,
              );

              try {
                await resend.emails.send({
                  from: `${tenantName || "Ladeinfrastruktur"} <noreply@mailtest.my-ips.de>`,
                  to: [user.email],
                  subject: `Laderechnung ${invoiceNumber} – ${period.label}`,
                  html: htmlContent,
                });
                tenantResult.emails_sent++;
              } catch (emailErr: any) {
                tenantResult.errors.push(`Email to ${user.email} failed: ${emailErr.message}`);
              }
            }
          } catch (userErr: any) {
            tenantResult.errors.push(`Error for user ${user?.name}: ${userErr.message}`);
          }
        }
      } catch (tenantErr: any) {
        tenantResult.errors.push(`Tenant error: ${tenantErr.message}`);
      }

      results.push(tenantResult);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
