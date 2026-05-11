import { useState, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Download, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  parseFile,
  autoDetectMapping,
  generateReadingsTemplate,
  generateConsumptionTemplate,
  generateConsumptionMonthlyTemplate,
  generatePower5MinTemplate,
  type ParseResult,
  type MappableField,
} from "@/lib/csvParser";
import { useDataImport, type ImportType, type ConflictStrategy, type ValidatedRow, type ImportResult } from "@/hooks/useDataImport";
import { toast } from "sonner";

interface DataImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "mapping" | "validation" | "result";

const FIELD_OPTIONS: { value: MappableField; label: string }[] = [
  { value: "none", label: "– Ignorieren –" },
  { value: "source_block", label: "Quelle / Datenart" },
  { value: "location_name", label: "Standort" },
  { value: "meter_name", label: "Zähler-Name" },
  { value: "meter_number", label: "Zählernummer" },
  { value: "date", label: "Datum / Zeitraum" },
  { value: "time", label: "Zeit / Uhrzeit" },
  { value: "value", label: "Wert / Verbrauch / Leistung" },
  { value: "unit", label: "Einheit" },
  { value: "energy_type", label: "Energieart" },
  { value: "notes", label: "Notiz" },
];

const IMPORT_TYPE_OPTIONS: { value: ImportType; label: string; hint: string }[] = [
  { value: "readings", label: "Manuelle Ablesungen", hint: "Zählerstände (kWh, m³)" },
  { value: "consumption", label: "Tagesverbrauch", hint: "Differenz pro Tag" },
  { value: "consumption_monthly", label: "Monatsverbrauch", hint: "Summe pro Monat" },
  { value: "power_5min", label: "5-Min Leistung", hint: "Lastprofile in kW" },
];

export default function DataImportDialog({ open, onOpenChange }: DataImportDialogProps) {
  const { t } = useTranslation();
  const { validateRows, executeImport, progress, importing } = useDataImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [importType, setImportType] = useState<ImportType>("readings");
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>("skip");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, MappableField>>({});
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [autoDetected, setAutoDetected] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setParsed(null);
    setMapping({});
    setValidated([]);
    setResult(null);
    setFileName("");
    setAutoDetected(false);
  }, []);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFileSelect = async (file: File) => {
    try {
      const result = await parseFile(file);
      if (result.rows.length === 0) {
        toast.error(t("import.error" as any));
        return;
      }
      setParsed(result);
      setFileName(file.name);
      const detected = autoDetectMapping(result.headers);
      setMapping(detected);
      // If "Quelle" column is present, this is a Lovable-format export → auto-detection works
      const hasSource = Object.values(detected).includes("source_block");
      setAutoDetected(hasSource);
      setStep("mapping");
    } catch {
      toast.error(t("import.error" as any));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleValidate = async () => {
    if (!parsed) return;
    const results = await validateRows(parsed.rows, mapping, importType);
    setValidated(results);
    setStep("validation");
  };

  const handleExecute = async () => {
    const res = await executeImport(validated, importType, conflictStrategy);
    setResult(res);
    setStep("result");
    if (res.errors === 0) toast.success(t("import.success" as any));
    else toast.warning(t("import.partialSuccess" as any));
  };

  const toggleExcluded = (idx: number) => {
    setValidated((prev) => prev.map((r, i) => (i === idx ? { ...r, excluded: !r.excluded } : r)));
  };

  const downloadTemplate = (type: ImportType) => {
    const map: Record<ImportType, { content: string; name: string }> = {
      readings: { content: generateReadingsTemplate(), name: "vorlage-zaehlerstaende.csv" },
      consumption: { content: generateConsumptionTemplate(), name: "vorlage-tagesverbrauch.csv" },
      consumption_monthly: { content: generateConsumptionMonthlyTemplate(), name: "vorlage-monatsverbrauch.csv" },
      power_5min: { content: generatePower5MinTemplate(), name: "vorlage-leistung-5min.csv" },
    };
    const { content, name } = map[type];
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = validated.filter((r) => r.issues.some((i) => i.severity === "error")).length;
  const warningCount = validated.filter((r) => r.issues.some((i) => i.severity === "warning") && !r.issues.some((i) => i.severity === "error")).length;
  const validCount = validated.filter((r) => !r.excluded).length;

  // Per-import-type breakdown for the validation step
  const typeBreakdown = useMemo(() => {
    const m = new Map<ImportType, number>();
    validated.forEach((r) => {
      if (!r.excluded) m.set(r.importType, (m.get(r.importType) ?? 0) + 1);
    });
    return m;
  }, [validated]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("import.title" as any)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-4">
          {(["upload", "mapping", "validation", "result"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                (["upload", "mapping", "validation", "result"] as Step[]).indexOf(step) >= i
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm">Datentyp</Label>
              <div className="grid grid-cols-2 gap-2">
                {IMPORT_TYPE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={importType === opt.value ? "default" : "outline"}
                    onClick={() => setImportType(opt.value)}
                    className="flex-col h-auto py-3 items-start"
                  >
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-xs opacity-80">{opt.hint}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Tipp: Wenn Sie eine Datei aus dem Lovable-Export hochladen, werden gemischte Inhalte
                automatisch korrekt verteilt – die Auswahl hier dient nur als Standard.
              </p>
            </div>

            <div>
              <Label className="mb-2 block text-sm">Bei Konflikt mit existierenden Daten</Label>
              <RadioGroup value={conflictStrategy} onValueChange={(v) => setConflictStrategy(v as ConflictStrategy)} className="space-y-1">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="skip" id="cs-skip" />
                  <Label htmlFor="cs-skip" className="text-sm font-normal">Überspringen (Standard)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="overwrite" id="cs-overwrite" />
                  <Label htmlFor="cs-overwrite" className="text-sm font-normal">Überschreiben</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="insert_new" id="cs-new" />
                  <Label htmlFor="cs-new" className="text-sm font-normal">Nur neue Zeitpunkte einfügen</Label>
                </div>
              </RadioGroup>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">{t("import.dragDrop" as any)}</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, XLS, XLSX</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {IMPORT_TYPE_OPTIONS.map((opt) => (
                <Button key={opt.value} variant="ghost" size="sm" onClick={() => downloadTemplate(opt.value)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {step === "mapping" && parsed && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {fileName} – {parsed.rows.length} {t("import.rows" as any)}
            </p>

            {autoDetected && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-primary/30 bg-primary/5 text-sm">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  Lovable-Export erkannt. Die Spalte „Quelle" verteilt jede Zeile automatisch
                  auf die richtige Zieltabelle (Ablesungen, Tages-/Monatsverbrauch, 5-Min-Leistung).
                </span>
              </div>
            )}

            <div className="space-y-3">
              {parsed.headers.map((h) => (
                <div key={h} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-40 truncate" title={h}>{h}</span>
                  <Select
                    value={mapping[h] || "none"}
                    onValueChange={(v) => setMapping((prev) => ({ ...prev, [h]: v as MappableField }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-2 py-1 text-muted-foreground">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>{t("import.back" as any)}</Button>
              <Button
                onClick={handleValidate}
                disabled={
                  !(Object.values(mapping).includes("meter_number") || Object.values(mapping).includes("meter_name")) ||
                  !Object.values(mapping).includes("date") ||
                  !Object.values(mapping).includes("value")
                }
              >
                {t("import.validate" as any)}
              </Button>
            </div>
          </div>
        )}

        {step === "validation" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-md border bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{validCount}</p>
                  <p className="text-xs text-muted-foreground">{t("import.validRows" as any)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-md border bg-yellow-50 dark:bg-yellow-950/20">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{warningCount}</p>
                  <p className="text-xs text-muted-foreground">{t("import.warnings" as any)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-md border bg-red-50 dark:bg-red-950/20">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{errorCount}</p>
                  <p className="text-xs text-muted-foreground">{t("import.errors" as any)}</p>
                </div>
              </div>
            </div>

            {typeBreakdown.size > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {Array.from(typeBreakdown.entries()).map(([type, count]) => {
                  const label = IMPORT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
                  return (
                    <Badge key={type} variant="secondary">
                      {label}: {count.toLocaleString("de-DE")}
                    </Badge>
                  );
                })}
              </div>
            )}

            {validated.filter((r) => r.issues.length > 0).length > 0 && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b bg-muted/50 sticky top-0">
                      <th className="px-2 py-1 w-8"></th>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">{t("import.meterNumber" as any)}</th>
                      <th className="px-2 py-1 text-left">{t("import.issue" as any)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validated
                      .filter((r) => r.issues.length > 0)
                      .slice(0, 50)
                      .map((r) => (
                        <tr key={r.rowIndex} className="border-b last:border-0">
                          <td className="px-2 py-1">
                            <Checkbox
                              checked={!r.excluded}
                              onCheckedChange={() => toggleExcluded(validated.indexOf(r))}
                            />
                          </td>
                          <td className="px-2 py-1">{r.rowIndex + 1}</td>
                          <td className="px-2 py-1 font-mono">{r.meterNumber}</td>
                          <td className="px-2 py-1">
                            {r.issues.map((iss, i) => (
                              <Badge
                                key={i}
                                variant={iss.severity === "error" ? "destructive" : "secondary"}
                                className="mr-1 text-[10px]"
                              >
                                {iss.message}
                              </Badge>
                            ))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("mapping")}>{t("import.back" as any)}</Button>
              <Button onClick={handleExecute} disabled={validCount === 0 || importing}>
                {importing ? `${progress}%` : `${validCount.toLocaleString("de-DE")} ${t("import.execute" as any)}`}
              </Button>
            </div>

            {importing && <Progress value={progress} className="h-2" />}
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
            <div>
              <p className="text-2xl font-bold">{result.imported.toLocaleString("de-DE")}</p>
              <p className="text-sm text-muted-foreground">{t("import.importedRows" as any)}</p>
            </div>
            {result.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {result.skipped.toLocaleString("de-DE")} {t("import.skippedRows" as any)}
              </p>
            )}
            {result.errors > 0 && (
              <p className="text-sm text-destructive">
                {result.errors.toLocaleString("de-DE")} {t("import.errorRows" as any)}
              </p>
            )}
            <Button onClick={() => handleClose(false)} className="mt-4">{t("import.close" as any)}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
