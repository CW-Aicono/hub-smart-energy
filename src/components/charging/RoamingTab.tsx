import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Globe, Plus, Edit, Trash2, Plug, ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";
import { format } from "date-fns";
import {
  useRoamingSettings,
  useRoamingPartners,
  useRoamingSessions,
  RoamingPartner,
} from "@/hooks/useRoaming";
import { useChargingTariffs } from "@/hooks/useChargingTariffs";

const emptyPartnerForm = {
  name: "",
  role: "CPO",
  protocol: "OCPI",
  country_code: "DE",
  party_id: "",
  endpoint_url: "",
  token: "",
  status: "pending",
  notes: "",
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: any }> = {
    active: { label: "Aktiv", variant: "default" },
    inactive: { label: "Inaktiv", variant: "secondary" },
    pending: { label: "Ausstehend", variant: "outline" },
    error: { label: "Fehler", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function sessionStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: any }> = {
    active: { label: "Läuft", variant: "default" },
    completed: { label: "Abgeschlossen", variant: "secondary" },
    pending: { label: "Geplant", variant: "outline" },
    failed: { label: "Fehler", variant: "destructive" },
    cancelled: { label: "Abgebrochen", variant: "outline" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export default function RoamingTab() {
  const { settings, isLoading: settingsLoading, upsert } = useRoamingSettings();
  const { partners, isLoading: partnersLoading, add, update, remove, testConnection } =
    useRoamingPartners();
  const { sessions, isLoading: sessionsLoading } = useRoamingSessions();
  const { tariffs } = useChargingTariffs();

  // Settings form
  const [enabled, setEnabled] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    role: "CPO",
    protocol: "OCPI",
    country_code: "DE",
    party_id: "",
    our_token: "",
    default_guest_tariff_id: "__none__",
    notes: "",
  });
  // initialize from settings once loaded
  const [hydrated, setHydrated] = useState(false);
  if (!hydrated && settings) {
    setEnabled(settings.enabled);
    setSettingsForm({
      role: settings.role,
      protocol: settings.protocol,
      country_code: settings.country_code ?? "DE",
      party_id: settings.party_id ?? "",
      our_token: settings.our_token ?? "",
      default_guest_tariff_id: settings.default_guest_tariff_id ?? "__none__",
      notes: settings.notes ?? "",
    });
    setHydrated(true);
  }

  const saveSettings = () => {
    upsert.mutate({
      enabled,
      role: settingsForm.role as any,
      protocol: settingsForm.protocol as any,
      country_code: settingsForm.country_code || null,
      party_id: settingsForm.party_id || null,
      our_token: settingsForm.our_token || null,
      default_guest_tariff_id:
        settingsForm.default_guest_tariff_id === "__none__"
          ? null
          : settingsForm.default_guest_tariff_id,
      notes: settingsForm.notes || null,
    });
  };

  // Partner dialog
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<RoamingPartner | null>(null);
  const [partnerForm, setPartnerForm] = useState(emptyPartnerForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNewPartner = () => {
    setEditPartner(null);
    setPartnerForm(emptyPartnerForm);
    setPartnerOpen(true);
  };
  const openEditPartner = (p: RoamingPartner) => {
    setEditPartner(p);
    setPartnerForm({
      name: p.name,
      role: p.role,
      protocol: p.protocol,
      country_code: p.country_code ?? "",
      party_id: p.party_id ?? "",
      endpoint_url: p.endpoint_url ?? "",
      token: p.token ?? "",
      status: p.status,
      notes: p.notes ?? "",
    });
    setPartnerOpen(true);
  };
  const savePartner = () => {
    const payload = {
      name: partnerForm.name.trim(),
      role: partnerForm.role as any,
      protocol: partnerForm.protocol as any,
      country_code: partnerForm.country_code || null,
      party_id: partnerForm.party_id || null,
      endpoint_url: partnerForm.endpoint_url || null,
      token: partnerForm.token || null,
      status: partnerForm.status as any,
      notes: partnerForm.notes || null,
    };
    if (!payload.name) return;
    if (editPartner) {
      update.mutate({ id: editPartner.id, ...payload }, { onSuccess: () => setPartnerOpen(false) });
    } else {
      add.mutate(payload as any, { onSuccess: () => setPartnerOpen(false) });
    }
  };

  type PartnerSortKey = "name" | "role" | "protocol" | "id" | "status" | "sync";
  const { sorted: sortedPartners, sort: partnerSort, toggle: partnerToggle } = useSortableData<any, PartnerSortKey>(partners, (p, k) => {
    switch (k) {
      case "name": return p.name || "";
      case "role": return p.role || "";
      case "protocol": return p.protocol || "";
      case "id": return [p.country_code, p.party_id].filter(Boolean).join(" / ") || "";
      case "status": return p.status || "";
      case "sync": return p.last_sync_at ? new Date(p.last_sync_at) : new Date(0);
      default: return null;
    }
  });

  type SessionSortKey = "direction" | "partner" | "start" | "end" | "energy" | "cost" | "status";
  const { sorted: sortedSessions, sort: sessionSort, toggle: sessionToggle } = useSortableData<any, SessionSortKey>(sessions, (s, k) => {
    switch (k) {
      case "direction": return s.direction || "";
      case "partner": return partners.find((p: any) => p.id === s.partner_id)?.name || "";
      case "start": return s.started_at ? new Date(s.started_at) : new Date(0);
      case "end": return s.ended_at ? new Date(s.ended_at) : new Date(0);
      case "energy": return Number(s.energy_kwh || 0);
      case "cost": return Number(s.cost_amount || 0);
      case "status": return s.status || "";
      default: return null;
    }
  });


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" /> Roaming
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings">Einstellungen</TabsTrigger>
            <TabsTrigger value="partners">Partner-Netzwerke</TabsTrigger>
            <TabsTrigger value="sessions">Roaming-Ladevorgänge</TabsTrigger>
          </TabsList>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4">
            <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <p className="text-muted-foreground">
                Konfigurieren Sie Ihre eigene Roaming-Identität. Diese Daten werden gegenüber Partner-Netzwerken
                (OCPI, Hubject, eRoaming) verwendet, damit Fremdfahrer an Ihren Ladepunkten laden können und
                umgekehrt.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">Roaming aktiv</div>
                <div className="text-sm text-muted-foreground">
                  Bei Deaktivierung werden keine Fremdfahrer angenommen.
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={settingsLoading} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Rolle</Label>
                <Select
                  value={settingsForm.role}
                  onValueChange={(v) => setSettingsForm({ ...settingsForm, role: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPO">CPO (Betreiber der Ladestationen)</SelectItem>
                    <SelectItem value="EMSP">EMSP (E-Mobility Anbieter / Ladekarten)</SelectItem>
                    <SelectItem value="HUB">HUB (Roaming-Drehscheibe)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Protokoll</Label>
                <Select
                  value={settingsForm.protocol}
                  onValueChange={(v) => setSettingsForm({ ...settingsForm, protocol: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OCPI">OCPI</SelectItem>
                    <SelectItem value="HUBJECT">Hubject / eRoaming</SelectItem>
                    <SelectItem value="OTHER">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Länderkürzel (ISO, z. B. DE)</Label>
                <Input
                  maxLength={3}
                  value={settingsForm.country_code}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, country_code: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Party-ID (3-stellig)</Label>
                <Input
                  maxLength={3}
                  value={settingsForm.party_id}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, party_id: e.target.value.toUpperCase() })
                  }
                  placeholder="z. B. AIC"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Eigener Token (wird an Partner herausgegeben)</Label>
                <Input
                  value={settingsForm.our_token}
                  onChange={(e) => setSettingsForm({ ...settingsForm, our_token: e.target.value })}
                  placeholder="Auto-generiert oder manuell eingetragen"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Standardtarif für Roaming-Gäste</Label>
                <Select
                  value={settingsForm.default_guest_tariff_id}
                  onValueChange={(v) =>
                    setSettingsForm({ ...settingsForm, default_guest_tariff_id: v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Tarif wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Kein Standardtarif —</SelectItem>
                    {tariffs.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notizen</Label>
                <Textarea
                  rows={3}
                  value={settingsForm.notes}
                  onChange={(e) => setSettingsForm({ ...settingsForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={upsert.isPending}>
                {upsert.isPending ? "Speichere..." : "Speichern"}
              </Button>
            </div>
          </TabsContent>

          {/* PARTNERS */}
          <TabsContent value="partners" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Externe Roaming-Netzwerke und Partner-Verbindungen verwalten.
              </p>
              <Button onClick={openNewPartner} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Partner hinzufügen
              </Button>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Name" sortKey="name" sort={partnerSort} onToggle={partnerToggle} />
                    <SortableHead label="Rolle" sortKey="role" sort={partnerSort} onToggle={partnerToggle} />
                    <SortableHead label="Protokoll" sortKey="protocol" sort={partnerSort} onToggle={partnerToggle} />
                    <TableHead><SortableHead label="Land / Party-ID" sortKey="id" sort={partnerSort} onToggle={partnerToggle} /></TableHead>
                    <SortableHead label="Status" sortKey="status" sort={partnerSort} onToggle={partnerToggle} />
                    <SortableHead label="Letzter Sync" sortKey="sync" sort={partnerSort} onToggle={partnerToggle} />
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnersLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Lade...</TableCell></TableRow>
                  ) : partners.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Noch keine Partner angelegt.</TableCell></TableRow>
                  ) : (
                    partners.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.role}</TableCell>
                        <TableCell>{p.protocol}</TableCell>
                        <TableCell>{[p.country_code, p.party_id].filter(Boolean).join(" / ") || "—"}</TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.last_sync_at ? format(new Date(p.last_sync_at), "dd.MM.yyyy HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => testConnection.mutate(p)}
                            disabled={testConnection.isPending}
                            title="Verbindung testen"
                          >
                            <Plug className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEditPartner(p)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* SESSIONS */}
          <TabsContent value="sessions" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Übersicht aller eingehenden (Fremdfahrer bei uns) und ausgehenden (eigene Nutzer extern)
              Roaming-Ladevorgänge.
            </p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Richtung" sortKey="direction" sort={sessionSort} onToggle={sessionToggle} />
                    <SortableHead label="Partner" sortKey="partner" sort={sessionSort} onToggle={sessionToggle} />
                    <TableHead>Externe Session</TableHead>
                    <SortableHead label="Start" sortKey="start" sort={sessionSort} onToggle={sessionToggle} />
                    <SortableHead label="Ende" sortKey="end" sort={sessionSort} onToggle={sessionToggle} />
                    <SortableHead label="Energie (kWh)" sortKey="energy" sort={sessionSort} onToggle={sessionToggle} />
                    <SortableHead label="Kosten" sortKey="cost" sort={sessionSort} onToggle={sessionToggle} />
                    <SortableHead label="Status" sortKey="status" sort={partnerSort} onToggle={partnerToggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionsLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Lade...</TableCell></TableRow>
                  ) : sessions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Noch keine Roaming-Ladevorgänge.</TableCell></TableRow>
                  ) : (
                    sessions.map((s) => {
                      const partner = partners.find((p) => p.id === s.partner_id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            {s.direction === "inbound" ? (
                              <span className="inline-flex items-center gap-1 text-sm">
                                <ArrowDownLeft className="h-4 w-4" /> Eingehend
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm">
                                <ArrowUpRight className="h-4 w-4" /> Ausgehend
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{partner?.name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.external_session_id ?? "—"}</TableCell>
                          <TableCell>{s.started_at ? format(new Date(s.started_at), "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                          <TableCell>{s.ended_at ? format(new Date(s.ended_at), "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                          <TableCell className="text-right">{Number(s.energy_kwh).toLocaleString("de-DE", { maximumFractionDigits: 3 })}</TableCell>
                          <TableCell className="text-right">{Number(s.cost_amount).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s.currency}</TableCell>
                          <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Partner-Dialog */}
      <Dialog open={partnerOpen} onOpenChange={setPartnerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editPartner ? "Partner bearbeiten" : "Neuen Roaming-Partner anlegen"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1">
              <Label>Name *</Label>
              <Input
                value={partnerForm.name}
                onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                placeholder="z. B. Hubject, EnBW mobility+"
              />
            </div>
            <div className="space-y-1">
              <Label>Rolle</Label>
              <Select value={partnerForm.role} onValueChange={(v) => setPartnerForm({ ...partnerForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPO">CPO</SelectItem>
                  <SelectItem value="EMSP">EMSP</SelectItem>
                  <SelectItem value="HUB">HUB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Protokoll</Label>
              <Select value={partnerForm.protocol} onValueChange={(v) => setPartnerForm({ ...partnerForm, protocol: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OCPI">OCPI</SelectItem>
                  <SelectItem value="HUBJECT">Hubject</SelectItem>
                  <SelectItem value="OTHER">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Land</Label>
              <Input
                maxLength={3}
                value={partnerForm.country_code}
                onChange={(e) => setPartnerForm({ ...partnerForm, country_code: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1">
              <Label>Party-ID</Label>
              <Input
                maxLength={3}
                value={partnerForm.party_id}
                onChange={(e) => setPartnerForm({ ...partnerForm, party_id: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Endpunkt-URL</Label>
              <Input
                value={partnerForm.endpoint_url}
                onChange={(e) => setPartnerForm({ ...partnerForm, endpoint_url: e.target.value })}
                placeholder="https://partner.example.com/ocpi/2.2/"
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Token / API-Key</Label>
              <Input
                type="password"
                value={partnerForm.token}
                onChange={(e) => setPartnerForm({ ...partnerForm, token: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={partnerForm.status} onValueChange={(v) => setPartnerForm({ ...partnerForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                  <SelectItem value="error">Fehler</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Notizen</Label>
              <Textarea
                rows={2}
                value={partnerForm.notes}
                onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerOpen(false)}>Abbrechen</Button>
            <Button onClick={savePartner} disabled={!partnerForm.name.trim() || add.isPending || update.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Partner löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Roaming-Verbindung wird entfernt. Bereits archivierte Ladevorgänge bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) remove.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
