import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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
      .select("id, name, support_price_per_15min, is_aicono_member, is_kommune");
    if (tErr) throw tErr;

    // 2. Get all tenant_modules (active)
    const { data: allModules, error: mErr } = await supabase
      .from("tenant_modules")
      .select("tenant_id, module_code, is_enabled, price_override, charge_point_price_override");
    if (mErr) throw mErr;

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
      .select("id, tenant_id, line_items, module_total, support_total, amount, period_start, period_end, status, lexware_invoice_id")
      .gte("period_start", fmt(lastMonthStart))
      .lte("period_start", fmt(lastMonthEnd))
      .neq("status", "voided");
    // Group by tenant – only merge invoices not yet sent to Lexware
    const existingByTenant: Record<string, any> = {};
    const duplicatesToDelete: string[] = [];
    for (const inv of existingInvoices ?? []) {
      // Never merge into or delete Lexware-synced invoices
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
      const tenantModules = (allModules ?? []).filter(
        (m: any) => m.tenant_id === tenant.id && m.is_enabled
      );
      const hasRemoteSupport = tenantModules.some(
        (m: any) => m.module_code === "remote_support"
      );
      const supportPrice15min = Number(tenant.support_price_per_15min ?? 25);
      const isMember = !!(tenant as any).is_aicono_member;
      const isKommune = (tenant as any).is_kommune !== false;

      // Module line items (for current month)
      const moduleLineItems: any[] = [];
      let moduleTotal = 0;
      const activeCp = activeCpByTenant[tenant.id] ?? 0;
      const tenantDiscounts = discountsByTenant[tenant.id] ?? [];
      const monthlyModuleDiscounts = tenantDiscounts.filter((d: any) => (d.payment_mode ?? "monthly") === "monthly" && !d.bundle_id);
      const prepaidDiscounts = tenantDiscounts.filter((d: any) => (d.payment_mode ?? "monthly") !== "monthly");
      const grossByCode: Record<string, number> = {};
      const netByCode: Record<string, number> = {};
      for (const tm of tenantModules) {
        if (tm.module_code === "dashboard") continue;
        const priceEntry = globalPriceMap[tm.module_code];
        let globalPrice = 0;
        let globalCpPrice = 0;
        if (priceEntry) {
          if (isKommune) {
            globalPrice = isMember ? priceEntry.member : priceEntry.standard;
            globalCpPrice = isMember ? priceEntry.cp : priceEntry.stdCp;
          } else {
            globalPrice = isMember ? priceEntry.industryMember : priceEntry.industryStandard;
            globalCpPrice = isMember ? priceEntry.industryCp : priceEntry.industryStdCp;
          }
        }
        // Pauschale und Ladepunktpreis sind frei kombinierbar (0 = nicht berechnet)
        const flat = tm.price_override != null ? Number(tm.price_override) : globalPrice;
        // Ladepunktpreis nur als Unterpunkt von Ladeinfrastruktur
        const cpPrice = tm.module_code !== "ev_charging" ? 0
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
        if (flat <= 0 && !(cpPrice > 0 && activeCp > 0)) {
          // Modul ohne Kosten trotzdem ausweisen (Transparenz wie bisher)
          moduleLineItems.push({ type: "module", code: tm.module_code, label: tm.module_code, amount: 0 });
        }
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
      for (const d of tenantDiscounts.filter((x: any) => x.bundle_id && (x.payment_mode ?? "monthly") === "monthly")) {
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
      for (const d of prepaidDiscounts) {
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

        invoicesToUpdate.push({
          id: existing.id,
          period_start: fmt(lastMonthStart),
          period_end: fmt(lastMonthEnd),
          line_items: mergedLines,
          module_total: moduleTotal,
          support_total: mergedSupportTotal,
          amount: moduleTotal + mergedSupportTotal,
        });
      } else {
        invoiceCounter++;
        const invNum = `DRAFT`;

        invoicesToInsert.push({
          tenant_id: tenant.id,
          invoice_number: invNum,
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
        })
        .eq("id", upd.id);
      if (updErr) throw updErr;
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
