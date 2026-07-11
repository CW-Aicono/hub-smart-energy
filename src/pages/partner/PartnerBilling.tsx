import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { useModulePrices } from "@/hooks/useModulePrices";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Receipt, TrendingUp, Percent, Building2, Factory, Search } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

const editableModules = ALL_MODULES.filter((m) => !("alwaysOn" in m));
const fmtEur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtPct = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";

export default function PartnerBilling() {
  const { partnerId, loading, permissions } = usePartnerAccess();
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

  const tenantTotals = useMemo(() => {
    return tenants.map((t) => {
      let purchase = 0;
      let sale = 0;
      for (const code of t.modules) {
        if (code === "dashboard") continue;
        purchase += purchasePrice(code, t.is_kommune);
        sale += effectiveSale(code, t.is_kommune);
      }
      const margin = sale - purchase;
      const commission = sale * ((partner?.commission_pct ?? 0) / 100);
      return { ...t, purchase, sale, margin, commission };
    });
  }, [tenants, modulePrices, partnerOverrides, partner]);

  const { sorted: sortedTotals, sort: sortTotals, toggle: toggleTotals } = useSortableData<any, "name" | "sector" | "purchase" | "sale" | "margin" | "commission">(tenantTotals, (r, k) => {
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

  const { sorted: sortedModules, sort: sortModules, toggle: toggleModules } = useSortableData<any, "label" | "purchase" | "recommended" | "sale" | "margin">(editableModules, (mod, k) => {
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

      {isCommission ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provisionsübersicht je Tenant (Monatsbasis)</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Tenants zugeordnet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Tenant" sortKey="name" sort={sortTotals} onToggle={toggleTotals} />
                    <SortableHead label="Bereich" sortKey="sector" sort={sortTotals} onToggle={toggleTotals} />
                    <SortableHead label="Endkunden-Verkauf (empf.)" sortKey="sale" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                    <SortableHead label={`Provision (${fmtPct(Number(partner.commission_pct ?? 0))})`} sortKey="commission" sort={sortTotals} onToggle={toggleTotals} className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTotals.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
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
            <p className="text-xs text-muted-foreground mt-4">
              Read-only Ansicht. Verbindliche Abrechnungen erhältst du monatlich von AICONO.
            </p>
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
                  <CardTitle className="text-base">Einkauf & Verkauf je Modul</CardTitle>
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
              <CardContent>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="margins">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Margenübersicht je Tenant (Monatsbasis)</CardTitle>
              </CardHeader>
              <CardContent>
                {sortedTotals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine Tenants zugeordnet.</p>
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
                          <TableCell className="font-medium">{t.name}</TableCell>
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
    </div>
  );
}

interface SalePriceRowProps {
  label: string;
  purchase: number;
  recommended: number;
  sale: number;
  margin: number;
  disabled: boolean;
  onSave: (val: number | null) => void;
}

function SalePriceRow({ label, purchase, recommended, sale, margin, disabled, onSave }: SalePriceRowProps) {
  const [value, setValue] = useState(String(sale.toFixed(2)));
  useMemo(() => setValue(String(sale.toFixed(2))), [sale]);

  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
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
