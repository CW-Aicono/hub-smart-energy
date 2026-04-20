import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";

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
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return { from, to, label: `${monthNames[month - 1]} ${year}` };
}

/** Resolve tariff: user > group > active default */
function resolveTariff(user: any, group: any, allTariffs: any[]): any {
  if (user.tariff_id) {
    const t = allTariffs.find((t: any) => t.id === user.tariff_id);
    if (t) return t;
  }
  if (group?.tariff_id) {
    const t = allTariffs.find((t: any) => t.id === group.tariff_id);
    if (t) return t;
  }
  return allTariffs.find((t: any) => t.is_active) || null;
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
  netAmount: number,
  taxAmount: number,
  totalAmount: number,
  taxRatePercent: number,
  totalEnergy: number,
  totalIdleFee: number,
  period: { from: string; to: string; label: string },
  tenantName: string,
  logoUrl: string | null,
  primaryColor: string,
  accentColor: string,
  invoiceDate: string,
): string {
  const currencySymbol = currency === "EUR" ? "€" : currency;

  const sessionRows = sessions.map((s: any, i: number) => {
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

  const colCount = idleFeePerMinute > 0 ? 6 : 5;

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
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Rechnungsdatum</div>
        <div style="font-size:13px">${formatDateDE(invoiceDate)}</div>
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
    </table>
  </div>

  <!-- Totals with MwSt -->
  <table style="width:100%;margin-bottom:24px;border-collapse:collapse">
    ${baseFee > 0 ? `<tr><td style="padding:6px 12px;font-size:13px">Grundgebühr</td><td style="padding:6px 12px;font-size:13px;text-align:right">${formatDE(baseFee)} ${currencySymbol}</td></tr>` : ""}
    ${totalIdleFee > 0 ? `<tr><td style="padding:6px 12px;font-size:13px;color:#dc2626">Blockiergebühr</td><td style="padding:6px 12px;font-size:13px;text-align:right;color:#dc2626">${formatDE(totalIdleFee)} ${currencySymbol}</td></tr>` : ""}
    <tr style="border-top:1px solid #e2e8f0"><td style="padding:8px 12px;font-size:14px;font-weight:600">Nettobetrag</td><td style="padding:8px 12px;font-size:14px;text-align:right;font-weight:600">${formatDE(netAmount)} ${currencySymbol}</td></tr>
    <tr><td style="padding:6px 12px;font-size:13px;color:#64748b">MwSt (${formatDE(taxRatePercent, 0)} %)</td><td style="padding:6px 12px;font-size:13px;text-align:right;color:#64748b">${formatDE(taxAmount)} ${currencySymbol}</td></tr>
    <tr style="border-top:2px solid #3b82f6;background:#f0f9ff"><td style="padding:12px;font-size:16px;font-weight:700;color:#1e40af">Gesamtbetrag (brutto)</td><td style="padding:12px;font-size:16px;text-align:right;font-weight:700;color:#1e40af">${formatDE(totalAmount)} ${currencySymbol}</td></tr>
  </table>

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;text-align:center">
    <div style="font-size:11px;color:#94a3b8">
      ${tenantName} · Laderechnung ${invoiceNumber} · Rechnungsdatum ${formatDateDE(invoiceDate)}
    </div>
  </div>

</div>
</body>
</html>`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "info@aicono.org";

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = resendKey ? new Resend(resendKey) : null;

    // Parse request body
    let tenantFilter: string | null = null;
    let periodOverride: { from: string; to: string; label: string } | null = null;
    let mode: "generate" | "send" | "both" = "both";

    try {
      const body = await req.json();
      if (body.tenant_id) tenantFilter = body.tenant_id;
      if (body.period_start && body.period_end) {
        const from = body.period_start;
        const to = body.period_end;
        const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const d = new Date(from);
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        periodOverride = { from, to, label };
      }
      if (body.mode) mode = body.mode;
    } catch { /* no body = cron run */ }

    const period = periodOverride || getLastMonth();

    // Get tenants with ev_charging module
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

        // Get ALL tariffs for this tenant (for resolution)
        const { data: allTariffs } = await supabase
          .from("charging_tariffs")
          .select("*")
          .eq("tenant_id", tenantId);

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

        // Get charging users + groups
        const { data: chargingUsers } = await supabase
          .from("charging_users")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "active");

        const { data: chargingGroups } = await supabase
          .from("charging_user_groups")
          .select("*")
          .eq("tenant_id", tenantId);

        if (!chargingUsers || chargingUsers.length === 0) continue;

        // Build lookup maps
        const userByRfid = new Map<string, any>();
        const userByAppTag = new Map<string, any>();
        for (const cu of chargingUsers) {
          if (cu.rfid_tag) userByRfid.set(cu.rfid_tag, cu);
          if (cu.app_tag) userByAppTag.set(cu.app_tag, cu);
        }
        const groupById = new Map<string, any>();
        for (const g of (chargingGroups || [])) groupById.set(g.id, g);

        // Group sessions by charging user
        const userSessions = new Map<string, { user: any; sessions: any[] }>();
        for (const session of sessions) {
          const idTag = session.id_tag;
          if (!idTag) continue;
          const chargingUser = userByRfid.get(idTag) || userByAppTag.get(idTag);
          if (!chargingUser) continue;

          if (!userSessions.has(chargingUser.id)) {
            userSessions.set(chargingUser.id, { user: chargingUser, sessions: [] });
          }
          userSessions.get(chargingUser.id)!.sessions.push(session);
        }

        const invoiceDate = new Date().toISOString().split("T")[0];
        const invoiceYear = new Date().getFullYear();

        for (const [userId, { user, sessions: userSessionList }] of userSessions) {
          try {
            // Check if invoice already exists for this user/period
            const { data: existingInvoices } = await supabase
              .from("charging_invoices")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("user_id", userId)
              .eq("period_start", period.from)
              .eq("period_end", period.to)
              .limit(1);

            const invoiceExists = existingInvoices && existingInvoices.length > 0;

            if (mode === "generate" || mode === "both") {
              if (invoiceExists) continue; // Skip if already created

              // Resolve tariff for this user
              const group = user.group_id ? groupById.get(user.group_id) : null;
              const tariff = resolveTariff(user, group, allTariffs || []);
              const pricePerKwh = tariff?.price_per_kwh ?? 0;
              const baseFee = tariff?.base_fee ?? 0;
              const idleFeePerMinute = tariff?.idle_fee_per_minute ?? 0;
              const idleFeeGraceMinutes = tariff?.idle_fee_grace_minutes ?? 60;
              const taxRatePercent = tariff?.tax_rate_percent ?? 19;
              const currency = tariff?.currency ?? "EUR";

              const totalEnergy = userSessionList.reduce((sum: number, s: any) => sum + (s.energy_kwh || 0), 0);
              const totalIdleFee = idleFeePerMinute > 0 ? userSessionList.reduce((sum: number, s: any) => {
                if (!s.stop_time) return sum;
                const duration = Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000);
                const idleMinutes = Math.max(0, duration - idleFeeGraceMinutes);
                return sum + idleMinutes * idleFeePerMinute;
              }, 0) : 0;

              const netAmount = totalEnergy * pricePerKwh + baseFee + totalIdleFee;
              const taxAmount = Math.round(netAmount * taxRatePercent / 100 * 100) / 100;
              const totalAmount = Math.round((netAmount + taxAmount) * 100) / 100;

              // Get atomic invoice number
              const { data: invNumResult } = await supabase.rpc("next_charging_invoice_number", {
                p_tenant_id: tenantId,
                p_year: invoiceYear,
              });
              const invoiceNumber = invNumResult || `EV-${invoiceYear}-????`;

              // Create invoice
              const { data: newInvoice, error: invErr } = await supabase.from("charging_invoices").insert({
                tenant_id: tenantId,
                user_id: userId,
                session_id: userSessionList[0].id, // backwards compat
                tariff_id: tariff?.id ?? null,
                total_energy_kwh: totalEnergy,
                net_amount: netAmount,
                tax_amount: taxAmount,
                tax_rate_percent: taxRatePercent,
                total_amount: totalAmount,
                idle_fee_amount: totalIdleFee,
                currency,
                status: "draft",
                invoice_number: invoiceNumber,
                invoice_date: invoiceDate,
                period_start: period.from,
                period_end: period.to,
              }).select("id").single();

              if (invErr) {
                tenantResult.errors.push(`Invoice creation failed for user ${user.name}: ${invErr.message}`);
                continue;
              }

              // Link sessions (n:m)
              if (newInvoice) {
                const links = userSessionList.map((s: any) => ({
                  invoice_id: newInvoice.id,
                  session_id: s.id,
                }));
                await supabase.from("charging_invoice_sessions").insert(links);
              }

              tenantResult.invoices_created++;
            }

            // Send email
            if ((mode === "send" || mode === "both") && user.email && resend) {
              // Re-fetch the invoice if mode=send
              let invoiceData: any;
              if (mode === "send") {
                const { data } = await supabase
                  .from("charging_invoices")
                  .select("*")
                  .eq("tenant_id", tenantId)
                  .eq("user_id", userId)
                  .eq("period_start", period.from)
                  .eq("period_end", period.to)
                  .single();
                invoiceData = data;
              }

              const group = user.group_id ? groupById.get(user.group_id) : null;
              const tariff = resolveTariff(user, group, allTariffs || []);
              const pricePerKwh = tariff?.price_per_kwh ?? 0;
              const baseFee = tariff?.base_fee ?? 0;
              const idleFeePerMinute = tariff?.idle_fee_per_minute ?? 0;
              const idleFeeGraceMinutes = tariff?.idle_fee_grace_minutes ?? 60;
              const taxRatePercent = tariff?.tax_rate_percent ?? 19;
              const currency = tariff?.currency ?? "EUR";
              const tariffName = tariff?.name ?? "Standard";

              const totalEnergy = userSessionList.reduce((sum: number, s: any) => sum + (s.energy_kwh || 0), 0);
              const totalIdleFee = idleFeePerMinute > 0 ? userSessionList.reduce((sum: number, s: any) => {
                if (!s.stop_time) return sum;
                const duration = Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000);
                const idleMinutes = Math.max(0, duration - idleFeeGraceMinutes);
                return sum + idleMinutes * idleFeePerMinute;
              }, 0) : 0;

              const netAmount = invoiceData?.net_amount ?? (totalEnergy * pricePerKwh + baseFee + totalIdleFee);
              const taxAmount = invoiceData?.tax_amount ?? Math.round(netAmount * taxRatePercent / 100 * 100) / 100;
              const totalAmount = invoiceData?.total_amount ?? Math.round((netAmount + taxAmount) * 100) / 100;
              const invoiceNumber = invoiceData?.invoice_number ?? "—";

              const htmlContent = buildInvoiceHTML(
                invoiceNumber, user.name, user.email, userSessionList,
                tariffName, pricePerKwh, baseFee, idleFeePerMinute, idleFeeGraceMinutes, currency,
                netAmount, taxAmount, totalAmount, taxRatePercent,
                totalEnergy, totalIdleFee, period, tenantName, logoUrl,
                primaryColor, accentColor, invoiceData?.invoice_date ?? invoiceDate,
              );

              // Upload invoice HTML to storage and get signed download URL
              let downloadUrl = "";
              try {
                const storagePath = `${tenantId}/${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.html`;
                const htmlBlob = new Blob([htmlContent], { type: "text/html" });
                await supabase.storage.from("charging-invoices").upload(storagePath, htmlBlob, {
                  contentType: "text/html",
                  upsert: true,
                });

                const { data: signedData } = await supabase.storage
                  .from("charging-invoices")
                  .createSignedUrl(storagePath, 60 * 60 * 24 * 30); // 30 days

                if (signedData?.signedUrl) {
                  downloadUrl = signedData.signedUrl;
                }

                // Update invoice record with storage path
                const invoiceId = invoiceData?.id;
                if (invoiceId) {
                  await supabase.from("charging_invoices").update({ pdf_storage_path: storagePath }).eq("id", invoiceId);
                }
              } catch (storageErr: any) {
                tenantResult.errors.push(`Storage upload for ${user.name} failed: ${storageErr.message}`);
              }

              // Build email with download link
              const downloadSection = downloadUrl
                ? `<div style="text-align:center;margin:24px 0">
                    <a href="${downloadUrl}" target="_blank" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,${primaryColor},${accentColor});color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
                      📥 Rechnung herunterladen
                    </a>
                    <div style="font-size:11px;color:#94a3b8;margin-top:8px">Der Download-Link ist 30 Tage gültig.</div>
                  </div>`
                : "";

              // Insert download section before footer
              const emailHtml = htmlContent.replace(
                '<!-- Footer -->',
                `${downloadSection}\n  <!-- Footer -->`
              );

              try {
                await resend.emails.send({
                  from: `${tenantName || "Ladeinfrastruktur"} <${FROM_EMAIL}>`,
                  to: [user.email],
                  subject: `Laderechnung ${invoiceNumber} – ${period.label}`,
                  html: emailHtml,
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
