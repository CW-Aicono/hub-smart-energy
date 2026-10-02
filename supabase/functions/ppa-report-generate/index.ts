import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Generates an HTML report for one PPA settlement and stores it as a ppa_document.
// Body: { contract_id: string, settlement_id?: string, period_start?: string }

function fmtEur(v: number | null | undefined): string {
  if (v == null || !isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
function fmtKwh(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " kWh";
}
function fmtCt(v: number | null | undefined): string {
  if (v == null) return "—";
  return (Number(v) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " ct/kWh";
}

function buildHtml(opts: {
  contract: any;
  settlement: any;
}): string {
  const c = opts.contract;
  const s = opts.settlement;
  const period = new Date(s.period_start).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const breakdown: any[] = s.breakdown?.hours ?? [];
  const dailyMap = new Map<string, { kwh: number; cost: number; spotSum: number; n: number }>();
  for (const h of breakdown) {
    const day = h.hour.slice(0, 10);
    const e = dailyMap.get(day) ?? { kwh: 0, cost: 0, spotSum: 0, n: 0 };
    e.kwh += Number(h.kwh ?? 0);
    e.cost += Number(h.cost ?? 0);
    if (h.spot != null) { e.spotSum += Number(h.spot); e.n++; }
    dailyMap.set(day, e);
  }
  const daily = Array.from(dailyMap.entries()).sort();

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>PPA-Abrechnung ${period}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:900px;margin:30px auto;padding:0 20px;}
h1{color:#0d3a5e;border-bottom:2px solid #0d3a5e;padding-bottom:6px}
h2{color:#155e75;margin-top:32px}
table{border-collapse:collapse;width:100%;margin-top:12px;font-size:14px}
th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left}
th{background:#f1f5f9}
.right{text-align:right}
.kpi{display:inline-block;padding:12px 18px;margin:6px 8px 6px 0;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
.kpi .l{font-size:11px;color:#64748b;text-transform:uppercase}
.kpi .v{font-size:20px;font-weight:600;margin-top:4px}
.footer{margin-top:40px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}
</style></head>
<body>
<h1>PPA-Abrechnung – ${period}</h1>
<p><strong>${c.producer_name}</strong> → <strong>${c.offtaker_name}</strong><br>
Vertragsnummer: ${c.reference_number ?? "—"} · ${c.ppa_type === "onsite" ? "On-site" : "Off-site"} PPA</p>

<div>
  <div class="kpi"><div class="l">Verbrauch</div><div class="v">${fmtKwh(s.delivered_kwh)}</div></div>
  <div class="kpi"><div class="l">Ø Spotpreis</div><div class="v">${fmtCt(s.avg_spot_price_eur_kwh)}</div></div>
  <div class="kpi"><div class="l">Ø Vertragspreis</div><div class="v">${fmtCt(s.applied_avg_price_eur_kwh)}</div></div>
  <div class="kpi"><div class="l">Summe</div><div class="v">${fmtEur(s.total_amount_eur)}</div></div>
</div>

<h2>Tagesübersicht</h2>
<table>
<thead><tr><th>Tag</th><th class="right">Verbrauch</th><th class="right">Ø Spot</th><th class="right">Kosten</th></tr></thead>
<tbody>
${daily.map(([day, e]) => `<tr>
  <td>${new Date(day).toLocaleDateString("de-DE")}</td>
  <td class="right">${fmtKwh(e.kwh)}</td>
  <td class="right">${e.n > 0 ? fmtCt(e.spotSum / e.n) : "—"}</td>
  <td class="right">${fmtEur(e.cost)}</td>
</tr>`).join("")}
</tbody>
</table>

<div class="footer">
  Generiert am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · AICONO EMS · PPA-Modul<br>
  Preismodell: ${c.price_model} · ${breakdown.length.toLocaleString("de-DE")} Stundenwerte berücksichtigt
</div>
</body></html>`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userTenantId: string | null = null;
    let userId: string | null = null;
    if (!isServiceRole) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claims.claims.sub;
      const { data: prof } = await supabase
        .from("profiles").select("tenant_id").eq("user_id", userId).maybeSingle();
      userTenantId = prof?.tenant_id ?? null;
      if (!userTenantId) {
        return new Response(JSON.stringify({ error: "Kein Mandant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { contract_id, settlement_id, period_start } = body ?? {};
    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cQ = supabase.from("ppa_contracts").select("*").eq("id", contract_id);
    if (userTenantId) cQ = cQ.eq("tenant_id", userTenantId);
    const { data: contract, error: cErr } = await cQ.maybeSingle();
    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sQ = supabase.from("ppa_settlements").select("*").eq("contract_id", contract_id);
    if (settlement_id) sQ = sQ.eq("id", settlement_id);
    else if (period_start) sQ = sQ.eq("period_start", period_start);
    else sQ = sQ.order("period_start", { ascending: false }).limit(1);
    const { data: settlements, error: sErr } = await sQ;
    if (sErr) throw sErr;
    const settlement = (settlements ?? [])[0];
    if (!settlement) {
      return new Response(JSON.stringify({ error: "No settlement found – berechne zuerst die Abrechnung" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = buildHtml({ contract, settlement });
    const bytes = new TextEncoder().encode(html);
    const hash = await sha256Hex(bytes);
    const periodLabel = settlement.period_start;
    const filename = `PPA-Report-${periodLabel}.html`;
    const storagePath = `${contract.tenant_id}/${contract_id}/${crypto.randomUUID()}-${filename}`;

    const { error: upErr } = await supabase.storage
      .from("ppa-documents")
      .upload(storagePath, bytes, { contentType: "text/html", upsert: false });
    if (upErr) throw upErr;

    const { data: docRow, error: docErr } = await supabase
      .from("ppa_documents")
      .insert({
        tenant_id: contract.tenant_id,
        contract_id,
        doc_type: "meter_report",
        filename,
        storage_path: storagePath,
        file_hash: hash,
        file_size_bytes: bytes.length,
        mime_type: "text/html",
        valid_from: settlement.period_start,
        valid_until: settlement.period_end,
      })
      .select()
      .single();
    if (docErr) throw docErr;

    return new Response(
      JSON.stringify({ document_id: docRow.id, filename, storage_path: storagePath, sha256: hash }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
