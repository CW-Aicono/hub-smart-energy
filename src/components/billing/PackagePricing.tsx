import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePricingPackages } from "@/hooks/usePricingPackages";
import { calculateQuote, checkDependencies, priceViews } from "@/lib/packagePricing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Loader2, Package } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;

/** AICONO Portal: Paketkatalog pflegen (UVP / Partner-EK). */
export function PackageCatalogCard({ canEdit }: { canEdit: boolean }) {
  const { catalog, isLoading, error, updatePrice } = usePricingPackages();
  const [draft, setDraft] = useState<Record<string, { uvp: string; ek: string }>>({});
  if (isLoading) return <Card><CardContent className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></CardContent></Card>;
  if (error || !catalog) return <Card><CardContent className="p-6 text-destructive text-sm">Paketkatalog konnte nicht geladen werden.</CardContent></Card>;

  const save = async (table: "pricing_packages" | "pricing_unit_prices", code: string, uvp: number, ek: number) => {
    const d = draft[code];
    if (!d) return;
    const nu = Number(d.uvp.replace(",", ".")), ne = Number(d.ek.replace(",", "."));
    if (!Number.isFinite(nu) || !Number.isFinite(ne) || (nu === uvp && ne === ek)) return;
    try { await updatePrice.mutateAsync({ table, code, uvp: nu, ek: ne }); toast({ title: "Preis gespeichert" }); }
    catch (e: any) { toast({ title: "Fehler", description: e.message, variant: "destructive" }); }
  };
  const cell = (table: "pricing_packages" | "pricing_unit_prices", code: string, uvp: number, ek: number, field: "uvp" | "ek") => (
    <Input className="w-24 h-8 text-right" disabled={!canEdit}
      defaultValue={(field === "uvp" ? uvp : ek).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
      onChange={(e) => setDraft((s) => ({ ...s, [code]: { uvp: s[code]?.uvp ?? String(uvp), ek: s[code]?.ek ?? String(ek), [field]: e.target.value.replace(/\./g, "") } }))}
      onBlur={() => save(table, code, uvp, ek)} />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Pakete (neue Buchungen)</CardTitle>
        <CardDescription>UVP = unverbindliche Preisempfehlung, EK = Partner-Einkaufspreis, netto pro Monat. Bestandskunden werden weiter nach der Modulpreisliste unten abgerechnet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader><TableRow><TableHead>Paket</TableHead><TableHead>Module</TableHead><TableHead>Voraussetzung</TableHead><TableHead className="text-right">UVP</TableHead><TableHead className="text-right">EK</TableHead><TableHead className="text-right" title="Einmalig an den Partner, wenn ihm das erste Modul des Pakets freigeschaltet wird">Freischaltung Partner</TableHead></TableRow></TableHeader>
          <TableBody>
            {catalog.packages.map((p) => (
              <TableRow key={p.code}>
                <TableCell className="font-medium">{p.name}{p.always_active && <Badge variant="secondary" className="ml-2">immer aktiv</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.modules.join(", ")}</TableCell>
                <TableCell className="text-xs">{p.requires_package ? catalog.packages.find((x) => x.code === p.requires_package)?.name : p.requires_any_other ? "mind. ein anderes Paket" : "–"}</TableCell>
                <TableCell className="text-right">{p.always_active ? eur(0) : cell("pricing_packages", p.code, p.uvp, p.ek, "uvp")}</TableCell>
                <TableCell className="text-right">{p.always_active ? eur(0) : cell("pricing_packages", p.code, p.uvp, p.ek, "ek")}</TableCell>
                <TableCell className="text-right">{p.always_active ? "–" : (
                  <Input className="h-8 w-24 ml-auto text-right" disabled={!canEdit}
                    defaultValue={p.partner_unlock_fee.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                    onBlur={async (e) => {
                      const v = Number(e.target.value.replace(/\./g, "").replace(",", "."));
                      if (!Number.isFinite(v) || v < 0 || v === p.partner_unlock_fee) return;
                      try { await updateUnlockFee.mutateAsync({ code: p.code, fee: v }); toast({ title: "Freischaltgebühr gespeichert" }); }
                      catch (err) { toast({ title: "Fehler", description: (err as Error).message, variant: "destructive" }); }
                    }} />
                )}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Table>
          <TableHeader><TableRow><TableHead>Mengen- und Servicepreise</TableHead><TableHead>Einheit</TableHead><TableHead className="text-right">UVP</TableHead><TableHead className="text-right">EK</TableHead></TableRow></TableHeader>
          <TableBody>
            {catalog.units.map((u) => (
              <TableRow key={u.code}>
                <TableCell>{u.name}</TableCell><TableCell className="text-xs">{u.unit}</TableCell>
                <TableCell className="text-right">{cell("pricing_unit_prices", u.code, u.uvp, u.ek, "uvp")}</TableCell>
                <TableCell className="text-right">{cell("pricing_unit_prices", u.code, u.uvp, u.ek, "ek")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Nicht mehr einzeln verkäuflich: {Object.entries(catalog.flags).filter(([, v]) => v === "hidden").map(([k]) => k).join(", ")}.{" "}
          Nur auf Anfrage: {Object.entries(catalog.flags).filter(([, v]) => v === "on_request").map(([k]) => k).join(", ")}.
        </p>
      </CardContent>
    </Card>
  );
}

/** Angebotsrechner: Pakete + Mengen, Endpreis frei, beide Sichten, Warnung unter EK. */
export function PackageQuoteCalculator() {
  const { catalog } = usePricingPackages();
  const [sel, setSel] = useState<string[]>([]);
  const [locations, setLocations] = useState(1);
  const [cps, setCps] = useState(0);
  const [sessions, setSessions] = useState(0);
  const [endPrice, setEndPrice] = useState<string>("");
  const defs = catalog?.packages ?? [];
  const packages = useMemo(() => [...defs.filter((d) => d.always_active).map((d) => d.code), ...sel], [defs, sel]);
  const errors = checkDependencies(packages, defs);
  const q = calculateQuote({ packages, locations, chargePoints: cps, billedSessions: sessions }, defs, catalog?.units ?? []);
  const ep = endPrice === "" ? q.uvp : Number(endPrice.replace(",", "."));
  const v = priceViews(ep, q.uvp, q.ek);
  if (!catalog) return null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">Paket-Angebot (neue Preislogik)</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {defs.filter((d) => !d.always_active && d.active).map((d) => (
          <label key={d.code} className="flex items-center gap-2 text-sm">
            <Checkbox checked={sel.includes(d.code)} onCheckedChange={(c) => setSel((s) => c ? [...s, d.code] : s.filter((x) => x !== d.code))} />
            {d.name} <span className="text-muted-foreground ml-auto">{d.code === "p4_charging" ? "je Ladepunkt" : eur(d.uvp)}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Liegenschaften</Label><Input type="number" min={1} value={locations} onChange={(e) => setLocations(Math.max(1, Number(e.target.value)))} /></div>
        <div><Label className="text-xs">Ladepunkte</Label><Input type="number" min={0} value={cps} onChange={(e) => setCps(Math.max(0, Number(e.target.value)))} /></div>
        <div><Label className="text-xs">Abgerechnete Ladevorgänge</Label><Input type="number" min={0} value={sessions} onChange={(e) => setSessions(Math.max(0, Number(e.target.value)))} /></div>
      </div>
      {errors.map((e) => <p key={e} className="text-sm text-destructive">{e}</p>)}
      <div className="text-sm space-y-1">
        {q.lines.map((l) => <div key={l.label} className="flex justify-between"><span>{l.label}</span><span>{eur(l.uvp)} <span className="text-muted-foreground">/ EK {eur(l.ek)}</span></span></div>)}
        <div className="flex justify-between font-semibold border-t pt-1"><span>Summe (unverbindliche Preisempfehlung)</span><span>{eur(q.uvp)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Partner-EK</span><span>{eur(q.ek)}</span></div>
      </div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <div><Label className="text-xs">Endkundenpreis / Monat</Label><Input value={endPrice} placeholder={q.uvp.toLocaleString("de-DE")} onChange={(e) => setEndPrice(e.target.value)} /></div>
        <div className="text-sm">Rabatt auf UVP: <b>{pct(v.discountOnUvpPct)}</b></div>
        <div className="text-sm">Aufschlag auf EK: <b>{pct(v.markupOnEkPct)}</b></div>
      </div>
      {v.belowEk && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Der Endkundenpreis liegt unter dem Partner-EK.</p>}
    </div>
  );
}

/** Paketbuchung je Kunde: schaltet die Modul-Codes über die bestehenden Freigaben. */
export function PackageBookingCard({ tenantId }: { tenantId: string }) {
  const { catalog } = usePricingPackages();
  const qc = useQueryClient();
  const { data: booked = [] } = useQuery({
    queryKey: ["tenant-package-bookings", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("tenant_package_bookings").select("package_code").eq("tenant_id", tenantId).is("cancelled_at", null);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.package_code as string);
    },
  });
  const m = useMutation({
    mutationFn: async ({ code, book }: { code: string; book: boolean }) => {
      const { data, error } = await supabase.functions.invoke("package-book", { body: { tenant_id: tenantId, package_code: code, book } });
      if (error) { const ctx = await (error as any).context?.json?.().catch(() => null); throw new Error(ctx?.error ?? error.message); }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => { qc.invalidateQueries(); toast({ title: "Paket aktualisiert" }); },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
  if (!catalog) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Pakete</CardTitle>
        <CardDescription>{booked.length === 0 ? "Bestandskunde – Abrechnung nach bisheriger Modulpreisliste. Mit der ersten Paketbuchung gilt die neue Preislogik." : "Abrechnung nach Paketlogik."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {catalog.packages.filter((p) => !p.always_active && p.active).map((p) => {
          const on = booked.includes(p.code);
          return (
            <div key={p.code} className="flex items-center justify-between gap-2 text-sm">
              <span>{p.name} <span className="text-muted-foreground">({p.code === "p4_charging" ? "je Ladepunkt" : `UVP ${eur(p.uvp)}`})</span></span>
              <Button size="sm" variant={on ? "outline" : "default"} disabled={m.isPending} onClick={() => m.mutate({ code: p.code, book: !on })}>
                {on ? "Kündigen" : "Buchen"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Monatsübersicht je Endkunde und Partner (nur Anzeige). */
export function PackageBillingOverviewCard({ partnerId }: { partnerId?: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading, error } = useQuery({
    queryKey: ["package-billing-overview", month, partnerId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("package-billing-overview", { body: { month, partner_id: partnerId } });
      if (error) throw error;
      return data as { rows: any[]; partners: any[] };
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Monatsübersicht nach Paketen</CardTitle>
          <CardDescription>Grundlage für die Rechnung AICONO → Partner. Nur Anzeige, die Monatsrechnung bleibt unverändert.</CardDescription>
        </div>
        <Input type="month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : error ? <p className="text-sm text-destructive">Übersicht konnte nicht geladen werden.</p> : (
          <div className="space-y-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Endkunde</TableHead><TableHead>Pakete</TableHead><TableHead className="text-right">Liegenschaften</TableHead>
                <TableHead className="text-right">Ladepunkte</TableHead><TableHead className="text-right">Abgerechnet</TableHead><TableHead className="text-right">Intern</TableHead>
                <TableHead className="text-right">UVP</TableHead><TableHead className="text-right">EK</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.tenant_id}>
                    <TableCell>{r.tenant_name}</TableCell>
                    <TableCell className="text-xs">{r.legacy ? <Badge variant="secondary">Altpreis</Badge> : r.packages.join(", ")}</TableCell>
                    <TableCell className="text-right">{r.locations.toLocaleString("de-DE")}</TableCell>
                    <TableCell className="text-right">{r.chargePoints.toLocaleString("de-DE")}</TableCell>
                    <TableCell className="text-right">{r.billedSessions.toLocaleString("de-DE")}</TableCell>
                    <TableCell className="text-right">{r.internalSessions.toLocaleString("de-DE")}</TableCell>
                    <TableCell className="text-right">{r.legacy ? "–" : eur(r.uvp)}</TableCell>
                    <TableCell className="text-right">{r.legacy ? "–" : eur(r.ek)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="text-sm space-y-1">
              {(data?.partners ?? []).map((p) => (
                <div key={p.partner_id} className="flex justify-between font-medium"><span>Summe {p.partner_name} ({p.tenants} Kunden)</span><span>UVP {eur(p.uvp)} · EK {eur(p.ek)}</span></div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
