import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Users as UsersIcon, Sun, Receipt, FileSignature, PenLine, BarChart3, Upload, Calculator, ShieldCheck, Store, Pencil } from "lucide-react";
import {
  useEnergyCommunities,
  useCommunityMembers,
  useCommunityAssets,
  useCommunityTariffs,
  type CommunityMember,
  type CommunityAsset,
  type CommunityTariff,
  type EnergyCommunity,
} from "@/hooks/useEnergyCommunities";
import CommunityWizard from "@/components/energy-sharing/CommunityWizard";
import ContractTemplatesTab from "@/components/energy-sharing/ContractTemplatesTab";
import SignContractDialog from "@/components/energy-sharing/SignContractDialog";
import CommunityDashboardTab from "@/components/energy-sharing/CommunityDashboardTab";
import DataImportTab from "@/components/energy-sharing/DataImportTab";
import BillingTab from "@/components/energy-sharing/BillingTab";
import DataQualityTab from "@/components/energy-sharing/DataQualityTab";
import MarketplaceTab from "@/components/energy-sharing/MarketplaceTab";
import { maLoError, meLoError } from "@/lib/energy-sharing/idValidation";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import {
  classifyKmu,
  CUSTOMER_CLASS_LABELS,
  IMSYS_STATUS_LABELS,
  METERING_TYPE_LABELS,
  BUILDING_TYPE_LABELS,
  imsysDeadline,
  isSmallPlant,
  type CustomerClass,
} from "@/lib/energy-sharing/kmuClassification";

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  inactive: "Inaktiv",
  pending: "Ausstehend",
  invited: "Eingeladen",
  archived: "Archiviert",
};
const ASSET_TYPE_LABELS: Record<string, string> = {
  pv: "PV-Anlage",
  wind: "Wind",
  chp: "BHKW",
  storage: "Speicher",
};
const SHARE_MODEL_LABELS: Record<string, string> = {
  gleich: "Gleiche Anteile",
  nach_anteil: "Nach kW-Anteil",
  dynamisch: "Dynamisch (Verbrauch)",
};
const ROLE_LABELS: Record<string, string> = {
  member: "Mitglied (Verbraucher)",
  producer: "Erzeuger",
  consumer: "Reiner Verbraucher",
  prosumer: "Prosumer",
  service: "Dienstleister",
  rest_supplier: "Reststromlieferant (Info)",
};
const labelOr = (map: Record<string, string>, key: string | null | undefined) =>
  (key && map[key]) || key || "—";

export default function EnergySharing() {
  const { communities, isLoading, deleteCommunity, updateCommunity } = useEnergyCommunities();
  const [editCommunity, setEditCommunity] = useState<EnergyCommunity | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);


  const selected = communities.find((c) => c.id === selectedId) ?? communities[0] ?? null;
  const activeId = selected?.id ?? null;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Energy Sharing</h1>
            <p className="text-muted-foreground">
              Energiegemeinschaften nach §42c EnWG — Mitglieder, Anlagen, Tarife und Verträge.
            </p>
        </div>

        <Alert className="mb-6 border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Pilotbetrieb nach §42c EnWG</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            Die bundesweit einheitliche Internetplattform nach §20b EnWG sowie finale Vorgaben der Bundesnetzagentur stehen
            noch aus (Stand: BDEW erwartet Konsultation Q3/Q4 2026, breite Marktdurchdringung ab 2027). Prozesse, Vertrags-
            und Messkonzepte können sich später ändern. Es besteht keine Befreiung von Netzentgelten, Steuern oder Umlagen.
          </AlertDescription>
        </Alert>


          <Button onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Neue Community</Button>
          <CommunityWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={(id) => setSelectedId(id)} />
        </div>


        {isLoading ? (
          <p className="text-muted-foreground">Lade …</p>
        ) : communities.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            Noch keine Community angelegt. Lege deine erste Energiegemeinschaft an.
          </CardContent></Card>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap mb-6">
              {communities.map((c) => (
                <div key={c.id} className="inline-flex items-center rounded-full border bg-card overflow-hidden">
                  <Button
                    variant={activeId === c.id ? "default" : "ghost"}
                    onClick={() => setSelectedId(c.id)}
                    className="rounded-none rounded-l-full border-0"
                  >
                    {c.name}
                    <Badge variant="secondary" className="ml-2">{labelOr(STATUS_LABELS, c.status)}</Badge>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none rounded-r-full px-2"
                    title="Community bearbeiten"
                    onClick={() => setEditCommunity(c)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <CommunityEditDialog
              community={editCommunity}
              onOpenChange={(o) => !o && setEditCommunity(null)}
              onSave={async (values) => {
                await updateCommunity.mutateAsync({ id: editCommunity!.id, ...values });
                setEditCommunity(null);
              }}
              onDelete={async () => {
                if (!editCommunity) return;
                if (await confirmDialog({ title: "Community löschen", description: `Community "${editCommunity.name}" wirklich unwiderruflich löschen?`, confirmLabel: "Löschen" })) {
                  await deleteCommunity.mutateAsync(editCommunity.id);
                  if (selectedId === editCommunity.id) setSelectedId(null);
                  setEditCommunity(null);
                }
              }}
            />

            {selected && (
              <CommunityDetail
                communityId={selected.id}
                communityName={selected.name}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CommunityDetail({ communityId, communityName }: { communityId: string; communityName: string }) {
  return (
    <Tabs defaultValue="ueberblick">
      <TabsList className="flex-wrap">
        <TabsTrigger value="ueberblick"><BarChart3 className="h-4 w-4 mr-1" />Überblick</TabsTrigger>
        <TabsTrigger value="stammdaten"><UsersIcon className="h-4 w-4 mr-1" />Stammdaten</TabsTrigger>
        <TabsTrigger value="betrieb"><Calculator className="h-4 w-4 mr-1" />Betrieb</TabsTrigger>
        <TabsTrigger value="marktplatz"><Store className="h-4 w-4 mr-1" />Marktplatz</TabsTrigger>
      </TabsList>

      {/* GRUPPE 1: ÜBERBLICK */}
      <TabsContent value="ueberblick">
        <CommunityDashboardTab communityId={communityId} />
      </TabsContent>

      {/* GRUPPE 2: STAMMDATEN */}
      <TabsContent value="stammdaten">
        <Tabs defaultValue="members">
          <TabsList className="mb-4 rounded-full">
            <TabsTrigger value="members" className="rounded-full"><UsersIcon className="h-4 w-4 mr-1" />Mitglieder</TabsTrigger>
            <TabsTrigger value="assets" className="rounded-full"><Sun className="h-4 w-4 mr-1" />Anlagen</TabsTrigger>
            <TabsTrigger value="tariff" className="rounded-full"><Receipt className="h-4 w-4 mr-1" />Tarif</TabsTrigger>
            <TabsTrigger value="contracts" className="rounded-full"><FileSignature className="h-4 w-4 mr-1" />Verträge</TabsTrigger>
          </TabsList>
          <TabsContent value="members"><MembersTab communityId={communityId} communityName={communityName} /></TabsContent>
          <TabsContent value="assets"><AssetsTab communityId={communityId} /></TabsContent>
          <TabsContent value="tariff"><TariffTab communityId={communityId} /></TabsContent>
          <TabsContent value="contracts"><ContractTemplatesTab communityId={communityId} /></TabsContent>
        </Tabs>
      </TabsContent>

      {/* GRUPPE 3: BETRIEB */}
      <TabsContent value="betrieb">
        <Tabs defaultValue="import">
          <TabsList className="mb-4 rounded-full">
            <TabsTrigger value="import" className="rounded-full"><Upload className="h-4 w-4 mr-1" />Daten-Import</TabsTrigger>
            <TabsTrigger value="quality" className="rounded-full"><ShieldCheck className="h-4 w-4 mr-1" />Datenqualität</TabsTrigger>
            <TabsTrigger value="billing" className="rounded-full"><Calculator className="h-4 w-4 mr-1" />Abrechnung</TabsTrigger>
          </TabsList>
          <TabsContent value="import"><DataImportTab communityId={communityId} /></TabsContent>
          <TabsContent value="quality"><DataQualityTab communityId={communityId} /></TabsContent>
          <TabsContent value="billing"><BillingTab communityId={communityId} /></TabsContent>
        </Tabs>
      </TabsContent>

      {/* GRUPPE 4: MARKTPLATZ */}
      <TabsContent value="marktplatz"><MarketplaceTab communityId={communityId} /></TabsContent>
    </Tabs>
  );
}

function MembersTab({ communityId, communityName }: { communityId: string; communityName: string }) {
  const { members, createMember, updateMember, deleteMember } = useCommunityMembers(communityId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityMember | null>(null);
  const [signMember, setSignMember] = useState<CommunityMember | null>(null);
  const emptyForm = {
    display_name: "", email: "", role: "member", malo_id: "", melo_id: "", share_kw: 0,
    customer_class: "privat", employees: 0, annual_revenue_eur: 0, annual_balance_eur: 0,
    rest_supplier_name: "", imsys_status: "missing", imsys_requested_at: "",
    metering_type: "zaehlerstandsgang", pre_contract_info_sent_at: "",
  };
  const [form, setForm] = useState(emptyForm);
  const maloErr = maLoError(form.malo_id);
  const meloErr = meLoError(form.melo_id);
  const canSubmit = !!form.display_name.trim() && !maloErr && !meloErr;

  // KMU-Klassifikation live
  const kmu = classifyKmu({
    employees: form.employees,
    annual_revenue_eur: form.annual_revenue_eur,
    annual_balance_eur: form.annual_balance_eur,
  });
  const imsysFrist = imsysDeadline(form.imsys_requested_at);

  useEffect(() => {
    if (editing) {
      setForm({
        display_name: editing.display_name ?? "",
        email: editing.email ?? "",
        role: editing.role ?? "member",
        malo_id: editing.malo_id ?? "",
        melo_id: editing.melo_id ?? "",
        share_kw: Number(editing.share_kw ?? 0),
        customer_class: editing.customer_class ?? "privat",
        employees: Number(editing.employees ?? 0),
        annual_revenue_eur: Number(editing.annual_revenue_eur ?? 0),
        annual_balance_eur: Number(editing.annual_balance_eur ?? 0),
        rest_supplier_name: editing.rest_supplier_name ?? "",
        imsys_status: editing.imsys_status ?? "missing",
        imsys_requested_at: editing.imsys_requested_at ?? "",
        metering_type: editing.metering_type ?? "zaehlerstandsgang",
        pre_contract_info_sent_at: editing.pre_contract_info_sent_at ?? "",
      });
      setOpen(true);
    }
  }, [editing]);

  const handleClose = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setEditing(null);
      setForm(emptyForm);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload = {
      display_name: form.display_name,
      email: form.email || null,
      role: form.role,
      malo_id: form.malo_id || null,
      melo_id: form.melo_id || null,
      share_kw: form.share_kw,
      customer_class: form.customer_class || null,
      employees: form.employees || null,
      annual_revenue_eur: form.annual_revenue_eur || null,
      annual_balance_eur: form.annual_balance_eur || null,
      rest_supplier_name: form.rest_supplier_name || null,
      imsys_status: form.imsys_status || null,
      imsys_requested_at: form.imsys_requested_at || null,
      metering_type: form.metering_type || null,
      pre_contract_info_sent_at: form.pre_contract_info_sent_at || null,
    };
    if (editing) {
      await updateMember.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMember.mutateAsync(payload);
    }
    handleClose(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mitglieder</CardTitle>
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogTrigger asChild><Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-2" />Mitglied</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Mitglied bearbeiten" : "Neues Mitglied"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {/* Stammdaten */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Stammdaten</h4>
                <div><Label>Name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
                <div><Label>E-Mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Rolle</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Mitglied (Verbraucher)</SelectItem>
                      <SelectItem value="producer">Erzeuger</SelectItem>
                      <SelectItem value="prosumer">Prosumer</SelectItem>
                      <SelectItem value="consumer">Reiner Verbraucher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>MaLo-ID (optional)</Label>
                    <Input value={form.malo_id} onChange={(e) => setForm({ ...form, malo_id: e.target.value })} placeholder="11-stellig" />
                    {maloErr && <p className="text-xs text-destructive mt-1">{maloErr}</p>}
                  </div>
                  <div>
                    <Label>MeLo-ID (optional)</Label>
                    <Input value={form.melo_id} onChange={(e) => setForm({ ...form, melo_id: e.target.value })} placeholder="33-stellig, DE…" />
                    {meloErr && <p className="text-xs text-destructive mt-1">{meloErr}</p>}
                  </div>
                </div>
                <div><Label>Anteil (kW)</Label><Input type="number" step="0.1" value={form.share_kw} onChange={(e) => setForm({ ...form, share_kw: Number(e.target.value) })} /></div>
              </div>

              {/* KMU-Einstufung (§42c Abs. 2 EnWG) */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">KMU-Einstufung (§42c Abs. 2)</h4>
                <div><Label>Kundenklasse</Label>
                  <Select value={form.customer_class} onValueChange={(v) => setForm({ ...form, customer_class: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CUSTOMER_CLASS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">Beschäftigte</Label><Input type="number" value={form.employees} onChange={(e) => setForm({ ...form, employees: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Umsatz €/Jahr</Label><Input type="number" value={form.annual_revenue_eur} onChange={(e) => setForm({ ...form, annual_revenue_eur: Number(e.target.value) })} /></div>
                  <div><Label className="text-xs">Bilanzsumme €</Label><Input type="number" value={form.annual_balance_eur} onChange={(e) => setForm({ ...form, annual_balance_eur: Number(e.target.value) })} /></div>
                </div>
                <Alert variant={kmu.eligible ? "default" : "destructive"} className="text-xs">
                  <AlertDescription>
                    <b>Auto-Einstufung:</b> {kmu.label} — {kmu.reason}
                    {!kmu.eligible && " ⚠ Nicht teilnahmeberechtigt."}
                  </AlertDescription>
                </Alert>
              </div>

              {/* Reststromlieferant + iMSys */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Versorgung & Messtechnik</h4>
                <div><Label>Reststromlieferant</Label>
                  <Input value={form.rest_supplier_name} onChange={(e) => setForm({ ...form, rest_supplier_name: e.target.value })} placeholder="z.B. Stadtwerke Musterstadt" />
                  <p className="text-xs text-muted-foreground mt-1">Pflicht: Energy Sharing deckt nur Anteil, Rest läuft über klassischen Lieferanten.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Messtyp</Label>
                    <Select value={form.metering_type} onValueChange={(v) => setForm({ ...form, metering_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(METERING_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>iMSys-Status</Label>
                    <Select value={form.imsys_status} onValueChange={(v) => setForm({ ...form, imsys_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(IMSYS_STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.imsys_status === "requested" && (
                  <div>
                    <Label>iMSys beantragt am</Label>
                    <Input type="date" value={form.imsys_requested_at} onChange={(e) => setForm({ ...form, imsys_requested_at: e.target.value })} />
                    {imsysFrist && (
                      <p className="text-xs text-muted-foreground mt-1">
                        4-Monats-Frist (MsbG §34): endet am <b>{imsysFrist.toLocaleDateString("de-DE")}</b>
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <Label>Vorvertragliche Information versendet am (§42c Abs. 6)</Label>
                  <Input type="date" value={form.pre_contract_info_sent_at} onChange={(e) => setForm({ ...form, pre_contract_info_sent_at: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!canSubmit} onClick={handleSubmit}>{editing ? "Speichern" : "Hinzufügen"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Mitglieder.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Rolle</TableHead><TableHead>Klasse</TableHead>
              <TableHead>iMSys</TableHead><TableHead className="text-right">Anteil (kW)</TableHead>
              <TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link to={`/energy-sharing/members/${m.id}`} className="text-primary hover:underline">
                      {m.display_name}
                    </Link>
                    {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{labelOr(ROLE_LABELS, m.role)}</Badge></TableCell>
                  <TableCell className="text-xs">{labelOr(CUSTOMER_CLASS_LABELS, m.customer_class ?? "privat")}</TableCell>
                  <TableCell><Badge variant={m.imsys_status === "installed" ? "default" : "outline"} className="text-xs">{labelOr(IMSYS_STATUS_LABELS, m.imsys_status ?? "missing")}</Badge></TableCell>
                  <TableCell className="text-right">{Number(m.share_kw).toLocaleString("de-DE", { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell><Badge>{labelOr(STATUS_LABELS, m.status)}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" title="Bearbeiten" onClick={() => setEditing(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={m.status === "active" ? "Vertrag bereits unterzeichnet" : "Vertrag unterzeichnen"}
                      disabled={m.status === "active"}
                      onClick={() => setSignMember(m)}
                    >
                      <PenLine className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Löschen" onClick={async () => {
                      if (await confirmDialog({ title: "Mitglied entfernen", description: `Mitglied "${m.display_name}" wirklich entfernen?` })) deleteMember.mutate(m.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <SignContractDialog
        open={!!signMember}
        onOpenChange={(o) => !o && setSignMember(null)}
        member={signMember}
        communityId={communityId}
        communityName={communityName}
      />
    </Card>
  );
}


function AssetsTab({ communityId }: { communityId: string }) {
  const { assets, createAsset, updateAsset, deleteAsset } = useCommunityAssets(communityId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityAsset | null>(null);
  const emptyForm = {
    asset_type: "pv", capacity_kw: 0, share_model: "gleich",
    building_type: "efh", renewable_confirmed: false, imsys_status: "missing",
  };
  const [form, setForm] = useState(emptyForm);
  const smallPlant = isSmallPlant(form.capacity_kw, form.building_type);

  useEffect(() => {
    if (editing) {
      setForm({
        asset_type: editing.asset_type,
        capacity_kw: Number(editing.capacity_kw),
        share_model: editing.share_model,
        building_type: editing.building_type ?? "efh",
        renewable_confirmed: !!editing.renewable_confirmed,
        imsys_status: editing.imsys_status ?? "missing",
      });
      setOpen(true);
    }
  }, [editing]);

  const handleClose = (o: boolean) => {
    setOpen(o);
    if (!o) { setEditing(null); setForm(emptyForm); }
  };

  const handleSubmit = async () => {
    if (!form.capacity_kw) return;
    if (editing) {
      await updateAsset.mutateAsync({ id: editing.id, ...form });
    } else {
      await createAsset.mutateAsync(form);
    }
    handleClose(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Erzeugungsanlagen & Speicher</CardTitle>
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogTrigger asChild><Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-2" />Anlage</Button></DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Anlage bearbeiten" : "Anlage einbringen"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Typ</Label>
                <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pv">PV-Anlage</SelectItem>
                    <SelectItem value="wind">Wind</SelectItem>
                    <SelectItem value="chp">BHKW</SelectItem>
                    <SelectItem value="storage">Speicher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Leistung (kW)</Label><Input type="number" step="0.1" value={form.capacity_kw} onChange={(e) => setForm({ ...form, capacity_kw: Number(e.target.value) })} /></div>
                <div><Label>Gebäudetyp</Label>
                  <Select value={form.building_type} onValueChange={(v) => setForm({ ...form, building_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(BUILDING_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Verteilmodell</Label>
                <Select value={form.share_model} onValueChange={(v) => setForm({ ...form, share_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gleich">Gleiche Anteile</SelectItem>
                    <SelectItem value="nach_anteil">Nach kW-Anteil</SelectItem>
                    <SelectItem value="dynamisch">Dynamisch (Verbrauch)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>iMSys-Status der Anlage</Label>
                <Select value={form.imsys_status} onValueChange={(v) => setForm({ ...form, imsys_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(IMSYS_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 rounded-md border p-3">
                <input type="checkbox" id="ee" checked={form.renewable_confirmed} onChange={(e) => setForm({ ...form, renewable_confirmed: e.target.checked })} />
                <Label htmlFor="ee" className="text-sm leading-relaxed">
                  Ich bestätige: Anlage erzeugt <b>ausschließlich erneuerbare Energie</b> und wird <b>nicht überwiegend gewerblich</b> betrieben (§42c Abs. 2 Nr. 2 EnWG).
                </Label>
              </div>
              {form.capacity_kw > 0 && (
                <Alert variant={smallPlant.small ? "default" : "destructive"} className="text-xs">
                  <AlertDescription>
                    {smallPlant.small
                      ? <>✓ Kleinanlage (unter {smallPlant.threshold} kW): <b>keine Stromlieferanten-Pflichten</b> nach §42c Abs. 5.</>
                      : <>⚠ Anlage ab {smallPlant.threshold} kW: <b>Stromlieferanten-Status</b> für Eigner erforderlich.</>}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button disabled={!form.renewable_confirmed} onClick={handleSubmit}>{editing ? "Speichern" : "Hinzufügen"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Anlagen eingebracht.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Typ</TableHead><TableHead>Gebäude</TableHead>
              <TableHead className="text-right">Leistung (kW)</TableHead>
              <TableHead>Verteilmodell</TableHead><TableHead>iMSys</TableHead>
              <TableHead>EE</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assets.map((a) => {
                const sp = isSmallPlant(Number(a.capacity_kw), a.building_type);
                return (
                  <TableRow key={a.id}>
                    <TableCell><Badge variant="secondary">{labelOr(ASSET_TYPE_LABELS, a.asset_type)}</Badge></TableCell>
                    <TableCell className="text-xs">{labelOr(BUILDING_TYPE_LABELS, a.building_type ?? "efh")}</TableCell>
                    <TableCell className="text-right">
                      {Number(a.capacity_kw).toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                      {!sp.small && <Badge variant="destructive" className="ml-2 text-[10px]">≥ {sp.threshold} kW</Badge>}
                    </TableCell>
                    <TableCell>{labelOr(SHARE_MODEL_LABELS, a.share_model)}</TableCell>
                    <TableCell><Badge variant={a.imsys_status === "installed" ? "default" : "outline"} className="text-xs">{labelOr(IMSYS_STATUS_LABELS, a.imsys_status ?? "missing")}</Badge></TableCell>
                    <TableCell>{a.renewable_confirmed ? "✓" : <span className="text-destructive">✗</span>}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" title="Bearbeiten" onClick={() => setEditing(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Löschen" onClick={async () => {
                        if (await confirmDialog({ title: "Anlage entfernen", description: "Anlage wirklich entfernen?" })) deleteAsset.mutate(a.id);
                      }}><Trash2 className="h-4 w-4" /></Button>
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


function TariffTab({ communityId }: { communityId: string }) {
  const { tariffs, createTariff, updateTariff, deleteTariff } = useCommunityTariffs(communityId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityTariff | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const emptyForm = { valid_from: today, valid_to: "", price_ct_kwh: 0, feed_in_ct_kwh: 0 };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (editing) {
      setForm({
        valid_from: editing.valid_from,
        valid_to: editing.valid_to ?? "",
        price_ct_kwh: Number(editing.price_ct_kwh),
        feed_in_ct_kwh: Number(editing.feed_in_ct_kwh),
      });
      setOpen(true);
    }
  }, [editing]);

  const handleClose = (o: boolean) => {
    setOpen(o);
    if (!o) { setEditing(null); setForm(emptyForm); }
  };

  const handleSubmit = async () => {
    const payload = {
      valid_from: form.valid_from,
      valid_to: form.valid_to || null,
      price_ct_kwh: form.price_ct_kwh,
      feed_in_ct_kwh: form.feed_in_ct_kwh,
    };
    if (editing) {
      await updateTariff.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createTariff.mutateAsync(payload);
    }
    handleClose(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Gemeinschaftstarif</CardTitle>
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogTrigger asChild><Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-2" />Tarif</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Tarif bearbeiten" : "Neuer Tarif"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Gültig ab</Label><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
              <div><Label>Gültig bis (optional)</Label><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></div>
              <div><Label>Preis (ct/kWh)</Label><Input type="number" step="0.01" value={form.price_ct_kwh} onChange={(e) => setForm({ ...form, price_ct_kwh: Number(e.target.value) })} /></div>
              <div><Label>Einspeisevergütung (ct/kWh)</Label><Input type="number" step="0.01" value={form.feed_in_ct_kwh} onChange={(e) => setForm({ ...form, feed_in_ct_kwh: Number(e.target.value) })} /></div>
              <Alert className="text-xs">
                <AlertDescription>
                  <b>Hinweis (BDEW):</b> Energy-Sharing-Mengen sind <b>nicht</b> von Netzentgelten, Umlagen oder Steuern befreit.
                  Der Letztverbraucher trägt alle Zusatzkosten — der hier gepflegte Preis ist der reine Gemeinschaftspreis ohne Netzaufschläge.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmit}>{editing ? "Speichern" : "Hinzufügen"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {tariffs.length === 0 ? (
          <p className="text-muted-foreground">Noch kein Tarif hinterlegt.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Gültig ab</TableHead><TableHead>Gültig bis</TableHead>
              <TableHead className="text-right">Preis (ct/kWh)</TableHead>
              <TableHead className="text-right">Einspeisung (ct/kWh)</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {tariffs.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.valid_from}</TableCell>
                  <TableCell>{t.valid_to ?? "—"}</TableCell>
                  <TableCell className="text-right">{Number(t.price_ct_kwh).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">{Number(t.feed_in_ct_kwh).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" title="Bearbeiten" onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Löschen" onClick={async () => {
                      if (await confirmDialog({ title: "Tarif löschen", description: "Tarif wirklich löschen?" })) deleteTariff.mutate(t.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
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

function CommunityEditDialog({
  community,
  onOpenChange,
  onSave,
  onDelete,
}: {
  community: EnergyCommunity | null;
  onOpenChange: (o: boolean) => void;
  onSave: (values: Partial<EnergyCommunity>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [balancingZone, setBalancingZone] = useState("");
  const [gridOperator, setGridOperator] = useState("");
  const [pilotAck, setPilotAck] = useState(false);

  useEffect(() => {
    if (community) {
      setName(community.name);
      setStatus(community.status);
      setBalancingZone(community.balancing_zone ?? "");
      setGridOperator(community.grid_operator ?? "");
      setPilotAck(!!community.pilot_acknowledged_at);
    }
  }, [community]);

  const handleSave = () => {
    onSave({
      name,
      status,
      balancing_zone: balancingZone || null,
      grid_operator: gridOperator || null,
      pilot_acknowledged_at: pilotAck ? (community?.pilot_acknowledged_at ?? new Date().toISOString()) : null,
    });
  };

  return (
    <Dialog open={!!community} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Community bearbeiten</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Entwurf</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="paused">Pausiert</SelectItem>
                <SelectItem value="closed">Geschlossen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bilanzkreis (Pflicht ab Mai 2028 nur 1 Zone)</Label>
              <Input value={balancingZone} onChange={(e) => setBalancingZone(e.target.value)} placeholder="z.B. TenneT-Nord" />
            </div>
            <div>
              <Label>Verteilnetzbetreiber (VNB)</Label>
              <Input value={gridOperator} onChange={(e) => setGridOperator(e.target.value)} placeholder="z.B. Westnetz GmbH" />
            </div>
          </div>
          <Alert className="text-xs">
            <AlertDescription>
              Bis zum 31. Mai 2028 müssen sich alle Mitglieder im <b>gleichen Bilanzkreis</b> befinden (§42c Abs. 3 EnWG).
            </AlertDescription>
          </Alert>
          <div className="flex items-start gap-2 rounded-md border p-3">
            <input type="checkbox" id="pilot" className="mt-1" checked={pilotAck} onChange={(e) => setPilotAck(e.target.checked)} />
            <Label htmlFor="pilot" className="text-sm leading-relaxed">
              <b>Pilot-Modus bestätigt:</b> Energy Sharing nach §42c/§20b EnWG ist noch im regulatorischen Aufbau (BDEW Q3-Q4 2026).
              Mir ist bekannt, dass <b>keine Befreiung</b> von Netzentgelten, Umlagen oder Steuern besteht.
              {community?.pilot_acknowledged_at && (
                <span className="block text-xs text-muted-foreground mt-1">
                  Bestätigt am: {new Date(community.pilot_acknowledged_at).toLocaleDateString("de-DE")}
                </span>
              )}
            </Label>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" />Community löschen
          </Button>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button disabled={!name.trim()} onClick={handleSave}>Speichern</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


