import { loadUsage, prevMonth } from "../_shared/packageUsageLoader.ts";
import { backCharge, monthDelta } from "../_shared/packageUsage.ts";
import { buildCollective, commissionCredit, directDraftWarnings, mergeCustomLines, partnerCustomerLines, priceLines, routeTenant, type FlowPartner, type FlowTenant } from "../_shared/partnerInvoiceFlows.ts";
import { requireInternalOrUser } from "../_shared/internalAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  { const __deny = await requireInternalOrUser(req, ["admin","super_admin","partner_admin"]); if (__deny) return __deny; }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // 1. Get all tenants
    const { data: tenants, error: tErr } = await supabase
      .from("tenants")
      .select("id, name, partner_id, support_price_per_15min, is_aicono_member, is_kommune, package_billing, package_billing_from, created_at").is("deleted_at", null);
    if (tErr) throw tErr;

    // 2. Get all tenant_modules (active)
    const { data: allModules, error: mErr } = await supabase
      .from("tenant_modules")
      .select("tenant_id, module_code, is_enabled, price_override, charge_point_price_override");
    if (mErr) throw mErr;
    const { data: contractSales, error: csErr } = await supabase.from("license_sales").select("tenant_id,product_kind,product_code,starts_on,ended_on");
    if (csErr) throw csErr;
    const covered = (tenantId: string, kind: string, code: string) => (contractSales ?? []).some((s: any) => s.tenant_id === tenantId && s.product_kind === kind && s.product_code === code && s.starts_on <= fmt(lastMonthEnd));

    // 3. Get global module prices (member + standard + per charge point)
    const { data: globalPrices, error: gpErr } = await supabase
      .from("module_prices")
      .select("module_code, price_monthly, standard_price, industry_price_monthly, industry_standard_price, charge_point_price_monthly, industry_charge_point_price_monthly, standard_charge_point_price_monthly, industry_standard_charge_point_price_monthly");
    if (gpErr) throw gpErr;

    const globalPriceMap: Record<string, { member: number; standard: number; industryMember: number; industryStandard: number; cp: number; industryCp: number; stdCp: number; industryStdCp: number }> = {};
    for (const gp of globalPrices ?? []) {
      globalPriceMap[gp.module_code] = {
        member: Number(gp.price_monthly),
        standard: Number(gp.standard_price ?? gp.price_monthly),
        industryMember: Number(gp.industry_price_monthly ?? 0),
        industryStandard: Number(gp.industry_standard_price ?? 0),
        cp: Number(gp.charge_point_price_monthly ?? 0),
        industryCp: Number(gp.industry_charge_point_price_monthly ?? 0),
        stdCp: Number((gp as any).standard_charge_point_price_monthly ?? 0),
        industryStdCp: Number((gp as any).industry_standard_charge_point_price_monthly ?? 0),
      };
    }

    // 3b. Aktive Ladepunkte im Abrechnungsmonat (mind. ein Heartbeat seit Monatsbeginn)
    const activeCpByTenant: Record<string, number> = {};
    {
      const { data: cps, error: cpErr } = await supabase
        .from("charge_points")
        .select("tenant_id")
        .gte("last_heartbeat", lastMonthStart.toISOString());
      if (cpErr) throw cpErr;
      for (const cp of cps ?? []) {
        if (cp.tenant_id) activeCpByTenant[cp.tenant_id] = (activeCpByTenant[cp.tenant_id] ?? 0) + 1;
      }
    }

    // 3c. Rabatte, die den Abrechnungsmonat überlappen
    const discountsByTenant: Record<string, any[]> = {};
    {
      const { data: discounts, error: dErr } = await supabase
        .from("tenant_module_discounts")
        .select("id, tenant_id, module_code, bundle_id, discount_type, value, valid_from, valid_until, note, duration_value, duration_unit, payment_mode, one_time_amount, invoiced_at")
        .lte("valid_from", fmt(lastMonthEnd))
        .or(`valid_until.is.null,valid_until.gte.${fmt(lastMonthStart)}`);
      if (dErr) throw dErr;
      for (const d of discounts ?? []) {
        (discountsByTenant[d.tenant_id] ??= []).push(d);
      }
    }

    // 3d. Bundle -> Module (für Bundle-Rabatte, Vorkasse, Einmalzahlung)
    const bundleModules: Record<string, string[]> = {};
    const bundleNames: Record<string, string> = {};
    {
      const [{ data: items }, { data: bnames }] = await Promise.all([
        supabase.from("module_bundle_items").select("bundle_id, module_code"),
        supabase.from("module_bundles").select("id, name"),
      ]);
      for (const i of items ?? []) (bundleModules[i.bundle_id] ??= []).push(i.module_code);
      for (const b of bnames ?? []) bundleNames[b.id] = b.name;
    }
    const covers = (d: any, code: string) =>
      d.module_code ? d.module_code === code : d.bundle_id ? (bundleModules[d.bundle_id] ?? []).includes(code) : true;
    const invoicedDiscountIds: string[] = [];

    // 3e. Paketbuchungen (neue Preislogik). Mandanten mit Paketbuchung werden über
    // den Paketkatalog abgerechnet, alle anderen weiter über module_prices (Altpreis).
    const pkgByTenant: Record<string, string[]> = {};
    const pkgDefs: Record<string, { name: string; uvp: number; ek: number; always_active: boolean }> = {};
    const unitPrice: Record<string, { uvp: number; ek: number }> = {};
    const locCount: Record<string, number> = {};
    {
      const [{ data: bookings }, { data: defs }, { data: units }, { data: locs }] = await Promise.all([
        supabase.from("tenant_package_bookings").select("tenant_id, package_code, booked_at, cancelled_at")
          .lt("booked_at", lastMonthStart.toISOString())
          .or(`cancelled_at.is.null,cancelled_at.gte.${lastMonthStart.toISOString()}`),
        supabase.from("pricing_packages").select("code, name, uvp, ek, always_active"),
        supabase.from("pricing_unit_prices").select("code, uvp, ek"),
        supabase.from("locations").select("tenant_id"),
      ]);
      for (const b of bookings ?? []) (pkgByTenant[b.tenant_id] ??= []).push(b.package_code);
      for (const d of defs ?? []) pkgDefs[d.code] = { name: d.name, uvp: Number(d.uvp), ek: Number(d.ek), always_active: !!d.always_active };
      for (const u of units ?? []) unitPrice[u.code] = { uvp: Number(u.uvp), ek: Number(u.ek) };
      for (const l of locs ?? []) if (l.tenant_id) locCount[l.tenant_id] = (locCount[l.tenant_id] ?? 0) + 1;
      // Mandanten, deren gesamte Buchungshistorie erst im Abrechnungsmonat beginnt, sind über
      // die Anteilsrechnung abgedeckt; sie haben hier keine Einträge (booked_at < Monatsbeginn).
      const { data: anyBooking } = await supabase.from("tenant_package_bookings").select("tenant_id").lt("booked_at", currentMonthStart.toISOString());
      for (const b of anyBooking ?? []) pkgByTenant[b.tenant_id] ??= [];
    }
    const monthKey = fmt(lastMonthStart).slice(0, 7);
    const partnerDrafts: any[] = [];

    // 3f. Auf Paketabrechnung umgestellte Mandanten: Mengen automatisch aus den Zähldaten
    const isSwitched = (t: any) => !!t.package_billing && !!t.package_billing_from && t.package_billing_from <= fmt(lastMonthStart);
    const switchedList = (tenants ?? []).filter(isSwitched);
    const prevKey = prevMonth(monthKey);
    const usage = switchedList.length ? await loadUsage(supabase, switchedList, monthKey) : null;
    const usagePrev = switchedList.length ? await loadUsage(supabase, switchedList, prevKey) : null;
    // Partnermodell (Wiederverkauf / Provision) und Partner-Verkaufspreise
    const partnerMap: Record<string, FlowPartner> = {};
    const partnerPrices: Record<string, Record<string, number>> = {};
    {
      const [{ data: ps, error: pErr }, { data: pp, error: ppErr }] = await Promise.all([
        supabase.from("partners").select("id, name, billing_mode, commission_pct"),
        supabase.from("partner_module_prices").select("partner_id, module_code, sale_price_monthly"),
      ]);
      if (pErr) throw pErr;
      if (ppErr) throw ppErr;
      for (const p of ps ?? []) partnerMap[p.id] = { id: p.id, name: p.name, billing_mode: p.billing_mode, commission_pct: Number(p.commission_pct ?? 0) };
      for (const p of pp ?? []) if (p.sale_price_monthly != null) (partnerPrices[p.partner_id] ??= {})[p.module_code] = Number(p.sale_price_monthly);
    }
    // Bereits berechnete Mengen des Vormonats je Kunde (Einzel- oder Sammelrechnung)
    const prevBilled: Record<string, any[]> = {};
    if (switchedList.length) {
      const refs = switchedList.flatMap((t: any) => [`monthly:partner:${t.id}:${prevKey}`, `monthly:tenant:${t.id}:${prevKey}`]);
      for (const pid of new Set(switchedList.map((t: any) => t.partner_id).filter(Boolean))) refs.push(`monthly:partner-sum:${pid}:${prevKey}`);
      const { data: pi } = await supabase.from("tenant_invoices").select("tenant_id, source_ref, line_items").in("source_ref", refs).neq("status", "voided");
      for (const i of pi ?? []) {
        const collective = i.source_ref.startsWith("monthly:partner-sum:");
        for (const li of (i.line_items ?? []) as any[]) {
          const tid = collective ? li.tenant_id : i.tenant_id;
          if (tid) (prevBilled[tid] ??= []).push(li);
        }
      }
    }
    const collectives: Record<string, { tenant: FlowTenant; lines: any[] }[]> = {};
    const commissions: Record<string, { tenant: FlowTenant; uvp: number }[]> = {};
    const customerDrafts: any[] = [];
    const reviewByPartner: Record<string, boolean> = {};

    // 4. Get support sessions from last month for all tenants
    const { data: supportSessions, error: sErr } = await supabase
      .from("support_sessions")
      .select("id, tenant_id, started_at, ended_at, expires_at, reason, duration_minutes, is_manual")
      .gte("started_at", lastMonthStart.toISOString())
      .lt("started_at", currentMonthStart.toISOString());
    if (sErr) throw sErr;

    // Group support sessions by tenant
    const sessionsByTenant: Record<string, any[]> = {};
    for (const s of supportSessions ?? []) {
      if (!sessionsByTenant[s.tenant_id]) sessionsByTenant[s.tenant_id] = [];
      sessionsByTenant[s.tenant_id].push(s);
    }

    // 5. Check for existing invoices this month (prevent duplicates)
    // Match by month: any invoice whose period overlaps this billing month
    const { data: existingInvoices } = await supabase
      .from("tenant_invoices")
      .select("id, tenant_id, partner_id, invoice_kind, source_ref, line_items, module_total, support_total, amount, period_start, period_end, status, lexware_invoice_id, issued_at")
      .gte("period_start", fmt(lastMonthStart))
      .lte("period_start", fmt(lastMonthEnd))
      .neq("status", "voided");
    // Group by tenant – only merge invoices not yet sent to Lexware
    const existingByTenant: Record<string, any> = {};
    const duplicatesToDelete: string[] = [];
    const lockedTenants = new Set<string>();
    for (const inv of existingInvoices ?? []) {
      // Never merge into or delete Lexware-synced invoices
      // Einmalrechnungen und an Partner adressierte Rechnungen nie zusammenführen
      if (inv.invoice_kind === "one_time" || inv.partner_id || inv.source_ref?.startsWith("license")) continue;
      if (inv.issued_at) {
        // In AICONO festgeschriebene Rechnung: Monat gilt als abgerechnet, nie ändern
        lockedTenants.add(inv.tenant_id);
        continue;
      }
      if (inv.lexware_invoice_id) {
        // Keep Lexware-synced invoices as-is, don't use as merge target
        continue;
      }
      if (!existingByTenant[inv.tenant_id]) {
        existingByTenant[inv.tenant_id] = inv;
      } else {
        // Merge this duplicate into the primary invoice (both are non-Lexware)
        const primary = existingByTenant[inv.tenant_id];
        const extraLines = Array.isArray(inv.line_items) ? inv.line_items : [];
        const primaryLines = Array.isArray(primary.line_items) ? primary.line_items : [];
        primary.line_items = [...primaryLines, ...extraLines];
        primary.module_total = Number(primary.module_total ?? 0) + Number(inv.module_total ?? 0);
        primary.support_total = Number(primary.support_total ?? 0) + Number(inv.support_total ?? 0);
        primary.amount = Number(primary.amount ?? 0) + Number(inv.amount ?? 0);
        duplicatesToDelete.push(inv.id);
      }
    }

    // Delete duplicates that were merged
    for (const dupId of duplicatesToDelete) {
      await supabase.from("tenant_invoices").delete().eq("id", dupId);
    }

    const invoicesToInsert: any[] = [];
    const invoicesToUpdate: any[] = [];
    let invoiceCounter = 0;

    for (const tenant of tenants ?? []) {
      if (lockedTenants.has(tenant.id)) continue;
      if (isSwitched(tenant) && usage) {
        const u = usage.results[tenant.id];
        const partner = tenant.partner_id ? partnerMap[tenant.partner_id] : null;
        const route = routeTenant(tenant, partner);
        const flowLines: any[] = u.lines.filter((l) => !l.viaContract).map((l) => ({ ...l }));
        // Nachberechnung: nachträglich erfasste Mengen des Vormonats (nur wenn der Vormonat bereits nach Paketen lief)
        if (prevBilled[tenant.id] && usagePrev) {
          const billedQty: Record<string, number> = {};
          for (const li of prevBilled[tenant.id]) if (li.code && (li.type === "package_unit" || li.type === "back_charge")) billedQty[li.code] = (billedQty[li.code] ?? 0) + Number(li.quantity ?? 0);
          for (const l of backCharge(usagePrev.results[tenant.id], billedQty, usage.units, prevKey)) flowLines.push(l);
        }
        if (!flowLines.length) continue;
        const delta = monthDelta(u, tenant.package_billing_from < fmt(lastMonthStart) && usagePrev ? usagePrev.results[tenant.id] : null);
        if (route === "reseller") {
          // Wiederverkauf: Sammelrechnung an Partner (EK) + Endkunden-Entwurf des Partners (außer Eigenbedarf)
          (collectives[partner!.id] ??= []).push({ tenant, lines: flowLines });
          if (delta.plausibility || u.review) reviewByPartner[partner!.id] = true;
          if (!tenant.partner_self_customer) {
            const pl = partnerCustomerLines(flowLines, partnerPrices[partner!.id] ?? {});
            customerDrafts.push({ partner_id: partner!.id, tenant_id: tenant.id, source_ref: `monthly:pci:${tenant.id}:${monthKey}`,
              period_start: fmt(lastMonthStart), period_end: fmt(lastMonthEnd), lines: pl });
          }
          continue;
        }
        // Direktkunde und Provisionsmodell: AICONO rechnet mit dem Kunden zur UVP ab
        const lines = priceLines(flowLines, "uvp");
        const sum = Math.round(lines.reduce((x, l) => x + Number(l.amount || 0), 0) * 100) / 100;
        if (route === "commission") (commissions[partner!.id] ??= []).push({ tenant, uvp: sum });
        const deltaText = delta.text ? `${delta.text}, ${delta.uvp >= 0 ? "+" : ""}${delta.uvp.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : null;
        partnerDrafts.push({ tenant_id: tenant.id, partner_id: null, invoice_kind: "recurring",
          source_ref: `monthly:tenant:${tenant.id}:${monthKey}`, invoice_number: sum > 0 ? "DRAFT" : "ABO-BELEG",
          document_type: sum > 0 ? "invoice" : "subscription_notice", status: "draft",
          period_start: fmt(lastMonthStart), period_end: fmt(lastMonthEnd), amount: sum, module_total: sum, support_total: 0,
          usage_review: delta.plausibility || u.review, usage_delta: deltaText, line_items: lines });
        continue;
      }
      const tenantModules = (allModules ?? []).filter(
        (m: any) => m.tenant_id === tenant.id && m.is_enabled
      );
      const hasRemoteSupport = tenantModules.some(
        (m: any) => m.module_code === "remote_support"
      );
      const supportPrice15min = Number(tenant.support_price_per_15min ?? 25);

      // Module line items (for current month)
      const moduleLineItems: any[] = [];
      let moduleTotal = 0;
      const activeCp = activeCpByTenant[tenant.id] ?? 0;
      const tenantDiscounts = discountsByTenant[tenant.id] ?? [];
      const monthlyModuleDiscounts = tenantDiscounts.filter((d: any) => (d.payment_mode ?? "monthly") === "monthly" && !d.bundle_id);
      const prepaidDiscounts = tenantDiscounts.filter((d: any) => (d.payment_mode ?? "monthly") !== "monthly");
      const grossByCode: Record<string, number> = {};
      const netByCode: Record<string, number> = {};
      const isPkg = Object.prototype.hasOwnProperty.call(pkgByTenant, tenant.id);
      if (isPkg) {
        // Paketkunde: Pakete + Mengenpreise. Partnerkunde -> Entwurf an Partner zum EK, sonst Kunde zur UVP.
        const toPartner = !!tenant.partner_id;
        const price = (x: { uvp: number; ek: number } | undefined) => Number((toPartner ? x?.ek : x?.uvp) ?? 0);
        const codes = [...new Set(pkgByTenant[tenant.id])];
        const lines: any[] = [];
        for (const c of codes) {
          if (covered(tenant.id, "package", c)) continue;
          const d = pkgDefs[c];
          if (!d || d.always_active) continue;
          const a = price(d);
          if (a > 0) lines.push({ type: "package", code: c, label: d.name, quantity: 1, unit_price: a, amount: a });
        }
        const extraLoc = codes.includes("p6_enterprise") ? 0 : Math.max(0, (locCount[tenant.id] ?? 0) - 1);
        const lp = price(unitPrice["extra_location"]);
        if (extraLoc > 0 && lp > 0 && !covered(tenant.id, "unit", "extra_location")) lines.push({ type: "package_unit", code: "extra_location", label: `${extraLoc} weitere Liegenschaft(en)`, quantity: extraLoc, unit_price: lp, amount: Math.round(extraLoc * lp * 100) / 100 });
        const cpp = price(unitPrice["charge_point"]);
        if (codes.includes("p4_charging") && activeCp > 0 && cpp > 0 && !covered(tenant.id, "unit", "charge_point")) lines.push({ type: "package_unit", code: "charge_point", label: `${activeCp} aktive Ladepunkte`, quantity: activeCp, unit_price: cpp, amount: Math.round(activeCp * cpp * 100) / 100 });
        const sum = Math.round(lines.reduce((x, l) => x + l.amount, 0) * 100) / 100;
        if (toPartner) {
          if (lines.length) partnerDrafts.push({ tenant_id: tenant.id, partner_id: tenant.partner_id, invoice_kind: "recurring",
            source_ref: `monthly:partner:${tenant.id}:${monthKey}`, invoice_number: sum > 0 ? "DRAFT" : "ABO-BELEG",
            document_type: sum > 0 ? "invoice" : "subscription_notice", status: "draft",
            period_start: fmt(lastMonthStart), period_end: fmt(lastMonthEnd), amount: sum, module_total: sum, support_total: 0,
            line_items: lines.map((l) => ({ ...l, label: `${l.label} – ${tenant.name}` })) });
        } else {
          moduleLineItems.push(...lines);
          moduleTotal += sum;
        }
      }
      for (const tm of isPkg ? [] : tenantModules) {
        if (tm.module_code === "dashboard") continue;
        if (covered(tenant.id, "module", tm.module_code) || (["ev_charging", "adhoc_payment"].includes(tm.module_code) && covered(tenant.id, "unit", "charge_point"))) continue;
        const packageCovered = (contractSales ?? []).some((s: any) => s.tenant_id === tenant.id && s.product_kind === "package" && s.starts_on <= fmt(lastMonthEnd));
        if (packageCovered) {
          const { data: maps, error: mapErr } = await supabase.from("pricing_package_modules").select("package_code").eq("module_code", tm.module_code);
          if (mapErr) throw mapErr;
          if ((maps ?? []).some((p: any) => covered(tenant.id, "package", p.package_code))) continue;
        }
        const priceEntry = globalPriceMap[tm.module_code];
        let globalPrice = 0;
        let globalCpPrice = 0;
        if (priceEntry) {
          // Einheitspreis für alle Kunden (keine Mitglieds-/Kommune-Unterscheidung mehr)
          globalPrice = priceEntry.standard;
          globalCpPrice = priceEntry.stdCp;
        }
        // Pauschale und Ladepunktpreis sind frei kombinierbar (0 = nicht berechnet)
        const flat = tm.price_override != null ? Number(tm.price_override) : globalPrice;
        // Ladepunktpreis nur als Unterpunkt von Ladeinfrastruktur
        const cpPrice = tm.module_code !== "ev_charging" || covered(tenant.id, "unit", "charge_point") ? 0
          : tm.charge_point_price_override != null ? Number(tm.charge_point_price_override) : globalCpPrice;
        const cpGross = cpPrice > 0 && activeCp > 0 ? Math.round(cpPrice * activeCp * 100) / 100 : 0;
        grossByCode[tm.module_code] = flat + cpGross;
        // Durch Vorkasse/Einmalzahlung abgedeckt -> keine Monatsberechnung
        const cover = prepaidDiscounts.find((d: any) => d.valid_until && covers(d, tm.module_code));
        if (cover) {
          moduleLineItems.push({ type: "module", code: tm.module_code, label: `${tm.module_code} – abgedeckt durch ${cover.payment_mode === "one_time" ? "Einmalzahlung" : "Vorkasse"} bis ${new Date(cover.valid_until).toLocaleDateString("de-DE")}`, amount: 0 });
          netByCode[tm.module_code] = 0;
          continue;
        }
        let gross = 0;
        if (flat > 0) {
          moduleLineItems.push({ type: "module", code: tm.module_code, label: tm.module_code, amount: flat });
          gross += flat;
        }
        if (cpPrice > 0 && activeCp > 0) {
          const cpAmount = Math.round(cpPrice * activeCp * 100) / 100;
          moduleLineItems.push({
            type: "module_charge_points",
            code: tm.module_code,
            label: `${tm.module_code} – ${activeCp} Ladepunkte × ${cpPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`,
            quantity: activeCp,
            unit_price: cpPrice,
            amount: cpAmount,
          });
          gross += cpAmount;
        }
        if (gross <= 0) { netByCode[tm.module_code] = 0; continue; } // Module ohne Preis nicht ausweisen
        // Rabatt: im Abrechnungsmonat gültig, günstigster gilt, nie unter 0
        let best: { amount: number; d: any } | null = null;
        for (const d of monthlyModuleDiscounts) {
          if (d.module_code && d.module_code !== tm.module_code) continue;
          const amt = d.discount_type === "percent" ? gross * Number(d.value) / 100 : Number(d.value);
          const capped = Math.min(gross, Math.round(amt * 100) / 100);
          if (capped > 0 && (!best || capped > best.amount)) best = { amount: capped, d };
        }
        if (best) {
          const d = best.d;
          const what = d.discount_type === "percent" ? `${Number(d.value).toLocaleString("de-DE")} %` : `${Number(d.value).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;
          const until = d.valid_until ? ` bis ${new Date(d.valid_until).toLocaleDateString("de-DE")}` : "";
          moduleLineItems.push({
            type: "discount",
            code: tm.module_code,
            discount_id: d.id,
            label: `${d.note || "Rabatt"} ${what}${until}`,
            amount: -best.amount,
          });
          gross -= best.amount;
        }
        netByCode[tm.module_code] = gross;
        moduleTotal += gross;
      }

      // Bundle-Rabatte (monatlich) auf die Summe der Bundle-Module nach Modul-Rabatten
      for (const d of isPkg ? [] : tenantDiscounts.filter((x: any) => x.bundle_id && (x.payment_mode ?? "monthly") === "monthly")) {
        const base = (bundleModules[d.bundle_id] ?? []).reduce((s2, c) => s2 + (netByCode[c] ?? 0), 0);
        const raw = d.discount_type === "percent" ? base * Number(d.value) / 100 : Number(d.value);
        const amt = Math.max(0, Math.min(base, Math.round(raw * 100) / 100));
        if (amt <= 0) continue;
        const what = d.discount_type === "percent" ? `${Number(d.value).toLocaleString("de-DE")} %` : `${Number(d.value).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;
        const until = d.valid_until ? ` bis ${new Date(d.valid_until).toLocaleDateString("de-DE")}` : "";
        moduleLineItems.push({ type: "discount", bundle_id: d.bundle_id, discount_id: d.id, label: `${d.note || "Bundle-Rabatt"} ${bundleNames[d.bundle_id] ?? ""} ${what}${until}`.trim(), amount: -amt });
        moduleTotal -= amt;
      }

      // Vorkasse / Einmalzahlung: einmalig für die ganze Laufzeit berechnen
      for (const d of isPkg ? [] : prepaidDiscounts) {
        if (d.invoiced_at || d.valid_from > fmt(lastMonthEnd)) continue;
        const months = Number(d.duration_value ?? 0) * (d.duration_unit === "year" ? 12 : 1);
        if (!(months > 0)) continue;
        const target = d.module_code ?? (d.bundle_id ? `Bundle ${bundleNames[d.bundle_id] ?? ""}` : "alle Module");
        const period = `${new Date(d.valid_from).toLocaleDateString("de-DE")} – ${new Date(d.valid_until).toLocaleDateString("de-DE")}`;
        let amount: number;
        let label: string;
        if (d.payment_mode === "one_time") {
          amount = Number(d.one_time_amount ?? 0);
          label = `Einmalzahlung ${target}, ${months} Monate (${period})`;
        } else {
          const monthly = tenantModules.filter((m: any) => covers(d, m.module_code)).reduce((s2: number, m: any) => s2 + (grossByCode[m.module_code] ?? 0), 0);
          const gross = monthly * months;
          const disc = d.discount_type === "percent" ? gross * Number(d.value) / 100 : Number(d.value) * months;
          amount = Math.max(0, Math.round((gross - disc) * 100) / 100);
          const what = d.discount_type === "percent" ? `${Number(d.value).toLocaleString("de-DE")} %` : `${Number(d.value).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €/Monat`;
          label = `Vorkasse ${target}, ${months} Monate × ${monthly.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € abzgl. ${what} (${period})`;
        }
        moduleLineItems.push({ type: d.payment_mode === "one_time" ? "one_time" : "prepaid", discount_id: d.id, label, months, amount });
        moduleTotal += amount;
        invoicedDiscountIds.push(d.id);
      }

      // Support line items (for last month)
      const sessions = sessionsByTenant[tenant.id] ?? [];
      const supportLineItems: any[] = [];
      let supportTotal = 0;
      for (const s of sessions) {
        const durationMin = s.duration_minutes
          ? s.duration_minutes
          : Math.max(1, Math.round(((s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.expires_at).getTime()) - new Date(s.started_at).getTime()) / 60000));
        const blocks = Math.ceil(durationMin / 15);
        const cost = hasRemoteSupport ? 0 : blocks * supportPrice15min;

        const sessionDate = new Date(s.started_at).toLocaleDateString("de-DE");
        const label = s.reason ? `${sessionDate} – ${s.reason}` : `${sessionDate} – Support`;

        supportLineItems.push({
          type: "support",
          session_id: s.id,
          label,
          started_at: s.started_at,
          duration_min: durationMin,
          blocks_15min: blocks,
          price_per_block: hasRemoteSupport ? 0 : supportPrice15min,
          amount: cost,
          reason: s.reason,
        });
        supportTotal += cost;
      }

      const totalAmount = moduleTotal + supportTotal;

      if (moduleLineItems.length === 0 && supportLineItems.length === 0)
        continue;

      const allLineItems = [...moduleLineItems, ...supportLineItems];
      const existing = existingByTenant[tenant.id];

      if (existing) {
        // Merge: keep existing support items not in new sessions, replace modules, add new support
        const existingLines = Array.isArray(existing.line_items) ? existing.line_items : [];
        const newSessionIds = new Set(supportLineItems.map((li: any) => li.session_id));
        const keptSupportLines = (existingLines as any[]).filter(
          (li: any) => li.type === "support" && !newSessionIds.has(li.session_id)
        );
        const keptSupportTotal = keptSupportLines.reduce((s: number, li: any) => s + Number(li.amount ?? 0), 0);
        // Bereits berechnete Vorkasse/Einmalzahlung bei Neuberechnung behalten
        const newDiscountIds = new Set(moduleLineItems.map((li: any) => li.discount_id).filter(Boolean));
        const keptPrepaid = (existingLines as any[]).filter((li: any) => (li.type === "prepaid" || li.type === "one_time") && !newDiscountIds.has(li.discount_id));
        const keptPrepaidTotal = keptPrepaid.reduce((s2: number, li: any) => s2 + Number(li.amount ?? 0), 0);
        moduleTotal += keptPrepaidTotal;
        const mergedLines = [...moduleLineItems, ...keptPrepaid, ...keptSupportLines, ...supportLineItems];
        const mergedSupportTotal = keptSupportTotal + supportTotal;

        const mergedAmount = moduleTotal + mergedSupportTotal;
        invoicesToUpdate.push({
          id: existing.id,
          document_type: mergedAmount > 0 ? "invoice" : "subscription_notice",
          period_start: fmt(lastMonthStart),
          period_end: fmt(lastMonthEnd),
          line_items: mergedLines,
          module_total: moduleTotal,
          support_total: mergedSupportTotal,
          amount: mergedAmount,
        });
      } else {
        invoiceCounter++;
        const invNum = `DRAFT`;

        invoicesToInsert.push({
          tenant_id: tenant.id,
          source_ref: `monthly:tenant:${tenant.id}:${monthKey}`,
          invoice_number: totalAmount > 0 ? invNum : "ABO-BELEG",
          // 0 € = keine Rechnung, sondern Abo-Beleg (nicht buchbar, nie an Lexware)
          document_type: totalAmount > 0 ? "invoice" : "subscription_notice",
          period_start: fmt(lastMonthStart),
          period_end: fmt(lastMonthEnd),
          amount: totalAmount,
          module_total: moduleTotal,
          support_total: supportTotal,
          status: "draft",
          line_items: allLineItems,
        });
      }
    }

    if (invoicesToInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("tenant_invoices")
        .insert(invoicesToInsert);
      if (insErr) throw insErr;
    }

    for (const upd of invoicesToUpdate) {
      const { error: updErr } = await supabase
        .from("tenant_invoices")
        .update({
          period_start: upd.period_start,
          period_end: upd.period_end,
          line_items: upd.line_items,
          module_total: upd.module_total,
          support_total: upd.support_total,
          amount: upd.amount,
          document_type: upd.document_type,
        })
        .eq("id", upd.id);
      if (updErr) throw updErr;
    }

    // Wiederverkauf: eine Sammelrechnung je Partner und Monat (EK, gegliedert nach Kunde)
    for (const [pid, entries] of Object.entries(collectives)) {
      const c = buildCollective(entries);
      if (!c.lines.length) continue;
      // Frühere Einzelentwürfe je Kunde (vor der Sammelrechnung) durch die Sammelrechnung ersetzen
      const oldRefs = entries.map((e) => `monthly:partner:${e.tenant.id}:${monthKey}`);
      const { error: delErr } = await supabase.from("tenant_invoices").delete().in("source_ref", oldRefs)
        .is("issued_at", null).is("lexware_invoice_id", null).eq("status", "draft");
      if (delErr) throw delErr;
      const first = [...entries].sort((a, b) => a.tenant.name.localeCompare(b.tenant.name, "de"))[0].tenant;
      partnerDrafts.push({ tenant_id: first.id, partner_id: pid, invoice_kind: "recurring",
        source_ref: `monthly:partner-sum:${pid}:${monthKey}`, invoice_number: c.amount > 0 ? "DRAFT" : "ABO-BELEG",
        document_type: c.amount > 0 ? "invoice" : "subscription_notice", status: "draft",
        period_start: fmt(lastMonthStart), period_end: fmt(lastMonthEnd), amount: c.amount, module_total: c.amount, support_total: 0,
        usage_review: !!reviewByPartner[pid], usage_delta: `Sammelrechnung ${entries.length} Kunde(n)`, line_items: c.lines });
    }
    // Provision: monatliche Gutschrift an den Partner
    for (const [pid, entries] of Object.entries(commissions)) {
      const c = commissionCredit(partnerMap[pid], entries);
      if (!(c.amount > 0)) continue;
      partnerDrafts.push({ tenant_id: entries[0].tenant.id, partner_id: pid, invoice_kind: "recurring",
        source_ref: `commission:${pid}:${monthKey}`, invoice_number: "DRAFT", document_type: "credit_note", status: "draft",
        period_start: fmt(lastMonthStart), period_end: fmt(lastMonthEnd), amount: c.amount, module_total: c.amount, support_total: 0, line_items: c.lines });
    }
    // Endkunden-Entwürfe der Partner (eigene Preise); vom Partner ergänzte Positionen bleiben erhalten
    let customerDraftsCreated = 0;
    for (const d of customerDrafts) {
      const { data: ex, error: exErr } = await supabase.from("partner_customer_invoices").select("id, issued_at, status, line_items").eq("source_ref", d.source_ref).maybeSingle();
      if (exErr) throw exErr;
      if (ex && (ex.issued_at || ex.status !== "draft")) continue;
      const lines = mergeCustomLines(d.lines, ex?.line_items);
      const amount = Math.round(lines.reduce((s, l) => s + Number(l.amount || 0), 0) * 100) / 100;
      const row = { line_items: lines, amount, document_type: amount > 0 ? "invoice" : "subscription_notice", period_start: d.period_start, period_end: d.period_end };
      if (ex) {
        const { error } = await supabase.from("partner_customer_invoices").update(row).eq("id", ex.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_customer_invoices").insert({ ...row, partner_id: d.partner_id, tenant_id: d.tenant_id, source_ref: d.source_ref, status: "draft" });
        if (error && error.code !== "23505") throw error;
        if (!error) customerDraftsCreated++;
      }
    }
    // Warnung: Direktrechnungen an Kunden von Wiederverkaufs-Partnern
    const { data: openDirect, error: odErr } = await supabase.from("tenant_invoices").select("tenant_id, partner_id, issued_at, status")
      .is("partner_id", null).is("issued_at", null).eq("status", "draft");
    if (odErr) throw odErr;
    const warnings = directDraftWarnings(tenants ?? [], partnerMap, openDirect ?? []);

    // Partner-Entwürfe (EK): je Partnerkunde und Monat genau einer; offene Entwürfe werden aktualisiert
    let partnerCreated = 0;
    for (const pd of partnerDrafts) {
      const { data: ex } = await supabase.from("tenant_invoices").select("id, lexware_invoice_id, issued_at")
        .eq("source_ref", pd.source_ref).neq("status", "voided").maybeSingle();
      if (ex?.lexware_invoice_id || ex?.issued_at) continue;
      if (ex) {
        const { error } = await supabase.from("tenant_invoices").update({ line_items: pd.line_items, amount: pd.amount, module_total: pd.module_total, document_type: pd.document_type, invoice_number: pd.invoice_number, usage_review: pd.usage_review ?? false, usage_delta: pd.usage_delta ?? null }).eq("id", ex.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_invoices").insert(pd);
        if (error && error.code !== "23505") throw error;
        if (!error) partnerCreated++;
      }
    }

    if (invoicedDiscountIds.length > 0) {
      const { error: invErr } = await supabase.from("tenant_module_discounts")
        .update({ invoiced_at: new Date().toISOString() }).in("id", invoicedDiscountIds);
      if (invErr) throw invErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoices_created: invoicesToInsert.length,
        invoices_updated: invoicesToUpdate.length,
        partner_invoices_created: partnerCreated,
        month: fmt(lastMonthStart),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
