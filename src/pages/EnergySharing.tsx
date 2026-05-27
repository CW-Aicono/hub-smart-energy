import { useState } from "react";
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
import { Plus, Trash2, Users as UsersIcon, Sun, Receipt, FileSignature, PenLine, BarChart3 } from "lucide-react";
import {
  useEnergyCommunities,
  useCommunityMembers,
  useCommunityAssets,
  useCommunityTariffs,
  type CommunityMember,
} from "@/hooks/useEnergyCommunities";
import CommunityWizard from "@/components/energy-sharing/CommunityWizard";
import ContractTemplatesTab from "@/components/energy-sharing/ContractTemplatesTab";
import SignContractDialog from "@/components/energy-sharing/SignContractDialog";
import CommunityDashboardTab from "@/components/energy-sharing/CommunityDashboardTab";
import { maLoError, meLoError } from "@/lib/energy-sharing/idValidation";

export default function EnergySharing() {
  const { communities, isLoading, deleteCommunity } = useEnergyCommunities();
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
                <Button
                  key={c.id}
                  variant={activeId === c.id ? "default" : "outline"}
                  onClick={() => setSelectedId(c.id)}
                  className="rounded-full"
                >
                  {c.name}
                  <Badge variant="secondary" className="ml-2">{c.status}</Badge>
                </Button>
              ))}
            </div>

            {selected && (
              <CommunityDetail
                communityId={selected.id}
                communityName={selected.name}
                onDelete={async () => {
                  if (confirm(`Community "${selected.name}" wirklich löschen?`)) {
                    await deleteCommunity.mutateAsync(selected.id);
                    setSelectedId(null);
                  }
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CommunityDetail({ communityId, communityName, onDelete }: { communityId: string; communityName: string; onDelete: () => void }) {
  const { members } = useCommunityMembers(communityId);
  const { assets } = useCommunityAssets(communityId);
  const { tariffs } = useCommunityTariffs(communityId);

  return (
    <Tabs defaultValue="dashboard">
      <TabsList className="flex-wrap">
        <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
        <TabsTrigger value="overview">Übersicht</TabsTrigger>
        <TabsTrigger value="members"><UsersIcon className="h-4 w-4 mr-1" />Mitglieder</TabsTrigger>
        <TabsTrigger value="assets"><Sun className="h-4 w-4 mr-1" />Anlagen</TabsTrigger>
        <TabsTrigger value="tariff"><Receipt className="h-4 w-4 mr-1" />Tarif</TabsTrigger>
        <TabsTrigger value="contracts"><FileSignature className="h-4 w-4 mr-1" />Verträge</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard"><CommunityDashboardTab communityId={communityId} /></TabsContent>

      <TabsContent value="overview">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardDescription>Mitglieder</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{members.length.toLocaleString("de-DE")}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Anlagen</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{assets.length.toLocaleString("de-DE")}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Installierte Leistung</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">
              {assets.reduce((s, a) => s + Number(a.capacity_kw || 0), 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kW
            </div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Aktive Tarife</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{tariffs.length.toLocaleString("de-DE")}</div></CardContent></Card>
        </div>
        <div className="mt-6">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" />Community „{communityName}" löschen
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="members"><MembersTab communityId={communityId} communityName={communityName} /></TabsContent>
      <TabsContent value="assets"><AssetsTab communityId={communityId} /></TabsContent>
      <TabsContent value="tariff"><TariffTab communityId={communityId} /></TabsContent>
      <TabsContent value="contracts"><ContractTemplatesTab communityId={communityId} /></TabsContent>
    </Tabs>
  );
}

function MembersTab({ communityId, communityName }: { communityId: string; communityName: string }) {
  const { members, createMember, deleteMember } = useCommunityMembers(communityId);
  const [open, setOpen] = useState(false);
  const [signMember, setSignMember] = useState<CommunityMember | null>(null);
  const [form, setForm] = useState({ display_name: "", email: "", role: "member", malo_id: "", melo_id: "", share_kw: 0 });
  const maloErr = maLoError(form.malo_id);
  const meloErr = meLoError(form.melo_id);
  const canSubmit = !!form.display_name.trim() && !maloErr && !meloErr;


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mitglieder</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Mitglied</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neues Mitglied</DialogTitle></DialogHeader>
            <div className="space-y-3">
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
              <div>
                <Label>MaLo-ID (optional)</Label>
                <Input value={form.malo_id} onChange={(e) => setForm({ ...form, malo_id: e.target.value })} placeholder="11-stellig" />
                {maloErr && <p className="text-xs text-destructive mt-1">{maloErr}</p>}
              </div>
              <div>
                <Label>MeLo-ID (optional)</Label>
                <Input value={form.melo_id} onChange={(e) => setForm({ ...form, melo_id: e.target.value })} placeholder="33-stellig, beginnt mit DE" />
                {meloErr && <p className="text-xs text-destructive mt-1">{meloErr}</p>}
              </div>
              <div><Label>Anteil (kW)</Label><Input type="number" step="0.1" value={form.share_kw} onChange={(e) => setForm({ ...form, share_kw: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter>
              <Button disabled={!canSubmit} onClick={async () => {
                if (!canSubmit) return;
                await createMember.mutateAsync(form);
                setForm({ display_name: "", email: "", role: "member", malo_id: "", melo_id: "", share_kw: 0 });
                setOpen(false);
              }}>Hinzufügen</Button>
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
              <TableHead>Name</TableHead><TableHead>E-Mail</TableHead><TableHead>Rolle</TableHead>
              <TableHead>MaLo</TableHead><TableHead className="text-right">Anteil (kW)</TableHead>
              <TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link to={`/energy-sharing/members/${m.id}`} className="text-primary hover:underline">
                      {m.display_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell><Badge variant="secondary">{m.role}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{m.malo_id ?? "—"}</TableCell>
                  <TableCell className="text-right">{Number(m.share_kw).toLocaleString("de-DE", { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell><Badge>{m.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title={m.status === "active" ? "Vertrag bereits unterzeichnet" : "Vertrag unterzeichnen"}
                      disabled={m.status === "active"}
                      onClick={() => setSignMember(m)}
                    >
                      <PenLine className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMember.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
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
  const { assets, createAsset, deleteAsset } = useCommunityAssets(communityId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ asset_type: "pv", capacity_kw: 0, share_model: "gleich" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Erzeugungsanlagen & Speicher</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Anlage</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Anlage einbringen</DialogTitle></DialogHeader>
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
              <div><Label>Leistung (kW)</Label><Input type="number" step="0.1" value={form.capacity_kw} onChange={(e) => setForm({ ...form, capacity_kw: Number(e.target.value) })} /></div>
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
            </div>
            <DialogFooter>
              <Button onClick={async () => {
                if (!form.capacity_kw) return;
                await createAsset.mutateAsync(form);
                setForm({ asset_type: "pv", capacity_kw: 0, share_model: "gleich" });
                setOpen(false);
              }}>Hinzufügen</Button>
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
              <TableHead>Typ</TableHead><TableHead className="text-right">Leistung (kW)</TableHead>
              <TableHead>Verteilmodell</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant="secondary">{a.asset_type}</Badge></TableCell>
                  <TableCell className="text-right">{Number(a.capacity_kw).toLocaleString("de-DE", { maximumFractionDigits: 1 })}</TableCell>
                  <TableCell>{a.share_model}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => deleteAsset.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TariffTab({ communityId }: { communityId: string }) {
  const { tariffs, createTariff, deleteTariff } = useCommunityTariffs(communityId);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ valid_from: today, valid_to: "", price_ct_kwh: 0, feed_in_ct_kwh: 0 });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Gemeinschaftstarif</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Tarif</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neuer Tarif</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Gültig ab</Label><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
              <div><Label>Gültig bis (optional)</Label><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></div>
              <div><Label>Preis (ct/kWh)</Label><Input type="number" step="0.01" value={form.price_ct_kwh} onChange={(e) => setForm({ ...form, price_ct_kwh: Number(e.target.value) })} /></div>
              <div><Label>Einspeisevergütung (ct/kWh)</Label><Input type="number" step="0.01" value={form.feed_in_ct_kwh} onChange={(e) => setForm({ ...form, feed_in_ct_kwh: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={async () => {
                await createTariff.mutateAsync({
                  valid_from: form.valid_from,
                  valid_to: form.valid_to || null,
                  price_ct_kwh: form.price_ct_kwh,
                  feed_in_ct_kwh: form.feed_in_ct_kwh,
                });
                setOpen(false);
              }}>Speichern</Button>
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
                  <TableCell><Button variant="ghost" size="sm" onClick={() => deleteTariff.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
