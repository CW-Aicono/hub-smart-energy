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
      .select("id, tenant_id, started_at, ended_at, expires_at, reason")
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
    const { data: existingInvoices } = await supabase
      .from("tenant_invoices")
      .select("tenant_id")
      .eq("period_start", fmt(currentMonthStart));
    const alreadyBilled = new Set(
      (existingInvoices ?? []).map((i: any) => i.tenant_id)
    );

    const invoicesToInsert: any[] = [];
    let invoiceCounter = 0;

    for (const tenant of tenants ?? []) {
      if (alreadyBilled.has(tenant.id)) continue;

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
        // Skip always-on modules (dashboard)
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
        const start = new Date(s.started_at).getTime();
        const end = s.ended_at
          ? new Date(s.ended_at).getTime()
          : new Date(s.expires_at).getTime();
        const durationMin = Math.max(1, Math.round((end - start) / 60000));
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

      // Skip tenants with zero cost and no line items
      if (moduleLineItems.length === 0 && supportLineItems.length === 0)
        continue;

      invoiceCounter++;
      const invNum = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(invoiceCounter).padStart(4, "0")}`;

      // period_start = current month for modules, but we reference last month for support
      const periodStart = fmt(
        supportLineItems.length > 0 ? lastMonthStart : currentMonthStart
      );
      const periodEnd = fmt(
        new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0)
      );

      invoicesToInsert.push({
        tenant_id: tenant.id,
        invoice_number: invNum,
        period_start: fmt(lastMonthStart),
        period_end: fmt(lastMonthEnd),
        amount: totalAmount,
        module_total: moduleTotal,
        support_total: supportTotal,
        status: "draft",
        line_items: [...moduleLineItems, ...supportLineItems],
      });
    }

    if (invoicesToInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("tenant_invoices")
        .insert(invoicesToInsert);
      if (insErr) throw insErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoices_created: invoicesToInsert.length,
        month: fmt(currentMonthStart),
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
