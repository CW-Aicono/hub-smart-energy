import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PiggyBank, ExternalLink, TrendingUp, Handshake, LineChart, Sparkles, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number | null | undefined) => fmt(n) + " €";
const eur0 = (n: number) => Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";

const CONTRACT_STATUS: Record<string, string> = {
  draft: "Entwurf", active: "Aktiv", paused: "Pausiert", terminated: "Beendet",
};
const SETTLE_STATUS: Record<string, string> = {
  approved: "Freigegeben", invoiced: "Abgerechnet", paid: "Bezahlt", void: "Ungültig",
};

interface ContractRow {
  id: string;
  tenant_id: string;
  status: string;
  baseline_year: number;
  start_year: number;
  aicono_share_pct: number;
  partner_share_pct_of_aicono: number;
  tenants: { id: string; name: string | null; slug: string } | null;
}

interface SettlementRow {
  id: string;
  contract_id: string;
  period_year: number;
  status: string;
  total_savings_eur: number;
  aicono_amount_eur: number;
  partner_amount_eur: number;
  tenant_retained_eur: number;
  invoice_ref: string | null;
  approved_at: string | null;
}

function EmptyMotivation() {
  // Beispielrechnung: AICONO 30 %, Partner-Anteil 40 % von AICONO
  const aiconoPct = 0.3;
  const partnerOfAicono = 0.4;
  const examples = [
    { label: "Mittelständisches Bürogebäude", baseline: 120_000, saved: 18_000, price: 0.32 },
    { label: "Filialkette (5 Standorte)", baseline: 640_000, saved: 96_000, price: 0.29 },
  ].map((e) => {
    const savedEur = e.saved * e.price;
    const aiconoEur = savedEur * aiconoPct;
    const partnerEur = aiconoEur * partnerOfAicono;
    const tenantEur = savedEur - aiconoEur;
    return { ...e, savedEur, aiconoEur, partnerEur, tenantEur };
  });

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><PiggyBank className="h-5 w-5" /></div>
            <div>
              <CardTitle className="text-xl">Verdienen Sie an jeder eingesparten Kilowattstunde mit</CardTitle>
              <CardDescription className="mt-1">
                Mit einem Gain-Sharing-Vertrag beteiligen wir Sie an den realen Energieeinsparungen Ihrer Tenants – ganz ohne Zusatzaufwand für Sie.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="flex gap-3">
            <TrendingUp className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Messbar & fair</p>
              <p className="text-xs text-muted-foreground">Baseline-basierte, wetternormalisierte Berechnung je Energieart.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Handshake className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Kein Vertriebsdruck</p>
              <p className="text-xs text-muted-foreground">Sie kassieren mit, wann immer Ihr Tenant spart – jahrelang.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <LineChart className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Volle Transparenz</p>
              <p className="text-xs text-muted-foreground">Alle Zahlen jederzeit hier im Partner-Dashboard nachvollziehbar.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">So könnte Ihre Beteiligung aussehen</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Modell: AICONO erhält {Math.round(aiconoPct * 100)} % der eingesparten Energiekosten, davon fließen {Math.round(partnerOfAicono * 100)} % als Provision an Sie. Der Rest bleibt beim Tenant.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {examples.map((e, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base">{e.label}</CardTitle>
                <CardDescription>
                  Baseline {e.baseline.toLocaleString("de-DE")} kWh · Einsparung {Math.round((e.saved / e.baseline) * 100)} % · Ø {fmt(e.price)} €/kWh
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <dt className="text-muted-foreground">Eingesparte Energie</dt>
                    <dd className="font-medium">{e.saved.toLocaleString("de-DE")} kWh</dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="text-muted-foreground">Wert der Einsparung</dt>
                    <dd className="font-medium">{eur0(e.savedEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Anteil Tenant</dt>
                    <dd>{eur0(e.tenantEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">AICONO-Anteil ({Math.round(aiconoPct * 100)} %)</dt>
                    <dd>{eur0(e.aiconoEur)}</dd>
                  </div>
                  <div className="flex justify-between rounded-md bg-primary/10 px-3 py-2 mt-2">
                    <dt className="font-semibold text-primary">Ihre Provision pro Jahr</dt>
                    <dd className="font-bold text-primary">{eur0(e.partnerEur)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Beispielrechnungen zur Veranschaulichung. Tatsächliche Anteile werden individuell vertraglich vereinbart.
        </p>
      </div>

      <Alert>
        <Handshake className="h-4 w-4" />
        <AlertDescription>
          Interesse? Sprechen Sie Ihren AICONO-Ansprechpartner an – wir richten den Gain-Sharing-Vertrag für Ihre Tenants ein.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function PartnerSavingsShare() {
  const query = useQuery({
    queryKey: ["partner-savings-share"],
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("tenant_savings_contracts" as any)
        .select("id, tenant_id, status, baseline_year, start_year, aicono_share_pct, partner_share_pct_of_aicono, tenants:tenant_id(id, name, slug)")
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;
      const list = (contracts ?? []) as unknown as ContractRow[];
      if (list.length === 0) return { contracts: [], settlements: [] as SettlementRow[] };
      const ids = list.map((c) => c.id);
      const { data: settlements, error: sErr } = await supabase
        .from("tenant_savings_settlements" as any)
        .select("id, contract_id, period_year, status, total_savings_eur, aicono_amount_eur, partner_amount_eur, tenant_retained_eur, invoice_ref, approved_at")
        .in("contract_id", ids)
        .order("period_year", { ascending: false });
      if (sErr) throw sErr;
      return { contracts: list, settlements: ((settlements ?? []) as unknown as SettlementRow[]) };
    },
  });

  const contracts = query.data?.contracts ?? [];
  const settlements = query.data?.settlements ?? [];

  const totalPartner = settlements.reduce((s, r) => s + Number(r.partner_amount_eur ?? 0), 0);
  const totalAicono = settlements.reduce((s, r) => s + Number(r.aicono_amount_eur ?? 0), 0);
  const totalSavings = settlements.reduce((s, r) => s + Number(r.total_savings_eur ?? 0), 0);
  const contractsById = new Map(contracts.map((c) => [c.id, c] as const));

  const [contractSearch, setContractSearch] = useState("");
  const [settlementSearch, setSettlementSearch] = useState("");
  const filteredContracts = contractSearch.trim()
    ? contracts.filter((c) => {
        const q = contractSearch.toLowerCase();
        return (
          (c.tenants?.name ?? "").toLowerCase().includes(q) ||
          (c.tenants?.slug ?? "").toLowerCase().includes(q) ||
          (CONTRACT_STATUS[c.status] ?? c.status).toLowerCase().includes(q)
        );
      })
    : contracts;
  const filteredSettlements = settlementSearch.trim()
    ? settlements.filter((s) => {
        const q = settlementSearch.toLowerCase();
        const c = contractsById.get(s.contract_id);
        return (
          (c?.tenants?.name ?? "").toLowerCase().includes(q) ||
          (c?.tenants?.slug ?? "").toLowerCase().includes(q) ||
          String(s.period_year).includes(q) ||
          (SETTLE_STATUS[s.status] ?? s.status).toLowerCase().includes(q) ||
          (s.invoice_ref ?? "").toLowerCase().includes(q)
        );
      })
    : settlements;
  const { sorted: sortedContracts, sort: contractSort, toggle: toggleContractSort } = useSortableData<any, "tenant" | "status" | "baseline" | "start" | "aicono" | "partner">(
    filteredContracts,
    (c, k) => {
      switch (k) {
        case "tenant": return c.tenants?.name ?? c.tenants?.slug ?? c.tenant_id;
        case "status": return c.status;
        case "baseline": return c.baseline_year;
        case "start": return c.start_year;
        case "aicono": return Number(c.aicono_share_pct);
        case "partner": return Number(c.partner_share_pct_of_aicono);
        default: return null;
      }
    },
    { key: "tenant", direction: "asc" },
  );
  const { sorted: sortedSettlements, sort: settleSort, toggle: toggleSettleSort } = useSortableData<any, "tenant" | "year" | "status" | "total" | "aicono" | "partner" | "invoice">(
    filteredSettlements,
    (s, k) => {
      const c = contractsById.get(s.contract_id);
      switch (k) {
        case "tenant": return c?.tenants?.name ?? c?.tenants?.slug ?? "";
        case "year": return s.period_year;
        case "status": return s.status;
        case "total": return Number(s.total_savings_eur ?? 0);
        case "aicono": return Number(s.aicono_amount_eur ?? 0);
        case "partner": return Number(s.partner_amount_eur ?? 0);
        case "invoice": return s.invoice_ref ?? "";
        default: return null;
      }
    },
    { key: "year", direction: "desc" },
  );

  return (
    <div className="container mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold">Gain-Sharing</h1>
        <p className="text-sm text-muted-foreground">Einsparbeteiligungen Ihrer Tenants – zur Kontrolle Ihrer Abrechnung.</p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : query.error ? (
        <Alert variant="destructive"><AlertDescription>{(query.error as Error).message}</AlertDescription></Alert>
      ) : contracts.length === 0 ? (
        <EmptyMotivation />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Einsparungen gesamt</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{eur(totalSavings)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">AICONO-Anteil</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{eur(totalAicono)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ihr Partner-Anteil</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{eur(totalPartner)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Verträge</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Vertrag suchen (Tenant, Status)…"
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              {sortedContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{contractSearch.trim() ? `Keine Treffer für „${contractSearch}".` : "Keine Verträge."}</p>
              ) : (
              <Table>
                <TableHeader><TableRow>
                  <SortableHead sortKey="tenant" sort={contractSort} onToggle={toggleContractSort}>Tenant</SortableHead>
                  <SortableHead sortKey="status" sort={contractSort} onToggle={toggleContractSort}>Status</SortableHead>
                  <SortableHead sortKey="baseline" sort={contractSort} onToggle={toggleContractSort} align="right">Baseline-Jahr</SortableHead>
                  <SortableHead sortKey="start" sort={contractSort} onToggle={toggleContractSort} align="right">Start</SortableHead>
                  <SortableHead sortKey="aicono" sort={contractSort} onToggle={toggleContractSort} align="right">AICONO %</SortableHead>
                  <SortableHead sortKey="partner" sort={contractSort} onToggle={toggleContractSort} align="right">Partner-Anteil an AICONO %</SortableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {sortedContracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.tenants?.name ?? c.tenants?.slug ?? c.tenant_id}</TableCell>
                      <TableCell><Badge variant="outline">{CONTRACT_STATUS[c.status] ?? c.status}</Badge></TableCell>
                      <TableCell className="text-right">{c.baseline_year}</TableCell>
                      <TableCell className="text-right">{c.start_year}</TableCell>
                      <TableCell className="text-right">{fmt(c.aicono_share_pct)} %</TableCell>
                      <TableCell className="text-right">{fmt(c.partner_share_pct_of_aicono)} %</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/partner/tenants/${c.tenant_id}`}><ExternalLink className="h-4 w-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Abrechnungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Abrechnung suchen (Tenant, Jahr, Status, Rechnungs-Ref)…"
                  value={settlementSearch}
                  onChange={(e) => setSettlementSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              {settlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine freigegebenen Abrechnungen.</p>
              ) : sortedSettlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Treffer für „{settlementSearch}".</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <SortableHead sortKey="tenant" sort={settleSort} onToggle={toggleSettleSort}>Tenant</SortableHead>
                    <SortableHead sortKey="year" sort={settleSort} onToggle={toggleSettleSort}>Jahr</SortableHead>
                    <SortableHead sortKey="status" sort={settleSort} onToggle={toggleSettleSort}>Status</SortableHead>
                    <SortableHead sortKey="total" sort={settleSort} onToggle={toggleSettleSort} align="right">Einsparung</SortableHead>
                    <SortableHead sortKey="aicono" sort={settleSort} onToggle={toggleSettleSort} align="right">AICONO-Anteil</SortableHead>
                    <SortableHead sortKey="partner" sort={settleSort} onToggle={toggleSettleSort} align="right">Ihr Anteil</SortableHead>
                    <SortableHead sortKey="invoice" sort={settleSort} onToggle={toggleSettleSort}>Rechnung</SortableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {sortedSettlements.map((s) => {
                      const c = contractsById.get(s.contract_id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{c?.tenants?.name ?? c?.tenants?.slug ?? "–"}</TableCell>
                          <TableCell>{s.period_year}</TableCell>
                          <TableCell><Badge variant="outline">{SETTLE_STATUS[s.status] ?? s.status}</Badge></TableCell>
                          <TableCell className="text-right">{eur(s.total_savings_eur)}</TableCell>
                          <TableCell className="text-right">{eur(s.aicono_amount_eur)}</TableCell>
                          <TableCell className="text-right font-semibold">{eur(s.partner_amount_eur)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.invoice_ref ?? "–"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
