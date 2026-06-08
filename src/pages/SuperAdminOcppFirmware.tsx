import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, Trash2, ShieldCheck, ShieldAlert, Send, RefreshCw, FileText } from "lucide-react";

type Artifact = {
  id: string;
  vendor: string;
  model: string;
  version: string;
  storage_path: string;
  file_size: number | null;
  sha256: string | null;
  file_format: string;
  is_eichrecht_certified: boolean;
  eichrecht_approval_ref: string | null;
  release_notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

type ChargePointRow = {
  id: string;
  name: string | null;
  vendor: string | null;
  model: string | null;
  firmware_version: string | null;
  ws_connected: boolean | null;
  tenant_id: string | null;
  tenants?: { name: string | null } | null;
};

const FORMATS = ["bin", "zip", "fwu", "tar", "other"] as const;

function fmtSize(n: number | null | undefined) {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB`;
  return `${(n / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 2 })} MB`;
}

function ts(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd.MM.yyyy HH:mm", { locale: de }); } catch { return s; }
}

function nextNight0200Local() {
  const d = new Date();
  d.setHours(2, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
}

export default function SuperAdminOcppFirmware() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("catalog");
  const [filter, setFilter] = useState("");

  // ------- Catalog -------
  const { data: artifacts, isLoading: loadingArtifacts } = useQuery({
    queryKey: ["sa-firmware-artifacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cp_firmware_artifacts")
        .select("*")
        .order("vendor", { ascending: true })
        .order("model", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Artifact[];
    },
  });

  const filteredArtifacts = useMemo(() => {
    if (!artifacts) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return artifacts;
    return artifacts.filter((a) =>
      `${a.vendor} ${a.model} ${a.version}`.toLowerCase().includes(f),
    );
  }, [artifacts, filter]);

  const handleDelete = async (a: Artifact) => {
    if (!confirm(`Firmware "${a.vendor} ${a.model} v${a.version}" wirklich löschen? Datei wird endgültig entfernt.`)) return;
    try {
      const { error: rmErr } = await supabase.storage.from("cp-firmware").remove([a.storage_path]);
      if (rmErr) console.warn("[firmware] storage remove failed:", rmErr.message);
      const { error } = await supabase.from("cp_firmware_artifacts").delete().eq("id", a.id);
      if (error) throw error;
      toast({ title: "Firmware gelöscht" });
      qc.invalidateQueries({ queryKey: ["sa-firmware-artifacts"] });
    } catch (e) {
      toast({ title: "Löschen fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    }
  };

  // ------- Upload -------
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uVendor, setUVendor] = useState("");
  const [uModel, setUModel] = useState("");
  const [uVersion, setUVersion] = useState("");
  const [uFormat, setUFormat] = useState<typeof FORMATS[number]>("bin");
  const [uFile, setUFile] = useState<File | null>(null);
  const [uNotes, setUNotes] = useState("");
  const [uEichrecht, setUEichrecht] = useState(false);
  const [uEichrechtRef, setUEichrechtRef] = useState("");
  const [uploading, setUploading] = useState(false);

  const resetUpload = () => {
    setUVendor(""); setUModel(""); setUVersion(""); setUFormat("bin");
    setUFile(null); setUNotes(""); setUEichrecht(false); setUEichrechtRef("");
  };

  // Vorschläge aus charge_points
  const { data: vendorModels } = useQuery({
    queryKey: ["sa-firmware-vendormodels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("vendor, model")
        .not("vendor", "is", null)
        .limit(2000);
      if (error) throw error;
      const set = new Set<string>();
      const vendors = new Set<string>();
      const models = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.vendor) vendors.add(r.vendor);
        if (r.model) models.add(r.model);
        if (r.vendor && r.model) set.add(`${r.vendor}|${r.model}`);
      });
      return { vendors: Array.from(vendors), models: Array.from(models) };
    },
  });

  const handleUpload = async () => {
    if (!uVendor.trim() || !uModel.trim() || !uVersion.trim() || !uFile) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    if (uFile.size > 100 * 1024 * 1024) {
      toast({ title: "Datei zu groß (max. 100 MB)", variant: "destructive" });
      return;
    }
    if (uEichrecht && !uEichrechtRef.trim()) {
      toast({ title: "Eichrecht-Referenz erforderlich", variant: "destructive" });
      return;
    }
    setUploading(true);
    const path = `${slug(uVendor)}/${slug(uModel)}/${slug(uVersion)}-${Date.now()}.${uFormat === "other" ? "bin" : uFormat}`;
    try {
      const sha = await sha256Hex(uFile);
      const { error: upErr } = await supabase.storage
        .from("cp-firmware")
        .upload(path, uFile, { contentType: "application/octet-stream", upsert: false });
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("cp_firmware_artifacts").insert({
        vendor: uVendor.trim(),
        model: uModel.trim(),
        version: uVersion.trim(),
        storage_path: path,
        file_size: uFile.size,
        sha256: sha,
        file_format: uFormat,
        is_eichrecht_certified: uEichrecht,
        eichrecht_approval_ref: uEichrecht ? uEichrechtRef.trim() : null,
        release_notes: uNotes.trim() || null,
        uploaded_by: user?.id ?? null,
      });
      if (insErr) {
        // Rollback Storage
        await supabase.storage.from("cp-firmware").remove([path]);
        throw insErr;
      }
      toast({ title: "Firmware hochgeladen" });
      setUploadOpen(false);
      resetUpload();
      qc.invalidateQueries({ queryKey: ["sa-firmware-artifacts"] });
      setTab("catalog");
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // ------- Rollout -------
  const [rolloutArtifactId, setRolloutArtifactId] = useState<string>("");
  const [rolloutRetrieve, setRolloutRetrieve] = useState<string>(nextNight0200Local());
  const [rolloutEichrechtAck, setRolloutEichrechtAck] = useState(false);
  const [selectedCps, setSelectedCps] = useState<Set<string>>(new Set());
  const [rolloutBusy, setRolloutBusy] = useState(false);
  const [rolloutResults, setRolloutResults] = useState<{ id: string; name: string; ok: boolean; error?: string }[] | null>(null);

  const rolloutArtifact = useMemo(
    () => artifacts?.find((a) => a.id === rolloutArtifactId) ?? null,
    [artifacts, rolloutArtifactId],
  );

  const { data: matchingCps, isLoading: loadingCps } = useQuery({
    queryKey: ["sa-firmware-cps", rolloutArtifact?.vendor, rolloutArtifact?.model],
    queryFn: async () => {
      if (!rolloutArtifact) return [] as ChargePointRow[];
      const { data, error } = await supabase
        .from("charge_points")
        .select("id, name, vendor, model, firmware_version, ws_connected, tenant_id, tenants(name)")
        .ilike("vendor", rolloutArtifact.vendor)
        .ilike("model", rolloutArtifact.model)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ChargePointRow[];
    },
    enabled: !!rolloutArtifact,
  });

  useEffect(() => {
    setSelectedCps(new Set());
    setRolloutResults(null);
  }, [rolloutArtifactId]);

  const toggleCp = (id: string) => {
    setSelectedCps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedCps(new Set((matchingCps ?? []).map((c) => c.id)));
  const selectOnline = () => setSelectedCps(new Set((matchingCps ?? []).filter((c) => c.ws_connected).map((c) => c.id)));
  const clearAll = () => setSelectedCps(new Set());

  const handleRollout = async () => {
    if (!rolloutArtifact || selectedCps.size === 0) return;
    if (rolloutArtifact.is_eichrecht_certified && !rolloutEichrechtAck) {
      toast({ title: "Eichrecht-Bestätigung erforderlich", variant: "destructive" });
      return;
    }
    setRolloutBusy(true);
    setRolloutResults(null);
    const retrieveIso = new Date(rolloutRetrieve).toISOString();
    const targets = (matchingCps ?? []).filter((c) => selectedCps.has(c.id));

    const results = await Promise.all(targets.map(async (cp) => {
      try {
        const { data, error } = await supabase.functions.invoke("ocpp-firmware-control", {
          body: {
            action: "enqueue_job",
            charge_point_id: cp.id,
            artifact_id: rolloutArtifact.id,
            retrieve_date: retrieveIso,
            retries: 3,
            retry_interval: 300,
          },
        });
        if (error) throw error;
        if (data && (data as any).ok === false) throw new Error((data as any).error ?? "Unbekannter Fehler");
        return { id: cp.id, name: cp.name ?? cp.id, ok: true };
      } catch (e) {
        return { id: cp.id, name: cp.name ?? cp.id, ok: false, error: (e as Error).message };
      }
    }));
    setRolloutResults(results);
    setRolloutBusy(false);
    const okCount = results.filter((r) => r.ok).length;
    toast({
      title: `Rollout abgeschlossen: ${okCount}/${results.length} erfolgreich`,
      variant: okCount === results.length ? "default" : "destructive",
    });
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">OCPP Firmware-Katalog</h1>
          <p className="text-sm text-muted-foreground">
            Zentrale Pflege und Ausrollen von Wallbox-Firmware (OCPP 1.6 UpdateFirmware).
          </p>
        </div>
        <Button variant="outline" onClick={() => qc.invalidateQueries()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Aktualisieren
        </Button>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Eichrecht-Hinweis (§ 40 MessEV)</AlertTitle>
        <AlertDescription className="text-xs">
          Firmware-Updates an eichrechtkonformen Ladepunkten sind genehmigungspflichtig. Nur vom Hersteller
          freigegebene Pakete als „Eichrecht-zertifiziert" markieren — und die Konformitätsbescheinigung referenzieren.
        </AlertDescription>
      </Alert>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">Katalog</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="rollout">Bulk-Rollout</TabsTrigger>
        </TabsList>

        {/* ============= Katalog ============= */}
        <TabsContent value="catalog">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Firmware-Artefakte ({artifacts?.length ?? 0})</CardTitle>
              <Input
                placeholder="Suche Hersteller / Modell / Version…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="max-w-xs"
              />
            </CardHeader>
            <CardContent>
              {loadingArtifacts ? (
                <div className="text-sm text-muted-foreground">Lade…</div>
              ) : filteredArtifacts.length === 0 ? (
                <div className="text-sm text-muted-foreground">Keine Einträge.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hersteller</TableHead>
                        <TableHead>Modell</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Größe</TableHead>
                        <TableHead>Eichrecht</TableHead>
                        <TableHead>Hochgeladen</TableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredArtifacts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.vendor}</TableCell>
                          <TableCell>{a.model}</TableCell>
                          <TableCell>v{a.version}</TableCell>
                          <TableCell><Badge variant="outline">{a.file_format}</Badge></TableCell>
                          <TableCell>{fmtSize(a.file_size)}</TableCell>
                          <TableCell>
                            {a.is_eichrecht_certified ? (
                              <Badge variant="default" className="gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                {a.eichrecht_approval_ref || "zertifiziert"}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">nein</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{ts(a.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {a.release_notes && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" title="Release Notes">
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Release Notes — v{a.version}</DialogTitle>
                                      <DialogDescription>{a.vendor} {a.model}</DialogDescription>
                                    </DialogHeader>
                                    <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap">{a.release_notes}</pre>
                                  </DialogContent>
                                </Dialog>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(a)} title="Löschen">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= Upload ============= */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Neues Firmware-Paket hochladen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Hersteller *</Label>
                  <Input list="vendor-list" value={uVendor} onChange={(e) => setUVendor(e.target.value)} placeholder="z. B. ABB" />
                  <datalist id="vendor-list">
                    {(vendorModels?.vendors ?? []).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Modell *</Label>
                  <Input list="model-list" value={uModel} onChange={(e) => setUModel(e.target.value)} placeholder="z. B. Terra AC" />
                  <datalist id="model-list">
                    {(vendorModels?.models ?? []).map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Version *</Label>
                  <Input value={uVersion} onChange={(e) => setUVersion(e.target.value)} placeholder="z. B. 1.6.21" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Datei * (max. 100 MB)</Label>
                  <Input type="file" onChange={(e) => setUFile(e.target.files?.[0] ?? null)} />
                  {uFile && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {uFile.name} • {fmtSize(uFile.size)}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Format *</Label>
                  <Select value={uFormat} onValueChange={(v) => setUFormat(v as typeof FORMATS[number])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Release Notes</Label>
                <Textarea value={uNotes} onChange={(e) => setUNotes(e.target.value)} rows={4} placeholder="Optional — Änderungen, Bugfixes, Sicherheitshinweise…" />
              </div>

              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={uEichrecht} onCheckedChange={(v) => setUEichrecht(v === true)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">Eichrecht-Freigabe vorhanden</span>
                    <p className="text-xs text-muted-foreground">
                      Nur ankreuzen, wenn der Hersteller eine Konformitätsbescheinigung für diese FW-Version ausgestellt hat.
                    </p>
                  </span>
                </label>
                {uEichrecht && (
                  <div>
                    <Label>Konformitäts-Referenz *</Label>
                    <Input value={uEichrechtRef} onChange={(e) => setUEichrechtRef(e.target.value)} placeholder="z. B. PTB-Zertifikat-Nr. oder URL" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetUpload} disabled={uploading}>Zurücksetzen</Button>
                <Button onClick={handleUpload} disabled={uploading}>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Lädt hoch…" : "Hochladen"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============= Rollout ============= */}
        <TabsContent value="rollout">
          <Card>
            <CardHeader>
              <CardTitle>Bulk-Rollout an Ladepunkte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Firmware-Artefakt</Label>
                  <Select value={rolloutArtifactId} onValueChange={setRolloutArtifactId}>
                    <SelectTrigger><SelectValue placeholder="Artefakt wählen" /></SelectTrigger>
                    <SelectContent>
                      {(artifacts ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.vendor} {a.model} v{a.version} {a.is_eichrecht_certified ? "🛡️" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Zeitpunkt (Download ab)</Label>
                  <Input type="datetime-local" value={rolloutRetrieve} onChange={(e) => setRolloutRetrieve(e.target.value)} />
                </div>
              </div>

              {rolloutArtifact?.is_eichrecht_certified && (
                <label className="flex items-start gap-2 text-sm border rounded-md p-3 bg-muted/30">
                  <Checkbox checked={rolloutEichrechtAck} onCheckedChange={(v) => setRolloutEichrechtAck(v === true)} className="mt-0.5" />
                  <span>
                    Ich bestätige, dass für alle ausgewählten Ladepunkte eine gültige Eichrecht-Konformitätsbescheinigung
                    {rolloutArtifact.eichrecht_approval_ref ? ` (Ref: ${rolloutArtifact.eichrecht_approval_ref})` : ""} vorliegt.
                  </span>
                </label>
              )}

              {rolloutArtifact && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={selectAll} disabled={!matchingCps?.length}>Alle</Button>
                    <Button size="sm" variant="outline" onClick={selectOnline} disabled={!matchingCps?.length}>Nur online</Button>
                    <Button size="sm" variant="outline" onClick={clearAll} disabled={selectedCps.size === 0}>Auswahl löschen</Button>
                    <span className="text-sm text-muted-foreground ml-auto">
                      {selectedCps.size} / {matchingCps?.length ?? 0} ausgewählt
                    </span>
                  </div>

                  {loadingCps ? (
                    <div className="text-sm text-muted-foreground">Lade Ladepunkte…</div>
                  ) : !matchingCps?.length ? (
                    <div className="text-sm text-muted-foreground">
                      Keine Ladepunkte mit Hersteller „{rolloutArtifact.vendor}" und Modell „{rolloutArtifact.model}" gefunden.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8" />
                            <TableHead>Tenant</TableHead>
                            <TableHead>Ladepunkt</TableHead>
                            <TableHead>Aktuelle FW</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ergebnis</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {matchingCps.map((cp) => {
                            const res = rolloutResults?.find((r) => r.id === cp.id);
                            return (
                              <TableRow key={cp.id}>
                                <TableCell>
                                  <Checkbox checked={selectedCps.has(cp.id)} onCheckedChange={() => toggleCp(cp.id)} />
                                </TableCell>
                                <TableCell className="text-xs">{cp.tenants?.name ?? "—"}</TableCell>
                                <TableCell>{cp.name ?? cp.id.slice(0, 8)}</TableCell>
                                <TableCell className="text-xs">{cp.firmware_version ?? "—"}</TableCell>
                                <TableCell>
                                  <Badge variant={cp.ws_connected ? "default" : "outline"}>
                                    {cp.ws_connected ? "online" : "offline"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {res ? (
                                    res.ok
                                      ? <Badge variant="default">OK</Badge>
                                      : <Badge variant="destructive" title={res.error}>Fehler</Badge>
                                  ) : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handleRollout}
                      disabled={
                        rolloutBusy ||
                        selectedCps.size === 0 ||
                        (rolloutArtifact.is_eichrecht_certified && !rolloutEichrechtAck)
                      }
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {rolloutBusy ? "Rollt aus…" : `Rollout starten (${selectedCps.size})`}
                    </Button>
                  </div>

                  {rolloutResults && (
                    <Alert>
                      <AlertTitle>Ergebnis</AlertTitle>
                      <AlertDescription className="text-xs">
                        Erfolgreich: {rolloutResults.filter((r) => r.ok).length} / {rolloutResults.length}
                        {rolloutResults.some((r) => !r.ok) && (
                          <ul className="list-disc pl-4 mt-2">
                            {rolloutResults.filter((r) => !r.ok).map((r) => (
                              <li key={r.id}>{r.name}: {r.error}</li>
                            ))}
                          </ul>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
