import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePpaContract, useUpdatePpaStatus, useDeletePpaContract } from "@/hooks/usePpaContracts";
import { usePpaDocuments, useUploadPpaDocument, useDownloadPpaDocument, useDeletePpaDocument } from "@/hooks/usePpaDocuments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, FileSignature, Trash2, Upload } from "lucide-react";
import { priceModelLabel } from "@/lib/ppa/priceFormula";
import { useMeters } from "@/hooks/useMeters";
import { toast } from "sonner";
import type { PpaDocument, PpaStatus } from "@/lib/ppa/types";

const statusBadge: Record<PpaStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  active: { label: "Aktiv", variant: "default" },
  suspended: { label: "Ausgesetzt", variant: "outline" },
  expired: { label: "Abgelaufen", variant: "destructive" },
  terminated: { label: "Beendet", variant: "destructive" },
};

const ALLOWED_TRANSITIONS: Record<PpaStatus, PpaStatus[]> = {
  draft: ["active", "terminated"],
  active: ["suspended", "expired", "terminated"],
  suspended: ["active", "terminated"],
  expired: [],
  terminated: [],
};

const STATUS_LABELS: Record<PpaStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  suspended: "Ausgesetzt",
  expired: "Abgelaufen",
  terminated: "Beendet",
};

export default function PPADetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = usePpaContract(id);
  const documentsQ = usePpaDocuments(id);
  const updateStatus = useUpdatePpaStatus();
  const deleteContract = useDeletePpaContract();
  const uploadDoc = useUploadPpaDocument();
  const downloadDoc = useDownloadPpaDocument();
  const deleteDoc = useDeletePpaDocument();
  const [statusDialog, setStatusDialog] = useState<PpaStatus | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const onsiteMeters = useMeters(data?.onsite?.building_id || undefined);
  const consumerMeters = useMemo(() => {
    if (!data?.consumptionMeterIds) return [];
    return onsiteMeters.meters.filter((m) => data.consumptionMeterIds.includes(m.id));
  }, [data, onsiteMeters.meters]);

  if (isLoading) return <div className="container py-6">Lade…</div>;
  if (!data?.contract) return <div className="container py-6">Vertrag nicht gefunden.</div>;

  const c = data.contract;
  const status = c.status;
  const s = statusBadge[status];
  const allowedNext = ALLOWED_TRANSITIONS[status];

  async function handleStatusChange(next: PpaStatus) {
    try {
      await updateStatus.mutateAsync({ id: id!, status: next });
      toast.success(`Status: ${STATUS_LABELS[next]}`);
      setStatusDialog(null);
    } catch (e: any) {
      toast.error(e.message ?? "Statuswechsel fehlgeschlagen");
    }
  }

  async function handleDelete() {
    if (!confirm("Vertrag wirklich löschen? Dies kann nicht rückgängig gemacht werden.")) return;
    try {
      await deleteContract.mutateAsync(id!);
      toast.success("Vertrag gelöscht");
      navigate("/ppa");
    } catch (e: any) {
      toast.error(e.message ?? "Löschen fehlgeschlagen");
    }
  }

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/ppa"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <FileSignature className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{c.producer_name} → {c.offtaker_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={s.variant}>{s.label}</Badge>
              <span className="text-sm text-muted-foreground">{c.ppa_type === "onsite" ? "On-site" : "Off-site"} PPA</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {allowedNext.length > 0 && (
            <Select value="" onValueChange={(v) => setStatusDialog(v as PpaStatus)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status ändern" /></SelectTrigger>
              <SelectContent>
                {allowedNext.map((n) => <SelectItem key={n} value={n}>{STATUS_LABELS[n]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {status === "draft" && (
            <Button variant="outline" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Löschen
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="config">Konfiguration</TabsTrigger>
          {c.ppa_type === "onsite" && <TabsTrigger value="meters">Verbrauchszähler</TabsTrigger>}
          <TabsTrigger value="documents">Dokumente</TabsTrigger>
          <TabsTrigger value="history">Historie</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Kpi label="Vertragsvolumen" value={c.contracted_volume_kwh_pa ? `${c.contracted_volume_kwh_pa.toLocaleString("de-DE")} kWh/a` : "—"} />
            <Kpi label="Preismodell" value={priceModelLabel(c.price_model)} />
            <Kpi label="Restlaufzeit" value={`${Math.max(0, Math.ceil((new Date(c.contract_end).getTime() - Date.now()) / 86400000)).toLocaleString("de-DE")} Tage`} />
          </div>
          <Card>
            <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <Row label="Erzeuger" v={c.producer_name} />
              <Row label="Abnehmer" v={c.offtaker_name} />
              <Row label="Marktpartner-ID Erzeuger" v={c.producer_market_id || "—"} />
              <Row label="Marktpartner-ID Abnehmer" v={c.offtaker_market_id || "—"} />
              <Row label="Vertragsbeginn" v={new Date(c.contract_start).toLocaleDateString("de-DE")} />
              <Row label="Vertragsende" v={new Date(c.contract_end).toLocaleDateString("de-DE")} />
              <Row label="Kündigungsfrist" v={`${c.notice_period_days.toLocaleString("de-DE")} Tage`} />
              <Row label="Auto-Verlängerung" v={c.auto_renewal ? "Ja" : "Nein"} />
              <Row label="Energiequelle" v={c.energy_source} />
              <Row label="GoO" v={c.goo_required ? (c.goo_registry || "Ja") : "Nein"} />
              <Row label="Vertragsnummer" v={c.reference_number || "—"} />
              {c.mieterstrom_settings_id && <Row label="Mieterstrom" v={<Link to="/tenant-electricity" className="text-primary underline">Verknüpft →</Link>} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Preisformel</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><strong>Modell:</strong> {priceModelLabel(c.price_model)}</div>
              {c.price_model === "fixed" && c.price_eur_per_kwh != null && (
                <div><strong>Festpreis:</strong> {(c.price_eur_per_kwh * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct/kWh</div>
              )}
              {c.price_model === "spot_plus_premium" && c.price_formula && (
                <div><strong>EPEX-Spot + Premium:</strong> {(Number(c.price_formula.premium) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct/kWh</div>
              )}
              {c.price_model === "floor_cap" && c.price_formula && (
                <div><strong>Floor / Cap:</strong> {(Number(c.price_formula.floor) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct / {(Number(c.price_formula.cap) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct</div>
              )}
              {c.price_model === "index_linked" && c.price_formula && (
                <div><strong>Spot × {Number(c.price_formula.factor).toLocaleString("de-DE")} + {(Number(c.price_formula.offset) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct</strong></div>
              )}
            </CardContent>
          </Card>
          {c.notes && (
            <Card>
              <CardHeader><CardTitle>Notizen</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{c.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          {c.ppa_type === "onsite" && data.onsite && (
            <Card>
              <CardHeader><CardTitle>On-site Konfiguration</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm md:grid-cols-2">
                <Row label="Gebäude-ID" v={data.onsite.building_id || "—"} />
                <Row label="Liefermodell" v={data.onsite.supply_model} />
                <Row label="Erzeugungs-Zähler" v={data.onsite.generation_meter_id || "—"} />
                <Row label="Eigenverbrauchsziel" v={data.onsite.self_consumption_target_pct != null ? `${data.onsite.self_consumption_target_pct.toLocaleString("de-DE")} %` : "—"} />
                <Row label="Überschuss-Behandlung" v={data.onsite.surplus_handling} />
              </CardContent>
            </Card>
          )}
          {c.ppa_type === "offsite" && data.offsite && (
            <Card>
              <CardHeader><CardTitle>Off-site Konfiguration</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm md:grid-cols-2">
                <Row label="Anlagenstandort" v={data.offsite.plant_location || "—"} />
                <Row label="Regelzone" v={data.offsite.plant_tso_area || "—"} />
                <Row label="Spannungsebene" v={data.offsite.plant_grid_level || "—"} />
                <Row label="Lieferart" v={data.offsite.delivery_type} />
                <Row label="BKV" v={data.offsite.balancing_responsible_party || "—"} />
                <Row label="Bilanzkreis-ID" v={data.offsite.balancing_group_id || "—"} />
                <Row label="Zwischenhändler" v={data.offsite.intermediary_name || "—"} />
                <Row label="Imbalance" v={data.offsite.imbalance_responsibility} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {c.ppa_type === "onsite" && (
          <TabsContent value="meters" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Verbrauchszähler ({consumerMeters.length.toLocaleString("de-DE")})</CardTitle></CardHeader>
              <CardContent>
                {consumerMeters.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Keine Verbrauchszähler verknüpft.</p>
                ) : (
                  <ul className="divide-y">
                    {consumerMeters.map((m) => (
                      <li key={m.id} className="py-2 text-sm flex justify-between">
                        <span>{m.name}</span>
                        <span className="text-muted-foreground">{m.meter_number || m.id.slice(0, 8)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="documents" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4 mr-1" /> Dokument hochladen</Button>
          </div>
          {documentsQ.isLoading ? (
            <p className="text-muted-foreground">Lade…</p>
          ) : (documentsQ.data ?? []).length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Dokumente vorhanden.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(documentsQ.data ?? []).map((d) => (
                <Card key={d.id}>
                  <CardContent className="py-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{d.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.doc_type} · {d.file_size_bytes ? `${(d.file_size_bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB` : "—"} ·
                        SHA-256: <code className="font-mono">{d.file_hash?.slice(0, 12)}…</code>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => downloadDoc.mutate(d)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (!confirm(`Dokument "${d.filename}" löschen?`)) return;
                        try { await deleteDoc.mutateAsync(d); toast.success("Dokument gelöscht"); }
                        catch (e: any) { toast.error(e.message ?? "Löschen fehlgeschlagen"); }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Status-Historie</CardTitle></CardHeader>
            <CardContent>
              {data.history.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Einträge.</p>
              ) : (
                <ul className="divide-y">
                  {data.history.map((h) => (
                    <li key={h.id} className="py-2 text-sm flex justify-between">
                      <span>
                        {h.old_status ? <><Badge variant="outline">{STATUS_LABELS[h.old_status as PpaStatus] ?? h.old_status}</Badge> → </> : null}
                        <Badge>{STATUS_LABELS[h.new_status as PpaStatus] ?? h.new_status}</Badge>
                        {h.reason && <span className="text-muted-foreground ml-2">{h.reason}</span>}
                      </span>
                      <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString("de-DE")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!statusDialog} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Status auf „{statusDialog && STATUS_LABELS[statusDialog]}“ setzen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Der Wechsel wird in der Historie protokolliert.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Abbrechen</Button>
            <Button onClick={() => statusDialog && handleStatusChange(statusDialog)}>Bestätigen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={async (file, docType) => {
          try {
            await uploadDoc.mutateAsync({ contractId: id!, file, docType });
            toast.success("Dokument hochgeladen");
            setUploadOpen(false);
          } catch (e: any) {
            toast.error(e.message ?? "Upload fehlgeschlagen");
          }
        }}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </CardContent></Card>
  );
}

function Row({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

function UploadDialog({ open, onClose, onUpload }: { open: boolean; onClose: () => void; onUpload: (file: File, docType: PpaDocument["doc_type"]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<PpaDocument["doc_type"]>("contract");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dokument hochladen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Typ</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as PpaDocument["doc_type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Vertrag</SelectItem>
                <SelectItem value="amendment">Nachtrag</SelectItem>
                <SelectItem value="goo_certificate">Herkunftsnachweis</SelectItem>
                <SelectItem value="invoice">Rechnung</SelectItem>
                <SelectItem value="meter_report">Zählerbericht</SelectItem>
                <SelectItem value="termination">Kündigung</SelectItem>
                <SelectItem value="other">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Datei</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button disabled={!file} onClick={() => file && onUpload(file, docType)}>Hochladen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
