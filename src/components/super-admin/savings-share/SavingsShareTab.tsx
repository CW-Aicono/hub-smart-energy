import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useTenantSavingsContract, SavingsContract, SavingsBaseline } from "@/hooks/useTenantSavingsContract";
import { useTenantSavingsSettlements, SavingsSettlement, SettlementStatus } from "@/hooks/useTenantSavingsSettlements";
import { Calculator, Save, PlayCircle, PauseCircle, CheckCircle2, Pencil } from "lucide-react";

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtInt = (n: number | null | undefined) =>
  n == null ? "–" : Math.round(Number(n)).toLocaleString("de-DE");
const eur = (n: number | null | undefined) => fmt(n) + " €";

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf", active: "Aktiv", paused: "Pausiert", terminated: "Beendet",
  approved: "Freigegeben", invoiced: "Abgerechnet", paid: "Bezahlt", void: "Ungültig",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", active: "default", paused: "secondary", terminated: "destructive",
  approved: "default", invoiced: "secondary", paid: "default", void: "destructive",
};

function ContractCard({ tenantId, contract, upsert }: {
  tenantId: string;
  contract: SavingsContract | null;
  upsert: (payload: any) => void;
}) {
  const [editing, setEditing] = useState(!contract);
  const [form, setForm] = useState({
    baseline_year: contract?.baseline_year ?? new Date().getFullYear() - 1,
    start_year: contract?.start_year ?? new Date().getFullYear(),
    aicono_share_pct: contract?.aicono_share_pct ?? 25,
    partner_share_pct_of_aicono: contract?.partner_share_pct_of_aicono ?? 0,
    weather_normalize: contract?.weather_normalize ?? true,
    price_basis: contract?.price_basis ?? "current_year_avg",
    status: contract?.status ?? "draft",
    notes: contract?.notes ?? "",
  });

  const save = () => {
    upsert({ tenant_id: tenantId, ...form });
    setEditing(false);
  };

  const toggleStatus = (next: "active" | "paused" | "terminated") => {
    if (!contract) return;
    upsert({ tenant_id: tenantId, status: next });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Vertrag</CardTitle>
        <div className="flex gap-2">
          {contract && !editing && (
            <>
              <Badge variant={STATUS_VARIANT[contract.status]}>{STATUS_LABEL[contract.status]}</Badge>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-4 h-4 mr-1" />Bearbeiten</Button>
              {contract.status !== "active" && <Button size="sm" onClick={() => toggleStatus("active")}><PlayCircle className="w-4 h-4 mr-1" />Aktivieren</Button>}
              {contract.status === "active" && <Button size="sm" variant="outline" onClick={() => toggleStatus("paused")}><PauseCircle className="w-4 h-4 mr-1" />Pausieren</Button>}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Baseline-Jahr</Label><Input type="number" value={form.baseline_year} onChange={e => setForm({ ...form, baseline_year: Number(e.target.value) })} /></div>
              <div><Label>Startjahr Beteiligung</Label><Input type="number" value={form.start_year} onChange={e => setForm({ ...form, start_year: Number(e.target.value) })} /></div>
              <div><Label>AICONO-Anteil (%)</Label><Input type="number" step="0.5" value={form.aicono_share_pct} onChange={e => setForm({ ...form, aicono_share_pct: Number(e.target.value) })} /></div>
              <div><Label>Partner-Anteil vom AICONO-Anteil (%)</Label><Input type="number" step="0.5" value={form.partner_share_pct_of_aicono} onChange={e => setForm({ ...form, partner_share_pct_of_aicono: Number(e.target.value) })} /></div>
              <div><Label>Preisbasis</Label>
                <Select value={form.price_basis} onValueChange={(v) => setForm({ ...form, price_basis: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_year_avg">Jahresmittel aktuelles Jahr</SelectItem>
                    <SelectItem value="contract_fixed">Vertrags-Festpreis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.weather_normalize} onCheckedChange={(v) => setForm({ ...form, weather_normalize: v })} />
                <Label>Witterungsbereinigung</Label>
              </div>
            </div>
            <div><Label>Notizen</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2 justify-end">
              {contract && <Button variant="outline" onClick={() => setEditing(false)}>Abbrechen</Button>}
              <Button onClick={save}><Save className="w-4 h-4 mr-1" />Speichern</Button>
            </div>
          </>
        ) : contract ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><div className="text-muted-foreground">Baseline-Jahr</div><div className="font-semibold">{contract.baseline_year}</div></div>
            <div><div className="text-muted-foreground">Start Beteiligung</div><div className="font-semibold">{contract.start_year}</div></div>
            <div><div className="text-muted-foreground">AICONO-Anteil</div><div className="font-semibold">{fmt(contract.aicono_share_pct, 2)} %</div></div>
            <div><div className="text-muted-foreground">Partner (vom AICONO-Anteil)</div><div className="font-semibold">{fmt(contract.partner_share_pct_of_aicono, 2)} %</div></div>
            <div><div className="text-muted-foreground">Witterungsbereinigung</div><div className="font-semibold">{contract.weather_normalize ? "Ja" : "Nein"}</div></div>
            <div><div className="text-muted-foreground">Preisbasis</div><div className="font-semibold">{contract.price_basis === "contract_fixed" ? "Festpreis" : "Jahresmittel"}</div></div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BaselineCard({ contract, baselines, recalc, override }: {
  contract: SavingsContract;
  baselines: SavingsBaseline[];
  recalc: () => void;
  override: (params: { id: string; baseline_kwh_normalized: number; override_reason: string }) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [overrideVal, setOverrideVal] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Baseline ({contract.baseline_year})</CardTitle>
        <Button size="sm" onClick={recalc}><Calculator className="w-4 h-4 mr-1" />Neu berechnen</Button>
      </CardHeader>
      <CardContent>
        {baselines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Baseline berechnet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Energieart</TableHead><TableHead className="text-right">Roh (kWh)</TableHead>
              <TableHead className="text-right">Bereinigt (kWh)</TableHead><TableHead className="text-right">HDD</TableHead>
              <TableHead>Quelle</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {baselines.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.energy_type}</TableCell>
                  <TableCell className="text-right">{fmtInt(b.baseline_kwh_raw)}</TableCell>
                  <TableCell className="text-right">{fmtInt(b.baseline_kwh_normalized)}</TableCell>
                  <TableCell className="text-right">{b.baseline_hdd ? fmt(b.baseline_hdd, 0) : "–"}</TableCell>
                  <TableCell><Badge variant="outline">{b.baseline_source === "manual_override" ? "Manuell" : b.baseline_source === "invoice_based" ? "Rechnung" : "Automatisch"}</Badge></TableCell>
                  <TableCell>
                    <Dialog open={dialogOpen === b.id} onOpenChange={(o) => { setDialogOpen(o ? b.id : null); if (o) { setOverrideVal(String(b.baseline_kwh_normalized)); setReason(b.override_reason ?? ""); } }}>
                      <DialogTrigger asChild><Button size="sm" variant="ghost"><Pencil className="w-4 h-4" /></Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Baseline überschreiben – {b.energy_type}</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div><Label>Bereinigter Verbrauch (kWh)</Label><Input type="number" value={overrideVal} onChange={e => setOverrideVal(e.target.value)} /></div>
                          <div><Label>Begründung</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} /></div>
                        </div>
                        <DialogFooter>
                          <Button onClick={() => { override({ id: b.id, baseline_kwh_normalized: Number(overrideVal), override_reason: reason }); setDialogOpen(null); }}>
                            Speichern
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SettlementsCard({ contract }: { contract: SavingsContract }) {
  const { list, calculate, updateStatus } = useTenantSavingsSettlements(contract.id);
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [detail, setDetail] = useState<SavingsSettlement | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Abrechnungen</CardTitle>
        <div className="flex items-center gap-2">
          <Input type="number" className="w-24" value={year} onChange={e => setYear(Number(e.target.value))} />
          <Button size="sm" onClick={() => calculate.mutate(year)}><Calculator className="w-4 h-4 mr-1" />Für Jahr berechnen</Button>
        </div>
      </CardHeader>
      <CardContent>
        {(list.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Abrechnungen.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Jahr</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Einsparung (€)</TableHead>
              <TableHead className="text-right">AICONO (€)</TableHead>
              <TableHead className="text-right">Partner (€)</TableHead>
              <TableHead className="text-right">Mandant (€)</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(list.data ?? []).map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.period_year}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge></TableCell>
                  <TableCell className="text-right">{eur(s.total_savings_eur)}</TableCell>
                  <TableCell className="text-right">{eur(s.aicono_amount_eur)}</TableCell>
                  <TableCell className="text-right">{eur(s.partner_amount_eur)}</TableCell>
                  <TableCell className="text-right">{eur(s.tenant_retained_eur)}</TableCell>
                  <TableCell className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(s)}>Details</Button>
                    {s.status === "draft" && <Button size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "approved" })}><CheckCircle2 className="w-4 h-4 mr-1" />Freigeben</Button>}
                    {s.status === "approved" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: s.id, status: "invoiced" })}>Als abgerechnet</Button>}
                    {s.status === "invoiced" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: s.id, status: "paid" })}>Als bezahlt</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Detail Jahr {detail?.period_year}</DialogTitle></DialogHeader>
            {detail && (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Energieart</TableHead>
                  <TableHead className="text-right">Baseline (kWh)</TableHead>
                  <TableHead className="text-right">Ist (kWh)</TableHead>
                  <TableHead className="text-right">HDD-Faktor</TableHead>
                  <TableHead className="text-right">Preis (€/kWh)</TableHead>
                  <TableHead className="text-right">Einsparung (kWh)</TableHead>
                  <TableHead className="text-right">Einsparung (€)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(detail.per_energy_type ?? []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.energy_type}</TableCell>
                      <TableCell className="text-right">{fmtInt(r.baseline_kwh)}</TableCell>
                      <TableCell className="text-right">{fmtInt(r.actual_kwh)}</TableCell>
                      <TableCell className="text-right">{fmt(r.hdd_factor, 4)}</TableCell>
                      <TableCell className="text-right">{fmt(r.avg_price_eur_per_kwh, 4)}</TableCell>
                      <TableCell className="text-right">{fmtInt(r.savings_kwh)}</TableCell>
                      <TableCell className="text-right">{eur(r.savings_eur)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export interface SavingsShareTabProps {
  tenantId: string;
  moduleEnabled: boolean;
}

export default function SavingsShareTab({ tenantId, moduleEnabled }: SavingsShareTabProps) {
  const { contract, baselines, upsertContract, recalcBaseline, overrideBaseline } =
    useTenantSavingsContract(tenantId);

  if (!moduleEnabled) {
    return (
      <Card>
        <CardHeader><CardTitle>Modul nicht aktiv</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Das Modul „Gain-Sharing (Einsparbeteiligung)" ist für diesen Mandanten nicht aktiviert.
            Aktivieren Sie es im Tab „Module", um Verträge und Abrechnungen anzulegen.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (contract.isLoading) return <div className="text-sm text-muted-foreground">Lädt…</div>;

  return (
    <div className="space-y-4">
      <ContractCard
        tenantId={tenantId}
        contract={contract.data ?? null}
        upsert={upsertContract.mutate}
      />
      {contract.data && (
        <>
          <BaselineCard
            contract={contract.data}
            baselines={baselines.data ?? []}
            recalc={() => recalcBaseline.mutate()}
            override={overrideBaseline.mutate}
          />
          <SettlementsCard contract={contract.data} />
        </>
      )}
    </div>
  );
}
