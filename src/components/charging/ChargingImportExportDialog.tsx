import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useChargingUsers, useChargingUserGroups } from "@/hooks/useChargingUsers";
import { useChargingTariffs } from "@/hooks/useChargingTariffs";
import { useTenant } from "@/hooks/useTenant";
import { useQueryClient } from "@tanstack/react-query";
import {
  exportUsers, exportGroups, exportNfc, downloadTemplate,
  parseImportFile, buildUserPreview, buildGroupPreview, buildNfcPreview,
  executeUserImport, executeGroupImport, executeNfcImport,
  type ExportType, type ExportFormat,
} from "@/lib/chargingImportExport";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Vorausgewählter Datentyp beim Öffnen. */
  initialType?: ExportType;
}

type PreviewState =
  | { kind: "users"; preview: ReturnType<typeof buildUserPreview> }
  | { kind: "groups"; preview: ReturnType<typeof buildGroupPreview> }
  | { kind: "nfc"; preview: ReturnType<typeof buildNfcPreview> }
  | null;

const TYPE_LABELS: Record<ExportType, string> = {
  users: "Nutzer",
  groups: "Nutzergruppen",
  nfc: "NFC-Tags",
};

export function ChargingImportExportDialog({ open, onOpenChange, initialType = "users" }: Props) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { users } = useChargingUsers();
  const { groups } = useChargingUserGroups();
  const { tariffs } = useChargingTariffs();

  const [type, setType] = useState<ExportType>(initialType);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [importType, setImportType] = useState<ExportType>(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);

  const tariffLites = tariffs.map((t) => ({ id: t.id, name: t.name }));

  const resetImport = () => { setFile(null); setPreview(null); };

  const handleExport = () => {
    if (type === "users") exportUsers(users, groups, tariffLites, format);
    else if (type === "groups") exportGroups(groups, tariffLites, format);
    else exportNfc(users, format);
    toast({ title: "Export gestartet", description: `${TYPE_LABELS[type]} als ${format.toUpperCase()} heruntergeladen.` });
  };

  const handleTemplate = () => {
    downloadTemplate(type, format);
    toast({ title: "Vorlage heruntergeladen", description: `Vorlage für ${TYPE_LABELS[type]} (${format.toUpperCase()}).` });
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setPreview(null);
    try {
      const parsed = await parseImportFile(f);
      if (importType === "users") {
        setPreview({ kind: "users", preview: buildUserPreview(parsed.rows, users, groups, tariffLites) });
      } else if (importType === "groups") {
        setPreview({ kind: "groups", preview: buildGroupPreview(parsed.rows, groups, tariffLites) });
      } else {
        setPreview({ kind: "nfc", preview: buildNfcPreview(parsed.rows, users) });
      }
    } catch (e) {
      toast({ title: "Datei konnte nicht gelesen werden", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handleRunImport = async () => {
    if (!preview || !tenant?.id) return;
    setRunning(true);
    try {
      let res: { created: number; updated: number; failed: number };
      if (preview.kind === "users") res = await executeUserImport(preview.preview.records, tenant.id);
      else if (preview.kind === "groups") res = await executeGroupImport(preview.preview.records, tenant.id);
      else res = await executeNfcImport(preview.preview.records, tenant.id);


      queryClient.invalidateQueries({ queryKey: ["charging-users"] });
      queryClient.invalidateQueries({ queryKey: ["charging-user-groups"] });
      toast({
        title: "Import abgeschlossen",
        description: `${res.created} neu, ${res.updated} aktualisiert${res.failed ? `, ${res.failed} Fehler` : ""}.`,
        variant: res.failed ? "destructive" : "default",
      });
      resetImport();
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetImport(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import & Export</DialogTitle>
          <DialogDescription>
            Nutzer, Nutzergruppen und NFC-Tags als Excel oder CSV exportieren und importieren.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="export">
          <TabsList>
            <TabsTrigger value="export"><Download className="h-4 w-4 mr-1.5" />Export</TabsTrigger>
            <TabsTrigger value="import"><Upload className="h-4 w-4 mr-1.5" />Import</TabsTrigger>
          </TabsList>

          {/* ----------------- Export ----------------- */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Datentyp</Label>
                <Select value={type} onValueChange={(v) => setType(v as ExportType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="users">Nutzer</SelectItem>
                    <SelectItem value="groups">Nutzergruppen</SelectItem>
                    <SelectItem value="nfc">NFC-Tags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx"><FileSpreadsheet className="h-3.5 w-3.5 inline mr-1.5" />Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv"><FileText className="h-3.5 w-3.5 inline mr-1.5" />CSV (.csv)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Aktueller Bestand: <strong>{users.length}</strong> Nutzer · <strong>{groups.length}</strong> Gruppen ·{" "}
                <strong>{users.reduce((acc, u) => acc + ((u.tags?.length ?? 0) || (u.rfid_tag ? 1 : 0)), 0)}</strong> NFC-Tags.
                Export enthält die aktuell sichtbaren Datensätze gemäß Berechtigung.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button onClick={handleExport}><Download className="h-4 w-4 mr-2" />Jetzt exportieren</Button>
              <Button variant="outline" onClick={handleTemplate}>
                <FileText className="h-4 w-4 mr-2" />Leere Vorlage
              </Button>
            </div>
          </TabsContent>

          {/* ----------------- Import ----------------- */}
          <TabsContent value="import" className="space-y-4 mt-4">
            <div>
              <Label>Datentyp</Label>
              <Select value={importType} onValueChange={(v) => { setImportType(v as ExportType); resetImport(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">Nutzer</SelectItem>
                  <SelectItem value="groups">Nutzergruppen</SelectItem>
                  <SelectItem value="nfc">NFC-Tags (E-Mail → RFID)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {importType === "users" && "Match per E-Mail (oder RFID-Tag) — bestehende Nutzer werden aktualisiert, neue angelegt."}
                {importType === "groups" && "Match per Gruppenname — bestehende Gruppen werden aktualisiert, neue angelegt."}
                {importType === "nfc" && "RFID-Tags (optional mit Tag-Bezeichnung) werden bestehenden Nutzern per E-Mail zugeordnet."}
              </p>
            </div>

            <div>
              <Label>Datei (.xlsx oder .csv)</Label>
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="block w-full text-sm border rounded px-2 py-1.5 mt-1 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
              />
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => { downloadTemplate(importType, "xlsx"); toast({ title: "Beispielvorlage heruntergeladen", description: `Vorlage mit Beispielzeile für ${TYPE_LABELS[importType]} (XLSX).` }); }}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Vorlage Beispiel (Excel)
                </Button>
                <Button variant="outline" size="sm" onClick={() => { downloadTemplate(importType, "csv"); toast({ title: "Beispielvorlage heruntergeladen", description: `Vorlage mit Beispielzeile für ${TYPE_LABELS[importType]} (CSV).` }); }}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />Vorlage Beispiel (CSV)
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">RFID-Tag bitte ohne Leerzeichen angeben (z. B. <code>04A1B2C3</code>).</p>
            </div>

            {parsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Datei wird geprüft…
              </div>
            )}

            {preview && (
              <div className="space-y-2 border rounded p-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />
                    {preview.preview.records.length} gültige Zeilen
                  </Badge>
                  {preview.preview.skipped > 0 && (
                    <Badge variant="destructive">{preview.preview.skipped} übersprungen</Badge>
                  )}
                  {preview.preview.issues.filter((i) => i.severity === "warning").length > 0 && (
                    <Badge variant="secondary">
                      {preview.preview.issues.filter((i) => i.severity === "warning").length} Warnungen
                    </Badge>
                  )}
                </div>

                {preview.kind === "users" && (
                  <p className="text-xs text-muted-foreground">
                    {preview.preview.records.filter((r) => r.isUpdate).length} Updates ·{" "}
                    {preview.preview.records.filter((r) => !r.isUpdate).length} Neuanlagen.
                  </p>
                )}
                {preview.kind === "groups" && (
                  <p className="text-xs text-muted-foreground">
                    {preview.preview.records.filter((r) => r.isUpdate).length} Updates ·{" "}
                    {preview.preview.records.filter((r) => !r.isUpdate).length} Neuanlagen.
                  </p>
                )}

                {preview.preview.issues.length > 0 && (
                  <div className="max-h-40 overflow-y-auto text-xs space-y-1 mt-2">
                    {preview.preview.issues.slice(0, 30).map((i, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${i.severity === "error" ? "text-destructive" : "text-amber-500"}`} />
                        <span>Zeile {i.row}: {i.message}</span>
                      </div>
                    ))}
                    {preview.preview.issues.length > 30 && (
                      <p className="text-muted-foreground">… und {preview.preview.issues.length - 30} weitere.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {preview && preview.preview.records.length > 0 && (
            <Button onClick={handleRunImport} disabled={running}>
              {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {preview.preview.records.length} Zeilen importieren
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
