import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Battery, Calendar, Download, Euro, Plus, Trash2, Zap, TrendingDown, Wifi, WifiOff } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import {
  usePeakShavingConfigs, usePeakShavingEvents, usePeakShavingMonthly,
  usePeakShavingCalendar, usePeakShavingDispatches, downloadPeakShavingReport,
  type PeakShavingConfig, type PeakShavingCalendarEvent,
} from "@/hooks/usePeakShaving";
import { useLocations } from "@/hooks/useLocations";
import { useEnergyStorages } from "@/hooks/useEnergyStorages";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

const fmtNum = (n: number, d = 0) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtEur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function PeakShaving() {
  const { configs, isLoading, upsert, remove } = usePeakShavingConfigs();
  const { data: events = [] } = usePeakShavingEvents(100);
  const { data: monthly = [] } = usePeakShavingMonthly();
  const { locations } = useLocations();
  const { storages } = useEnergyStorages();

  const now = new Date();
  const currentMonth = monthly.find((m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1);
  const ytd = monthly.filter((m) => m.year === now.getFullYear());
  const ytdSaved = ytd.reduce((s, m) => s + Number(m.total_eur_saved), 0);
  const ytdKwh = ytd.reduce((s, m) => s + Number(m.total_kwh_discharged), 0);
  const ytdMaxPeak = ytd.reduce((m, x) => Math.max(m, Number(x.max_peak_kw)), 0);
  const ytdBaseline = ytd.reduce((m, x) => Math.max(m, Number(x.baseline_peak_kw)), 0);

  // Jahresprognose: linear hochgerechnet auf 12 Monate basierend auf YTD-Schnitt
  const monthsElapsed = ytd.length || 1;
  const annualForecast = (ytdSaved / monthsElapsed) * 12;

  const activeEvent = events.find((e) => !e.ended_at);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Peak-Shaving</h1>
              <p className="text-muted-foreground">
                Lastspitzen kappen, Netzentgelte senken — Live-Tracking eingesparter Euro
              </p>
            </div>
            <ConfigDialog
              trigger={<Button><Plus className="h-4 w-4 mr-2" />Neue Konfiguration</Button>}
              onSave={(v) => upsert.mutate(v)}
              locations={locations}
              storages={storages}
            />
          </div>

          {/* KPI Kacheln */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<Euro className="h-5 w-5 text-primary" />}
              label="Ersparnis aktueller Monat"
              value={fmtEur(Number(currentMonth?.total_eur_saved ?? 0))}
              sub={`${currentMonth?.event_count ?? 0} Eingriffe`}
            />
            <KpiCard
              icon={<Euro className="h-5 w-5 text-primary" />}
              label="Ersparnis YTD"
              value={fmtEur(ytdSaved)}
              sub={`Jahresprognose: ${fmtEur(annualForecast)}`}
            />
            <KpiCard
              icon={<TrendingDown className="h-5 w-5 text-emerald-500" />}
              label="Höchste Spitze (Jahr)"
              value={`${fmtNum(ytdMaxPeak, 1)} kW`}
              sub={`ohne Shaving: ${fmtNum(ytdBaseline, 1)} kW`}
            />
            <KpiCard
              icon={<Battery className="h-5 w-5 text-primary" />}
              label="Entladene Energie YTD"
              value={`${fmtNum(ytdKwh, 0)} kWh`}
              sub={`${configs.filter((c) => c.active).length} aktive Konfigs`}
            />
          </div>

          {/* Live-Eingriff */}
          {activeEvent && (
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary animate-pulse" />
                  <CardTitle>Aktiver Eingriff läuft</CardTitle>
                </div>
                <CardDescription>
                  Speicher gleicht eine Lastspitze aus — gestartet {format(new Date(activeEvent.started_at), "HH:mm:ss", { locale: de })}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Mini label="Aktuelle Spitze" value={`${fmtNum(Number(activeEvent.peak_kw_actual ?? 0), 1)} kW`} />
                <Mini label="Ohne Shaving" value={`${fmtNum(Number(activeEvent.peak_kw_without_shaving ?? 0), 1)} kW`} />
                <Mini label="Entladen" value={`${fmtNum(Number(activeEvent.kwh_discharged), 2)} kWh`} />
                <Mini label="Auslöser" value={activeEvent.trigger_reason ?? "—"} />
              </CardContent>
            </Card>
          )}

          {/* Konfigurationen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Konfigurationen</CardTitle>
              <CardDescription>Pro Standort + Speicher eine Regel</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Lade …</p>
              ) : configs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Noch keine Konfiguration. Erstelle eine, um Peak-Shaving zu aktivieren.
                </p>
              ) : (
                <div className="space-y-3">
                  {configs.map((cfg) => {
                    const loc = locations.find((l) => l.id === cfg.location_id);
                    const st = storages.find((s) => s.id === cfg.storage_id);
                    return (
                      <div key={cfg.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-4">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{loc?.name ?? cfg.location_id.slice(0, 8)}</span>
                            <Badge variant={cfg.active ? "default" : "secondary"}>{cfg.active ? "Aktiv" : "Inaktiv"}</Badge>
                            <Badge variant="outline">{cfg.mode === "forecast" ? "Schwellwert + Prognose" : cfg.mode === "event" ? "Event-Kalender" : "Schwellwert"}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Speicher: {st?.name ?? "—"} · Limit: <b>{fmtNum(Number(cfg.peak_limit_kw), 0)} kW</b> · Netzentgelt: {fmtEur(Number(cfg.network_tariff_eur_per_kw_year))}/kW/Jahr
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <ConfigDialog
                            trigger={<Button variant="outline" size="sm">Bearbeiten</Button>}
                            initial={cfg}
                            onSave={(v) => upsert.mutate({ ...v, id: cfg.id })}
                            locations={locations}
                            storages={storages}
                          />
                          <ReportButton configId={cfg.id} />
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Wirklich löschen?")) remove.mutate(cfg.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          {/* Event-Kalender */}
          <CalendarSection configs={configs} locations={locations} />


          {/* Event-Log */}
          <Card>
            <CardHeader>
              <CardTitle>Eingriffs-Historie</CardTitle>
              <CardDescription>Letzte 100 Eingriffe — sortiert nach Startzeitpunkt</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Start</TableHead>
                    <TableHead>Dauer</TableHead>
                    <TableHead className="text-right">Spitze (kW)</TableHead>
                    <TableHead className="text-right">Ohne Shaving (kW)</TableHead>
                    <TableHead className="text-right">Entladen (kWh)</TableHead>
                    <TableHead className="text-right">Ersparnis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Noch keine Eingriffe</TableCell></TableRow>
                  ) : events.map((e) => {
                    const dur = e.ended_at
                      ? Math.round((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000)
                      : null;
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{format(new Date(e.started_at), "dd.MM.yyyy HH:mm", { locale: de })}</TableCell>
                        <TableCell>{dur === null ? <Badge variant="default">läuft</Badge> : `${dur} min`}</TableCell>
                        <TableCell className="text-right">{fmtNum(Number(e.peak_kw_actual ?? 0), 1)}</TableCell>
                        <TableCell className="text-right">{fmtNum(Number(e.peak_kw_without_shaving ?? 0), 1)}</TableCell>
                        <TableCell className="text-right">{fmtNum(Number(e.kwh_discharged), 2)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{fmtEur(Number(e.eur_saved))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

interface ConfigDialogProps {
  trigger: React.ReactNode;
  initial?: PeakShavingConfig;
  onSave: (v: Partial<PeakShavingConfig>) => void;
  locations: Array<{ id: string; name: string }>;
  storages: Array<{ id: string; name: string; location_id?: string | null }>;
}
function ConfigDialog({ trigger, initial, onSave, locations, storages }: ConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<PeakShavingConfig>>(
    initial ?? {
      location_id: "",
      storage_id: "",
      peak_limit_kw: 500,
      reserve_soc_pct: 20,
      mode: "threshold",
      network_tariff_eur_per_kw_year: 150,
      billing_cycle: "monthly",
      hysteresis_pct: 85,
      active: true,
    },
  );

  const handleSave = () => {
    if (!form.location_id || !form.storage_id || !form.peak_limit_kw) {
      return;
    }
    onSave(form);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Konfiguration bearbeiten" : "Neue Peak-Shaving-Konfiguration"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 md:col-span-1">
            <Label>Standort</Label>
            <Select value={form.location_id ?? ""} onValueChange={(v) => setForm({ ...form, location_id: v })}>
              <SelectTrigger><SelectValue placeholder="Standort wählen" /></SelectTrigger>
              <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label>Speicher</Label>
            <Select value={form.storage_id ?? ""} onValueChange={(v) => setForm({ ...form, storage_id: v })}>
              <SelectTrigger><SelectValue placeholder="Speicher wählen" /></SelectTrigger>
              <SelectContent>{storages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Peak-Limit (kW)</Label>
            <Input type="number" value={form.peak_limit_kw ?? ""} onChange={(e) => setForm({ ...form, peak_limit_kw: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Netzentgelt (€/kW/Jahr)</Label>
            <Input type="number" value={form.network_tariff_eur_per_kw_year ?? ""} onChange={(e) => setForm({ ...form, network_tariff_eur_per_kw_year: Number(e.target.value) })} />
          </div>
          <div>
            <Label>SoC-Reserve (%)</Label>
            <Input type="number" value={form.reserve_soc_pct ?? ""} onChange={(e) => setForm({ ...form, reserve_soc_pct: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Hysterese (%)</Label>
            <Input type="number" value={form.hysteresis_pct ?? ""} onChange={(e) => setForm({ ...form, hysteresis_pct: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Modus</Label>
            <Select value={form.mode ?? "threshold"} onValueChange={(v) => setForm({ ...form, mode: v as PeakShavingConfig["mode"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="threshold">Schwellwert</SelectItem>
                <SelectItem value="forecast">Schwellwert + 15-Min-Prognose</SelectItem>
                <SelectItem value="event">Event-Kalender (Phase 2)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Abrechnungszyklus Netzentgelt</Label>
            <Select value={form.billing_cycle ?? "monthly"} onValueChange={(v) => setForm({ ...form, billing_cycle: v as PeakShavingConfig["billing_cycle"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-base">Aktiv</Label>
              <p className="text-xs text-muted-foreground">Edge-Scheduler greift nur bei aktiven Konfigurationen ein</p>
            </div>
            <Switch checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button onClick={handleSave}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
