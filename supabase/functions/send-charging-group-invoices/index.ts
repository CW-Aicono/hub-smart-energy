// Sammelrechnungen (Gruppenrechnungen) für Ladeinfrastruktur
// Aggregiert alle Ladevorgänge der Mitglieder einer Rechnungsgruppe im Zeitraum
// und erstellt EINE Sammelrechnung pro Gruppe an billing_email.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

function fmtDE(n: number, d = 2): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtDateDE(d: string): string {
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
}
function resolveTariff(user: any, group: any, allTariffs: any[]): any {
  if (user.tariff_id) {
    const t = allTariffs.find((x: any) => x.id === user.tariff_id);
    if (t) return t;
  }
  if (group?.tariff_id) {
    const t = allTariffs.find((x: any) => x.id === group.tariff_id);
    if (t) return t;
  }
  return allTariffs.find((x: any) => x.is_active) || null;
}

interface MemberLine {
  user: any;
  sessions: any[];
  tariff: any;
  totalEnergy: number;
  totalIdle: number;
  net: number;
  tax: number;
  gross: number;
}

function buildHtml(opts: {
  group: any;
  invoiceNumber: string;
  invoiceDate: string;
  period: { from: string; to: string; label: string };
  lines: MemberLine[];
  netSum: number;
  taxSum: number;
  totalSum: number;
  taxRate: number;
  currency: string;
  tenantName: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
}): string {
  const cur = opts.currency === "EUR" ? "€" : opts.currency;
  const logoTag = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="Logo" style="max-height:52px;max-width:160px;object-fit:contain;border-radius:6px"/>`
    : "";

  const memberRows = opts.lines.map((l) => {
    const sessionsHtml = l.sessions.map((s: any) => {
      const start = new Date(s.start_time);
      const end = s.stop_time ? new Date(s.stop_time) : null;
      const dur = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
      const durStr = dur > 60 ? `${Math.floor(dur / 60)}h ${dur % 60}min` : `${dur}min`;
      return `<tr>
        <td style="padding:6px 10px;font-size:11px;color:#475569;border-bottom:1px solid #f1f5f9">${start.toLocaleDateString("de-DE")} ${start.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}</td>
        <td style="padding:6px 10px;font-size:11px;color:#475569;border-bottom:1px solid #f1f5f9">${durStr}</td>
        <td style="padding:6px 10px;font-size:11px;color:#475569;border-bottom:1px solid #f1f5f9;text-align:right">${fmtDE(s.energy_kwh || 0)} kWh</td>
        <td style="padding:6px 10px;font-size:11px;color:#475569;border-bottom:1px solid #f1f5f9;text-align:right;font-family:ui-monospace,monospace">${(s.id_tag || "—").toUpperCase()}</td>
      </tr>`;
    }).join("");
    return `<div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="padding:10px 14px;background:#f1f5f9;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:600;color:#0f172a">${l.user.name || "—"}</div>
          <div style="font-size:11px;color:#64748b">${l.user.email || ""} · Tarif: ${l.tariff?.name || "Standard"} (${fmtDE(l.tariff?.price_per_kwh ?? 0, 4)} ${cur}/kWh)</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#64748b">${l.sessions.length} Vorgang/Vorgänge · ${fmtDE(l.totalEnergy)} kWh</div>
          <div style="font-size:14px;font-weight:700;color:#0f172a">${fmtDE(l.gross)} ${cur}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:6px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;background:#fafbfc;border-bottom:1px solid #e2e8f0">Zeitpunkt</th>
          <th style="padding:6px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;background:#fafbfc;border-bottom:1px solid #e2e8f0">Dauer</th>
          <th style="padding:6px 10px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;background:#fafbfc;border-bottom:1px solid #e2e8f0">Energie</th>
          <th style="padding:6px 10px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;background:#fafbfc;border-bottom:1px solid #e2e8f0">Tag</th>
        </tr></thead>
        <tbody>${sessionsHtml}</tbody>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><title>Sammelrechnung ${opts.invoiceNumber}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc">
<div style="max-width:760px;margin:0 auto;padding:32px;background:#fff">
  <table style="width:100%;background:linear-gradient(135deg,${opts.primary} 0%,${opts.accent} 100%);border-radius:12px;margin-bottom:24px;border-spacing:0">
    <tr>
      <td style="padding:24px 28px;vertical-align:middle">
        <div style="font-size:20px;font-weight:700;color:white;margin-bottom:4px">Sammelrechnung Ladeinfrastruktur</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.85)">${opts.period.label}</div>
      </td>
      ${logoTag ? `<td style="padding:24px 28px;vertical-align:middle;text-align:right">${logoTag}</td>` : ""}
    </tr>
  </table>
  <table style="width:100%;margin-bottom:24px;border-spacing:0">
    <tr>
      <td style="vertical-align:top;width:50%">
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Rechnungsnummer</div>
        <div style="font-size:14px;font-weight:600">${opts.invoiceNumber}</div>
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Rechnungsdatum</div>
        <div style="font-size:13px">${fmtDateDE(opts.invoiceDate)}</div>
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Zeitraum</div>
        <div style="font-size:13px">${fmtDateDE(opts.period.from)} – ${fmtDateDE(opts.period.to)}</div>
      </td>
      <td style="vertical-align:top;width:50%">
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px">Rechnungsempfänger</div>
        <div style="font-size:14px;font-weight:600">${opts.group.company_name || opts.group.name}</div>
        ${opts.group.billing_address ? `<div style="font-size:12px;color:#64748b;white-space:pre-line">${opts.group.billing_address}</div>` : ""}
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Rechnungsgruppe</div>
        <div style="font-size:13px">${opts.group.name}</div>
        <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-top:12px;margin-bottom:4px">Mitglieder mit Verbrauch</div>
        <div style="font-size:13px">${opts.lines.length}</div>
      </td>
    </tr>
  </table>

  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Ladevorgänge je Mitglied</div>
    ${memberRows || '<div style="font-size:12px;color:#94a3b8">Keine Ladevorgänge im Zeitraum.</div>'}
  </div>

  <table style="width:100%;margin-bottom:24px;border-collapse:collapse">
    <tr style="border-top:1px solid #e2e8f0"><td style="padding:8px 12px;font-size:14px;font-weight:600">Nettobetrag</td><td style="padding:8px 12px;font-size:14px;text-align:right;font-weight:600">${fmtDE(opts.netSum)} ${cur}</td></tr>
    <tr><td style="padding:6px 12px;font-size:13px;color:#64748b">MwSt (${fmtDE(opts.taxRate, 0)} %)</td><td style="padding:6px 12px;font-size:13px;text-align:right;color:#64748b">${fmtDE(opts.taxSum)} ${cur}</td></tr>
    <tr style="border-top:2px solid ${opts.primary};background:#f0f9ff"><td style="padding:12px;font-size:16px;font-weight:700;color:${opts.primary}">Gesamtbetrag (brutto)</td><td style="padding:12px;font-size:16px;text-align:right;font-weight:700;color:${opts.primary}">${fmtDE(opts.totalSum)} ${cur}</td></tr>
  </table>

  <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;text-align:center">
    <div style="font-size:11px;color:#94a3b8">${opts.tenantName} · Sammelrechnung ${opts.invoiceNumber} · ${fmtDateDE(opts.invoiceDate)}</div>
  </div>
</div></body></html>`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = resendKey ? new Resend(resendKey) : null;

    const body = await req.json().catch(() => ({} as any));
    const tenantId: string | undefined = body.tenant_id;
    const periodStart: string | undefined = body.period_start;
    const periodEnd: string | undefined = body.period_end;
    const groupId: string | undefined = body.group_id;
    const mode: "generate" | "send" | "both" = body.mode ?? "both";

    if (!tenantId || !periodStart || !periodEnd) {
      return new Response(JSON.stringify({ error: "tenant_id, period_start, period_end required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const d = new Date(periodStart);
    const period = { from: periodStart, to: periodEnd, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}` };

    // Tenant info
    const { data: tenant } = await supabase.from("tenants").select("name, logo_url, branding").eq("id", tenantId).single();
    const tenantName = tenant?.name ?? "";
    const logoUrl = tenant?.logo_url ?? null;
    const branding = (tenant?.branding as Record<string, string>) ?? {};
    const primary = branding.primaryColor || "#1e293b";
    const accent = branding.accentColor || "#334155";

    // Groups to process
    let groupQ = supabase.from("charging_billing_groups").select("*").eq("tenant_id", tenantId);
    if (groupId) groupQ = groupQ.eq("id", groupId);
    const { data: groups, error: gErr } = await groupQ;
    if (gErr) throw gErr;
    if (!groups || groups.length === 0) {
      return new Response(JSON.stringify({ success: true, results: [], message: "no groups" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Shared lookups for tenant
    const { data: allTariffs } = await supabase.from("charging_tariffs").select("*").eq("tenant_id", tenantId);
    const { data: chargingGroups } = await supabase.from("charging_user_groups").select("*").eq("tenant_id", tenantId);
    const cgById = new Map<string, any>();
    for (const g of (chargingGroups || [])) cgById.set(g.id, g);

    const results: any[] = [];
    const invoiceYear = new Date().getFullYear();
    const invoiceDate = new Date().toISOString().split("T")[0];

    for (const grp of groups) {
      const r = { group_id: grp.id, group_name: grp.name, invoices_created: 0, emails_sent: 0, members: 0, sessions: 0, errors: [] as string[] };
      try {
        // Members
        const { data: memberRows } = await supabase
          .from("charging_billing_group_members")
          .select("user_id")
          .eq("group_id", grp.id);
        const memberIds = (memberRows || []).map((m: any) => m.user_id);
        if (memberIds.length === 0) { results.push(r); continue; }

        // Users
        const { data: users } = await supabase
          .from("charging_users")
          .select("*")
          .in("id", memberIds);
        const usersById = new Map<string, any>();
        const tagToUser = new Map<string, any>();
        const appTagToUser = new Map<string, any>();
        for (const u of (users || [])) {
          usersById.set(u.id, u);
          if (u.rfid_tag) tagToUser.set(u.rfid_tag.toUpperCase(), u);
          if (u.app_tag) appTagToUser.set(u.app_tag, u);
        }
        // Extra RFID tags
        const { data: extraTags } = await supabase
          .from("charging_user_rfid_tags")
          .select("tag, user_id")
          .in("user_id", memberIds);
        for (const t of (extraTags || [])) {
          const u = usersById.get((t as any).user_id);
          if (u && (t as any).tag) tagToUser.set(((t as any).tag as string).toUpperCase(), u);
        }

        // Sessions in period (completed)
        const { data: sessions } = await supabase
          .from("charging_sessions")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          .gte("start_time", period.from + "T00:00:00Z")
          .lte("start_time", period.to + "T23:59:59Z")
          .order("start_time");

        // Assign sessions to members
        const sessionsByUser = new Map<string, any[]>();
        for (const s of (sessions || [])) {
          if (!s.id_tag) continue;
          const u = tagToUser.get(s.id_tag.toUpperCase()) || appTagToUser.get(s.id_tag);
          if (!u) continue;
          const arr = sessionsByUser.get(u.id) ?? [];
          arr.push(s);
          sessionsByUser.set(u.id, arr);
        }

        if (sessionsByUser.size === 0) { results.push(r); continue; }
        r.members = sessionsByUser.size;

        // Build per-member calculation
        const lines: MemberLine[] = [];
        let netSum = 0, taxSum = 0, totalSum = 0;
        let taxRate = 19;
        let currency = "EUR";
        for (const [uid, sess] of sessionsByUser) {
          const user = usersById.get(uid);
          const cg = user.group_id ? cgById.get(user.group_id) : null;
          const tariff = resolveTariff(user, cg, allTariffs || []);
          const pricePerKwh = tariff?.price_per_kwh ?? 0;
          const baseFee = tariff?.base_fee ?? 0;
          const idleFeePerMin = tariff?.idle_fee_per_minute ?? 0;
          const idleGrace = tariff?.idle_fee_grace_minutes ?? 60;
          taxRate = tariff?.tax_rate_percent ?? taxRate;
          currency = tariff?.currency ?? currency;

          const energy = sess.reduce((s: number, x: any) => s + (x.energy_kwh || 0), 0);
          const idle = idleFeePerMin > 0 ? sess.reduce((s: number, x: any) => {
            if (!x.stop_time) return s;
            const dur = Math.round((new Date(x.stop_time).getTime() - new Date(x.start_time).getTime()) / 60000);
            return s + Math.max(0, dur - idleGrace) * idleFeePerMin;
          }, 0) : 0;
          const net = energy * pricePerKwh + baseFee + idle;
          const tax = Math.round(net * taxRate / 100 * 100) / 100;
          const gross = Math.round((net + tax) * 100) / 100;
          netSum += net; taxSum += tax; totalSum += gross;
          r.sessions += sess.length;
          lines.push({ user, sessions: sess, tariff, totalEnergy: energy, totalIdle: idle, net, tax, gross });
        }
        netSum = Math.round(netSum * 100) / 100;
        taxSum = Math.round(taxSum * 100) / 100;
        totalSum = Math.round(totalSum * 100) / 100;
        const totalEnergyAll = lines.reduce((s, l) => s + l.totalEnergy, 0);
        const totalIdleAll = lines.reduce((s, l) => s + l.totalIdle, 0);

        // Check existing
        const { data: existing } = await supabase
          .from("charging_invoices")
          .select("id, invoice_number, invoice_date")
          .eq("tenant_id", tenantId)
          .eq("billing_group_id", grp.id)
          .eq("period_start", period.from)
          .eq("period_end", period.to)
          .limit(1);
        let invoiceId: string | null = existing?.[0]?.id ?? null;
        let invoiceNumber: string = existing?.[0]?.invoice_number ?? "";
        const useDate: string = existing?.[0]?.invoice_date ?? invoiceDate;

        if ((mode === "generate" || mode === "both") && !invoiceId) {
          const { data: invNumResult } = await supabase.rpc("next_charging_invoice_number", {
            p_tenant_id: tenantId, p_year: invoiceYear,
          });
          invoiceNumber = invNumResult || `EV-${invoiceYear}-????`;

          const { data: ins, error: insErr } = await supabase.from("charging_invoices").insert({
            tenant_id: tenantId,
            billing_group_id: grp.id,
            user_id: null,
            session_id: null,
            total_energy_kwh: totalEnergyAll,
            net_amount: netSum,
            tax_amount: taxSum,
            tax_rate_percent: taxRate,
            total_amount: totalSum,
            idle_fee_amount: totalIdleAll,
            currency,
            status: "draft",
            invoice_number: invoiceNumber,
            invoice_date: invoiceDate,
            period_start: period.from,
            period_end: period.to,
          }).select("id").single();

          if (insErr) { r.errors.push(`Invoice create: ${insErr.message}`); results.push(r); continue; }
          invoiceId = ins!.id;

          // Link all sessions
          const allSess = lines.flatMap((l) => l.sessions.map((s: any) => ({ invoice_id: invoiceId, session_id: s.id })));
          if (allSess.length) await supabase.from("charging_invoice_sessions").insert(allSess);
          r.invoices_created++;
        }

        // Send email
        if ((mode === "send" || mode === "both") && grp.billing_email && resend && invoiceId && invoiceNumber) {
          const html = buildHtml({
            group: grp, invoiceNumber, invoiceDate: useDate, period, lines,
            netSum, taxSum, totalSum, taxRate, currency,
            tenantName, logoUrl, primary, accent,
          });

          // Upload to storage + signed url
          let downloadUrl = "";
          try {
            const path = `${tenantId}/${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.html`;
            await supabase.storage.from("charging-invoices").upload(path, new Blob([html], { type: "text/html" }), {
              contentType: "text/html", upsert: true,
            });
            const { data: signed } = await supabase.storage.from("charging-invoices").createSignedUrl(path, 60 * 60 * 24 * 30);
            if (signed?.signedUrl) downloadUrl = signed.signedUrl;
            await supabase.from("charging_invoices").update({ pdf_storage_path: path }).eq("id", invoiceId);
          } catch (e: any) {
            r.errors.push(`Storage: ${e.message}`);
          }

          const dlSection = downloadUrl
            ? `<div style="text-align:center;margin:24px 0"><a href="${downloadUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,${primary},${accent});color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">📥 Sammelrechnung herunterladen</a><div style="font-size:11px;color:#94a3b8;margin-top:8px">Link 30 Tage gültig.</div></div>`
            : "";

          try {
            await resend.emails.send({
              from: resendFrom(tenantName || "Ladeinfrastruktur"),
              to: [grp.billing_email],
              subject: `Sammelrechnung Ladeinfrastruktur ${invoiceNumber} – ${period.label}`,
              html: html.replace("<!-- Footer -->", `${dlSection}\n  <!-- Footer -->`).replace("</body>", `${dlSection}</body>`),
            });
            r.emails_sent++;
          } catch (e: any) {
            r.errors.push(`Email: ${e.message}`);
          }
        }
      } catch (e: any) {
        r.errors.push(`Group: ${e.message}`);
      }
      results.push(r);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
