import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
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
  
  const { sorted: sortedEvents, sort: sortEvents, toggle: toggleEvents } = useSortableData(events, (r, k) => {
    switch (k) {
      case "start": return r.started_at ? new Date(r.started_at) : null;
      case "duration": return r.ended_at ? (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) : 999999999;
      case "peak": return Number(r.peak_kw_actual ?? 0);
      case "baseline": return Number(r.peak_kw_without_shaving ?? 0);
      case "discharged": return Number(r.kwh_discharged ?? 0);
      case "savings": return Number(r.eur_saved ?? 0);
      default: return null;
    }
  });
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
                    <SortableHead column="start" onSort={toggleEvents} sort={sortEvents}>Start</SortableHead>
                    <SortableHead column="duration" onSort={toggleEvents} sort={sortEvents}>Dauer</SortableHead>
                    <SortableHead column="peak" onSort={toggleEvents} sort={sortEvents} className="text-right">Spitze (kW)</SortableHead>
                    <SortableHead column="baseline" onSort={toggleEvents} sort={sortEvents} className="text-right">Ohne Shaving (kW)</SortableHead>
                    <SortableHead column="discharged" onSort={toggleEvents} sort={sortEvents} className="text-right">Entladen (kWh)</SortableHead>
                    <SortableHead column="savings" onSort={toggleEvents} sort={sortEvents} className="text-right">Ersparnis</SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Noch keine Eingriffe</TableCell></TableRow>
                  ) : sortedEvents.map((e) => {
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
          <div className="col-span-2 border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Monatlicher PDF-Report</Label>
                <p className="text-xs text-muted-foreground">Automatischer Versand am 1. des Folgemonats</p>
              </div>
              <Switch
                checked={form.report_enabled ?? false}
                onCheckedChange={(v) => setForm({ ...form, report_enabled: v })}
              />
            </div>
            <div>
              <Label>Empfänger (E-Mails, kommagetrennt)</Label>
              <Textarea
                rows={2}
                placeholder="finance@arena.de, betrieb@arena.de"
                value={(form.report_recipients ?? []).join(", ")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    report_recipients: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
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

// =============== PDF-Report Button ===============
function ReportButton({ configId }: { configId: string }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth()); // Vormonat als Default
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      await downloadPeakShavingReport(configId, year, month);
      toast({ title: "Report heruntergeladen" });
      setOpen(false);
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const months = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Monats-Report als PDF">
          <Download className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PDF-Report herunterladen</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div>
            <Label>Monat</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Jahr</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button onClick={handleDownload} disabled={loading}>
            <Download className="h-4 w-4 mr-2" />
            {loading ? "Erstelle …" : "Herunterladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== Event-Kalender ===============
function CalendarSection({
  configs,
  locations,
}: {
  configs: PeakShavingConfig[];
  locations: Array<{ id: string; name: string }>;
}) {
  const { items, isLoading, upsert, remove } = usePeakShavingCalendar();
  const activeConfigs = configs.filter((c) => c.active);

  const statusLabel: Record<PeakShavingCalendarEvent["status"], string> = {
    planned: "Geplant",
    pre_charging: "Lädt vor",
    active: "Läuft",
    completed: "Abgeschlossen",
    cancelled: "Abgebrochen",
  };
  const statusVariant: Record<PeakShavingCalendarEvent["status"], "default" | "secondary" | "outline"> = {
    planned: "outline",
    pre_charging: "default",
    active: "default",
    completed: "secondary",
    cancelled: "secondary",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Event-Kalender</CardTitle>
            <CardDescription>Geplante Großverbraucher-Events — Speicher wird automatisch vorgeladen</CardDescription>
          </div>
          <CalendarEventDialog
            trigger={<Button size="sm"><Plus className="h-4 w-4 mr-2" />Event planen</Button>}
            configs={activeConfigs}
            locations={locations}
            onSave={(v) => upsert.mutate(v)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Lade …</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Noch keine geplanten Events. Lege ein Event an (z. B. „Rammstein-Konzert"), damit der Speicher rechtzeitig vorgeladen wird.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <SortableHead column="start" onSort={toggleEvents} sort={sortEvents}>Start</SortableHead>
                <TableHead>Ende</TableHead>
                <TableHead className="text-right">Erw. Peak (kW)</TableHead>
                <TableHead className="text-right">Ziel-SoC</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ev) => {
                const cfg = configs.find((c) => c.id === ev.config_id);
                const loc = locations.find((l) => l.id === cfg?.location_id);
                return (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <div className="font-medium">{ev.event_name}</div>
                      <div className="text-xs text-muted-foreground">{loc?.name ?? "—"}</div>
                    </TableCell>
                    <TableCell>{format(new Date(ev.start_at), "dd.MM.yyyy HH:mm", { locale: de })}</TableCell>
                    <TableCell>{format(new Date(ev.end_at), "dd.MM.yyyy HH:mm", { locale: de })}</TableCell>
                    <TableCell className="text-right">{ev.expected_peak_kw ? fmtNum(Number(ev.expected_peak_kw), 0) : "—"}</TableCell>
                    <TableCell className="text-right">{fmtNum(Number(ev.pre_charge_target_soc_pct), 0)} %</TableCell>
                    <TableCell><Badge variant={statusVariant[ev.status]}>{statusLabel[ev.status]}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <CalendarEventDialog
                          trigger={<Button variant="outline" size="sm">Bearbeiten</Button>}
                          initial={ev}
                          configs={activeConfigs}
                          locations={locations}
                          onSave={(v) => upsert.mutate({ ...v, id: ev.id })}
                        />
                        <Button variant="ghost" size="sm" onClick={() => { if (confirm("Event löschen?")) remove.mutate(ev.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CalendarEventDialog({
  trigger,
  initial,
  configs,
  locations,
  onSave,
}: {
  trigger: React.ReactNode;
  initial?: PeakShavingCalendarEvent;
  configs: PeakShavingConfig[];
  locations: Array<{ id: string; name: string }>;
  onSave: (v: Partial<PeakShavingCalendarEvent>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<PeakShavingCalendarEvent>>(
    initial ?? {
      config_id: "",
      event_name: "",
      start_at: "",
      end_at: "",
      expected_peak_kw: null,
      pre_charge_target_soc_pct: 95,
      pre_charge_lead_hours: 4,
      status: "planned",
      notes: null,
    },
  );

  const handleSave = () => {
    if (!form.config_id || !form.event_name || !form.start_at || !form.end_at) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    onSave({
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Event bearbeiten" : "Neues Event planen"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2">
            <Label>Event-Name *</Label>
            <Input
              placeholder="z. B. Rammstein-Konzert"
              value={form.event_name ?? ""}
              onChange={(e) => setForm({ ...form, event_name: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Peak-Shaving-Konfiguration *</Label>
            <Select value={form.config_id ?? ""} onValueChange={(v) => setForm({ ...form, config_id: v })}>
              <SelectTrigger><SelectValue placeholder="Konfiguration wählen" /></SelectTrigger>
              <SelectContent>
                {configs.map((c) => {
                  const loc = locations.find((l) => l.id === c.location_id);
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {loc?.name ?? c.location_id.slice(0, 8)} · {fmtNum(Number(c.peak_limit_kw), 0)} kW
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Start *</Label>
            <Input
              type="datetime-local"
              value={toLocalInput(form.start_at as string)}
              onChange={(e) => setForm({ ...form, start_at: e.target.value })}
            />
          </div>
          <div>
            <Label>Ende *</Label>
            <Input
              type="datetime-local"
              value={toLocalInput(form.end_at as string)}
              onChange={(e) => setForm({ ...form, end_at: e.target.value })}
            />
          </div>
          <div>
            <Label>Erwartete Spitze (kW)</Label>
            <Input
              type="number"
              placeholder="optional"
              value={form.expected_peak_kw ?? ""}
              onChange={(e) => setForm({ ...form, expected_peak_kw: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <Label>Ziel-SoC vor Event (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.pre_charge_target_soc_pct ?? 95}
              onChange={(e) => setForm({ ...form, pre_charge_target_soc_pct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Vorlauf (Stunden)</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={form.pre_charge_lead_hours ?? 4}
              onChange={(e) => setForm({ ...form, pre_charge_lead_hours: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status ?? "planned"} onValueChange={(v) => setForm({ ...form, status: v as PeakShavingCalendarEvent["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Geplant</SelectItem>
                <SelectItem value="pre_charging">Lädt vor</SelectItem>
                <SelectItem value="active">Läuft</SelectItem>
                <SelectItem value="completed">Abgeschlossen</SelectItem>
                <SelectItem value="cancelled">Abgebrochen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Notizen</Label>
            <Textarea
              rows={2}
              placeholder="optional"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
            />
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
