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

    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // 1. Get all tenants
    const { data: tenants, error: tErr } = await supabase
      .from("tenants")
      .select("id, name, support_price_per_15min");
    if (tErr) throw tErr;

    // 2. Get all tenant_modules (active)
    const { data: allModules, error: mErr } = await supabase
      .from("tenant_modules")
      .select("tenant_id, module_code, is_enabled, price_override");
    if (mErr) throw mErr;

    // 3. Get global module prices
    const { data: globalPrices, error: gpErr } = await supabase
      .from("module_prices")
      .select("module_code, price_monthly");
    if (gpErr) throw gpErr;

    const globalPriceMap: Record<string, number> = {};
    for (const gp of globalPrices ?? []) {
      globalPriceMap[gp.module_code] = Number(gp.price_monthly);
    }

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
      .select("id, tenant_id, line_items, module_total, support_total, amount, period_start, period_end, status")
      .gte("period_start", fmt(lastMonthStart))
      .lte("period_start", fmt(lastMonthEnd))
      .neq("status", "voided");
    // Group by tenant – if multiple exist for same tenant+month, pick the first and merge
    const existingByTenant: Record<string, any> = {};
    const duplicatesToDelete: string[] = [];
    for (const inv of existingInvoices ?? []) {
      if (!existingByTenant[inv.tenant_id]) {
        existingByTenant[inv.tenant_id] = inv;
      } else {
        // Merge this duplicate into the primary invoice
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

      // Module line items (for current month)
      const moduleLineItems: any[] = [];
      let moduleTotal = 0;
      for (const tm of tenantModules) {
        if (tm.module_code === "dashboard") continue;
        const price =
          tm.price_override != null
            ? Number(tm.price_override)
            : globalPriceMap[tm.module_code] ?? 0;
        moduleLineItems.push({
          type: "module",
          code: tm.module_code,
          label: tm.module_code,
          amount: price,
        });
        moduleTotal += price;
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

        supportLineItems.push({
          type: "support",
          session_id: s.id,
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
        const mergedLines = [...moduleLineItems, ...keptSupportLines, ...supportLineItems];
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
