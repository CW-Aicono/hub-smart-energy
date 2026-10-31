import { useMemo, useState } from "react";
import { PackageBillingOverviewCard, PartnerUsageNoticesCard } from "@/components/billing/PackagePricing";
import { PartnerSalesPortfolioCard } from "@/components/billing/PartnerSalesPortfolioCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { useModulePrices } from "@/hooks/useModulePrices";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Receipt, TrendingUp, Percent, Building2, Factory, Search } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { PartnerDiscountRequestsCard } from "@/components/billing/DiscountRequests";
import { LicenseSales } from "@/components/billing/LicenseSales";
import { PartnerCustomerInvoices } from "@/components/billing/PartnerCustomerInvoices";
import { partnerPriceRows, packageMargin, expectedCommission, salePriceFor, unitUvp, type CatPackage, type CatUnit, type OverviewRow, type PriceRow } from "@/lib/partnerPriceList";

const editableModules = ALL_MODULES.filter((m) => !("alwaysOn" in m));
const fmtEur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtPct = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";

export default function PartnerBilling() {
  const { partnerId, loading, permissions, isPartnerAdmin } = usePartnerAccess();
  const canEditPrices = permissions.viewBilling;
  const qc = useQueryClient();
  const [sector, setSector] = useState<"kommune" | "industrie">("kommune");

  const { data: partner } = useQuery({
    queryKey: ["partner-billing-info", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, billing_mode, commission_pct")
        .eq("id", partnerId!)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; billing_mode: string; commission_pct: number | null };
    },
  });

  const { prices: modulePrices } = useModulePrices();

  const { data: partnerOverrides = [] } = useQuery({
    queryKey: ["partner-module-prices", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_module_prices")
        .select("*")
        .eq("partner_id", partnerId!);
      if (error) throw error;
      return data as Array<{
        module_code: string;
        sale_price_monthly: number | null;
        sale_price_industry_monthly: number | null;
      }>;
    },
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["partner-billing-tenants", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data: t, error: tErr } = await supabase
        .from("tenants")
        .select("id, name, is_kommune")
        .eq("partner_id", partnerId!);
      if (tErr) throw tErr;
      const tenantIds = (t ?? []).map((x: any) => x.id);
      if (tenantIds.length === 0) return [];
      const { data: tm, error: mErr } = await supabase
        .from("tenant_modules")
        .select("tenant_id, module_code, is_enabled")
        .in("tenant_id", tenantIds)
        .eq("is_enabled", true);
      if (mErr) throw mErr;
      return (t ?? []).map((x: any) => ({
        id: x.id as string,
        name: x.name as string,
        is_kommune: x.is_kommune !== false,
        modules: (tm ?? []).filter((r: any) => r.tenant_id === x.id).map((r: any) => r.module_code as string),
      }));
    },
  });

  const { data: catalog } = useQuery({
    queryKey: ["partner-package-catalog"],
    queryFn: async () => {
      const db = supabase as any;
      const [pk, un] = await Promise.all([
        db.from("pricing_packages").select("code,name,uvp,ek,always_active,active,sort"),
        db.from("pricing_unit_prices").select("code,name,uvp,ek,new_sale_uvp,partner_available"),
      ]);
      if (pk.error) throw pk.error;
      if (un.error) throw un.error;
      return { packages: (pk.data ?? []) as CatPackage[], units: (un.data ?? []) as CatUnit[] };
    },
  });
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: overview } = useQuery({
    queryKey: ["package-billing-overview", currentMonth, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("package-billing-overview", { body: { month: currentMonth, partner_id: partnerId } });
      if (error) throw error;
      return data as { rows: OverviewRow[]; partners: any[] };
    },
  });
  const { data: creditNotes = [] } = useQuery({
    queryKey: ["partner-commission-credits", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("tenant_invoices")
        .select("id,invoice_number,status,amount,period_start,period_end,document_type")
        .eq("partner_id", partnerId!).eq("document_type", "credit_note").order("period_start", { ascending: false }).limit(24);
      if (error) throw error;
      return data as { id: string; invoice_number: string; status: string; amount: number; period_start: string; period_end: string }[];
    },
  });
  const catalogUvp = (code: string) => {
    const pk = catalog?.packages.find((p) => p.code === code);
    if (pk) return Number(pk.uvp);
    const u = catalog?.units.find((x) => x.code === code);
    return u ? unitUvp(u) : 0;
  };
  const priceRows: PriceRow[] = catalog ? partnerPriceRows(catalog.packages, catalog.units, partnerOverrides as any, sector) : [];

  const overrideFor = (code: string) => partnerOverrides.find((o) => o.module_code === code);

  const recommendedSale = (code: string, isKommune: boolean) => {
    const mp = modulePrices.find((p) => p.module_code === code);
    if (!mp) return 0;
    return Number(isKommune ? mp.standard_price : mp.industry_standard_price);
  };

  const purchasePrice = (code: string, isKommune: boolean) => {
    const mp = modulePrices.find((p) => p.module_code === code);
    if (!mp) return 0;
    return Number(isKommune ? mp.partner_price_monthly : mp.partner_industry_price_monthly);
  };

  const effectiveSale = (code: string, isKommune: boolean) => {
    const o = overrideFor(code);
    const fromOverride = isKommune ? o?.sale_price_monthly : o?.sale_price_industry_monthly;
    return fromOverride != null ? Number(fromOverride) : recommendedSale(code, isKommune);
  };

  const saveSale = useMutation({
    mutationFn: async (args: { moduleCode: string; value: number | null }) => {
      const isKommune = sector === "kommune";
      const existing = overrideFor(args.moduleCode);
      const payload: any = { partner_id: partnerId, module_code: args.moduleCode };
      if (isKommune) payload.sale_price_monthly = args.value;
      else payload.sale_price_industry_monthly = args.value;
      if (existing) {
        const { error } = await supabase
          .from("partner_module_prices")
          .update(payload)
          .eq("partner_id", partnerId!)
          .eq("module_code", args.moduleCode);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_module_prices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-module-prices", partnerId] });
      toast({ title: "Verkaufspreis gespeichert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // Margen je Tenant: Paketkunden aus der Monatsübersicht (laufender Monat), übrige nach Altvertrag (Modulpreise)
  const tenantTotals = useMemo(() => {
    const pct = Number(partner?.commission_pct ?? 0);
    return tenants.map((t) => {
      const row = overview?.rows.find((r) => r.tenant_id === t.id);
      if (row && !row.legacy) {
        const own = (code: string) => salePriceFor(code, t.is_kommune ? "kommune" : "industrie", partnerOverrides as any);
        const m = packageMargin(row, own, catalogUvp);
        const billedUvp = row.lines ? row.lines.filter((l) => !l.review && !l.viaContract).reduce((s, l) => s + l.uvp, 0) : row.uvp;
        return { ...t, basis: "package" as const, purchase: m.ek, sale: m.sale, margin: m.margin, commission: expectedCommission(billedUvp, pct), commissionBase: billedUvp };
      }
      let purchase = 0;
      let sale = 0;
      for (const code of t.modules) {
        if (code === "dashboard") continue;
        purchase += purchasePrice(code, t.is_kommune);
        sale += effectiveSale(code, t.is_kommune);
      }
      return { ...t, basis: "legacy" as const, purchase, sale, margin: sale - purchase, commission: expectedCommission(sale, pct), commissionBase: sale };
    });
  }, [tenants, modulePrices, partnerOverrides, partner, overview, catalog]);
  const hasLegacy = tenantTotals.some((t) => t.basis === "legacy");

  const [tenantSearch, setTenantSearch] = useState("");
  const filteredTenantTotals = tenantSearch.trim()
    ? tenantTotals.filter((t) => {
        const q = tenantSearch.toLowerCase();
        return (t.name ?? "").toLowerCase().includes(q) || (t.is_kommune ? "kommune" : "industrie").includes(q);
      })
    : tenantTotals;

  const { sorted: sortedTotals, sort: sortTotals, toggle: toggleTotals } = useSortableData<any, "name" | "sector" | "purchase" | "sale" | "margin" | "commission">(filteredTenantTotals, (r, k) => {
    switch (k) {
      case "name": return r.name;
      case "sector": return r.is_kommune ? "kommune" : "industrie";
      case "purchase": return r.purchase;
      case "sale": return r.sale;
      case "margin": return r.margin;
      case "commission": return r.commission;
      default: return null;
    }
  }, { key: "name", direction: "asc" });

  const [moduleSearch, setModuleSearch] = useState("");
  const filteredEditableModules = moduleSearch.trim()
    ? editableModules.filter((m: any) => (m.label ?? "").toLowerCase().includes(moduleSearch.toLowerCase()))
    : editableModules;

  const { sorted: sortedModules, sort: sortModules, toggle: toggleModules } = useSortableData<any, "label" | "purchase" | "recommended" | "sale" | "margin">(filteredEditableModules, (mod, k) => {
    const isKommune = sector === "kommune";
    const purchase = purchasePrice(mod.code, isKommune);
    const recommended = recommendedSale(mod.code, isKommune);
    const sale = effectiveSale(mod.code, isKommune);
    const margin = sale - purchase;
    switch (k) {
      case "label": return mod.label;
      case "purchase": return purchase;
      case "recommended": return recommended;
      case "sale": return sale;
      case "margin": return margin;
      default: return null;
    }
  }, { key: "label", direction: "asc" });

  if (loading) return <div className="p-6 text-muted-foreground">Lädt…</div>;
  if (!partnerId || !partner) return <div className="p-6 text-muted-foreground">Kein Partner-Kontext.</div>;

  const isCommission = partner.billing_mode === "commission";
  const sumSale = tenantTotals.reduce((s, t) => s + t.sale, 0);
  const sumCommission = tenantTotals.reduce((s, t) => s + t.commission, 0);
  const sumPurchase = tenantTotals.reduce((s, t) => s + t.purchase, 0);
  const sumMargin = tenantTotals.reduce((s, t) => s + t.margin, 0);

  return (
    <div className="p-3 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Abrechnung
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCommission
              ? `Provisionsmodell – AICONO rechnet mit den Tenants ab, dein Anteil: ${fmtPct(Number(partner.commission_pct ?? 0))}.`
              : "Wiederverkaufsmodell – du kaufst bei AICONO ein und verkaufst mit Marge an deine Tenants."}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {isCommission ? <><Percent className="h-3 w-3 mr-1" /> Provision</> : <><TrendingUp className="h-3 w-3 mr-1" /> Wiederverkauf</>}
        </Badge>
      </header>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          {!isCommission && <TabsTrigger value="invoices">Rechnungen</TabsTrigger>}
          {!isCommission && <TabsTrigger value="sales">Verträge</TabsTrigger>}
          <TabsTrigger value="prices">{isCommission ? "Provision" : "Preise & Margen"}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {partnerId && <PartnerSalesPortfolioCard partnerId={partnerId} />}
          {partnerId && <PartnerUsageNoticesCard partnerId={partnerId} />}
          {partnerId && <PackageBillingOverviewCard partnerId={partnerId} />}
        </TabsContent>

        {!isCommission && (
          <TabsContent value="sales" className="space-y-4">
            <p className="text-sm text-muted-foreground">Neue Pakete verkaufst du beim Tenants: <strong>Tenants</strong> → Tenant öffnen → Reiter <strong>„Pakete & Verkauf“</strong>.</p>
            <LicenseSales partnerId={partnerId} canEdit={false} />
          </TabsContent>
        )}
        {!isCommission && (
          <TabsContent value="invoices" className="space-y-4">
            <p className="text-sm text-muted-foreground">Hier findest du deine Rechnungen an Tenants sowie die Einkaufsrechnungen von AICONO an dich.</p>
            <PartnerCustomerInvoices partnerId={partnerId} canEdit={isPartnerAdmin} />
          </TabsContent>
        )}

        <TabsContent value="prices" className="space-y-4">
      {partnerId && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Rabatt bei AICONO anfragen</summary>
          <div className="p-3 pt-0"><PartnerDiscountRequestsCard partnerId={partnerId} canRequest={isPartnerAdmin} /></div>
        </details>
      )}
      {isCommission ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erwartete Provision je Tenant (laufender Monat)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tenant suchen…"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {sortedTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tenantSearch.trim() ? `Keine Treffer für „${tenantSearch}".` : "Noch keine Tenants zugeordnet."}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Tenant" sortKey="name" sort={sortTotals} onToggle={toggleTotals} />
                    <SortableHead label="Bereich" sortKey="sector" sort={sortTotals} onToggle={toggleTotals} />
                    <SortableHead label="AICONO berechnet (UVP)" sortKey="sale" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                    <SortableHead label={`Provision (${fmtPct(Number(partner.commission_pct ?? 0))})`} sortKey="commission" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTotals.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}{t.basis === "legacy" && <Badge variant="secondary" className="ml-2 text-xs">Altvertrag</Badge>}</TableCell>
                      <TableCell>
                        {t.is_kommune ? <Building2 className="inline h-3.5 w-3.5 mr-1" /> : <Factory className="inline h-3.5 w-3.5 mr-1" />}
                        {t.is_kommune ? "Kommune" : "Industrie"}
                      </TableCell>
                      <TableCell className="text-right">{fmtEur(t.sale)}</TableCell>
                      <TableCell className="text-right text-primary font-medium">{fmtEur(t.commission)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell colSpan={2}>Summe</TableCell>
                    <TableCell className="text-right">{fmtEur(sumSale)}</TableCell>
                    <TableCell className="text-right text-primary">{fmtEur(sumCommission)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground">
              Paketkunden: Grundlage ist die Monatsübersicht nach Paketen. „Altvertrag“: Berechnung nach bisherigen Modulpreisen. Verbindlich ist die monatliche Provisionsgutschrift.
            </p>
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold">Provisionsgutschriften</h3>
              {creditNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Provisionsgutschriften.</p>
              ) : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow>
                    <TableHead>Gutschrift</TableHead><TableHead>Zeitraum</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Betrag</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {creditNotes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.status === "draft" ? "Entwurf" : c.invoice_number}</TableCell>
                        <TableCell>{new Date(c.period_start + "T00:00:00").toLocaleDateString("de-DE")} – {new Date(c.period_end + "T00:00:00").toLocaleDateString("de-DE")}</TableCell>
                        <TableCell><Badge variant={c.status === "draft" ? "outline" : "secondary"}>{c.status === "draft" ? "In Vorbereitung" : c.status === "paid" ? "Ausgezahlt" : "Ausgestellt"}</Badge></TableCell>
                        <TableCell className="text-right font-medium">{fmtEur(Math.abs(Number(c.amount ?? 0)))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="pricing">
          <TabsList>
            <TabsTrigger value="pricing">Preisliste</TabsTrigger>
            <TabsTrigger value="margins">Margen je Tenant</TabsTrigger>
          </TabsList>

          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">Pakete und Mengenpreise</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Monatliche Nettopreise. Dein Verkaufspreis erscheint in den Tenants-Entwürfen; ohne eigenen Preis gilt die UVP.</p>
                  </div>
                  <ToggleGroup type="single" value={sector} onValueChange={(v) => v && setSector(v as "kommune" | "industrie")} variant="outline" size="sm">
                    <ToggleGroupItem value="kommune" className="gap-1.5"><Building2 className="h-4 w-4" /> Kommunen</ToggleGroupItem>
                    <ToggleGroupItem value="industrie" className="gap-1.5"><Factory className="h-4 w-4" /> Industrie</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </CardHeader>
              <CardContent>
                {!catalog ? <p className="text-sm text-muted-foreground">Lädt…</p> : (
                  <div className="overflow-x-auto"><Table>
                    <TableHeader><TableRow>
                      <TableHead>Paket / Leistung</TableHead>
                      <TableHead className="text-right">Einkauf (EK)</TableHead>
                      <TableHead className="text-right">Empf. Verkaufspreis (UVP)</TableHead>
                      <TableHead className="text-right">Dein Verkaufspreis</TableHead>
                      <TableHead className="text-right">Marge</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {priceRows.map((r, i) => (
                        <SalePriceRow
                          key={`${sector}-${r.code}`}
                          label={r.name}
                          sub={r.unit}
                          separator={i > 0 && r.kind === "unit" && priceRows[i - 1].kind === "package"}
                          purchase={r.ek}
                          recommended={r.uvp}
                          sale={r.sale}
                          margin={r.margin}
                          disabled={!canEditPrices}
                          onSave={(val) => saveSale.mutate({ moduleCode: r.code, value: val })}
                        />
                      ))}
                    </TableBody>
                  </Table></div>
                )}
              </CardContent>
            </Card>

            {hasLegacy && (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Alte Modulpreisliste – nur für Altverträge</summary>
            <Card className="border-0 shadow-none">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Einkauf & Verkauf je Modul (Altverträge)</CardTitle>
                  <ToggleGroup
                    type="single"
                    value={sector}
                    onValueChange={(v) => v && setSector(v as "kommune" | "industrie")}
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="kommune" className="gap-1.5">
                      <Building2 className="h-4 w-4" /> Kommunen
                    </ToggleGroupItem>
                    <ToggleGroupItem value="industrie" className="gap-1.5">
                      <Factory className="h-4 w-4" /> Industrie
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Modul suchen…"
                    value={moduleSearch}
                    onChange={(e) => setModuleSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {sortedModules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Treffer für „{moduleSearch}".</p>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Modul" sortKey="label" sort={sortModules} onToggle={toggleModules} />
                      <SortableHead label="Einkauf (AICONO)" sortKey="purchase" sort={sortModules} onToggle={toggleModules} className="text-right" />
                      <SortableHead label="Empf. Verkaufspreis" sortKey="recommended" sort={sortModules} onToggle={toggleModules} className="text-right" />
                      <SortableHead label="Dein Verkaufspreis" sortKey="sale" sort={sortModules} onToggle={toggleModules} className="text-right" />
                      <SortableHead label="Marge" sortKey="margin" sort={sortModules} onToggle={toggleModules} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedModules.map((mod: any) => {
                      const isKommune = sector === "kommune";
                      const purchase = purchasePrice(mod.code, isKommune);
                      const recommended = recommendedSale(mod.code, isKommune);
                      const sale = effectiveSale(mod.code, isKommune);
                      const margin = sale - purchase;
                      return (
                        <SalePriceRow
                          key={mod.code}
                          label={mod.label}
                          purchase={purchase}
                          recommended={recommended}
                          sale={sale}
                          margin={margin}
                          disabled={!canEditPrices}
                          onSave={(val) =>
                            saveSale.mutate({ moduleCode: mod.code, value: val })
                          }
                        />
                      );
                    })}
                  </TableBody>
                </Table>
                )}
              </CardContent>
            </Card>
            </details>
            )}
          </TabsContent>

          <TabsContent value="margins">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Margen je Tenant (laufender Monat)</CardTitle>
                <p className="text-xs text-muted-foreground">Paketkunden: Einkauf aus der Monatsübersicht inkl. freigegebener Rabatte, Verkauf zu deinen Verkaufspreisen. „Altvertrag“: bisherige Modulpreise.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tenant suchen…"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {sortedTotals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tenantSearch.trim() ? `Keine Treffer für „${tenantSearch}".` : "Noch keine Tenants zugeordnet."}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Tenant" sortKey="name" sort={sortTotals} onToggle={toggleTotals} />
                        <SortableHead label="Bereich" sortKey="sector" sort={sortTotals} onToggle={toggleTotals} />
                        <SortableHead label="Einkauf" sortKey="purchase" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                        <SortableHead label="Verkauf" sortKey="sale" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                        <SortableHead label="Marge" sortKey="margin" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTotals.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}{t.basis === "legacy" && <Badge variant="secondary" className="ml-2 text-xs">Altvertrag</Badge>}</TableCell>
                          <TableCell>
                            {t.is_kommune ? <Building2 className="inline h-3.5 w-3.5 mr-1" /> : <Factory className="inline h-3.5 w-3.5 mr-1" />}
                            {t.is_kommune ? "Kommune" : "Industrie"}
                          </TableCell>
                          <TableCell className="text-right">{fmtEur(t.purchase)}</TableCell>
                          <TableCell className="text-right">{fmtEur(t.sale)}</TableCell>
                          <TableCell className="text-right text-primary font-medium">{fmtEur(t.margin)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell colSpan={2}>Summe</TableCell>
                        <TableCell className="text-right">{fmtEur(sumPurchase)}</TableCell>
                        <TableCell className="text-right">{fmtEur(sumSale)}</TableCell>
                        <TableCell className="text-right text-primary">{fmtEur(sumMargin)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface SalePriceRowProps {
  label: string;
  sub?: string;
  separator?: boolean;
  purchase: number;
  recommended: number;
  sale: number;
  margin: number;
  disabled: boolean;
  onSave: (val: number | null) => void;
}

function SalePriceRow({ label, sub, separator, purchase, recommended, sale, margin, disabled, onSave }: SalePriceRowProps) {
  const [value, setValue] = useState(String(sale.toFixed(2)));
  useMemo(() => setValue(String(sale.toFixed(2))), [sale]);

  return (
    <TableRow className={separator ? "border-t-2" : undefined}>
      <TableCell className="font-medium">{label}{sub && <div className="text-xs font-normal text-muted-foreground">{sub}</div>}</TableCell>
      <TableCell className="text-right">{fmtEur(purchase)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{fmtEur(recommended)}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            const v = parseFloat(value.replace(",", "."));
            if (!isNaN(v) && Math.abs(v - sale) > 0.001) onSave(v);
          }}
          className="text-right w-28 ml-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </TableCell>
      <TableCell className={`text-right font-medium ${margin < 0 ? "text-destructive" : "text-primary"}`}>
        {fmtEur(margin)}
      </TableCell>
    </TableRow>
  );
}
