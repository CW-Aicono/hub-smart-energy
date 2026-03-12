import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocations } from "@/hooks/useLocations";
import { useSupplierInvoices } from "@/hooks/useSupplierInvoices";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvoiceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correctionOfId?: string | null;
}

type Step = "upload" | "analyzing" | "review" | "done";

const ENERGY_TYPES = [
  { value: "strom", label: "Strom" },
  { value: "gas", label: "Gas" },
  { value: "waerme", label: "Wärme" },
  { value: "wasser", label: "Wasser" },
  { value: "fernwaerme", label: "Fernwärme" },
];

interface ExtractedData {
  supplier_name?: string;
  invoice_number?: string;
  energy_type?: string;
  period_start?: string;
  period_end?: string;
  consumption_kwh?: number;
  consumption_unit?: string;
  total_gross?: number;
  total_net?: number;
  tax_amount?: number;
  suggested_location_id?: string;
  confidence?: string;
  field_confidences?: Record<string, string>;
}

export default function InvoiceImportDialog({ open, onOpenChange, correctionOfId }: InvoiceImportDialogProps) {
  const { t } = useTranslation();
  const { locations } = useLocations();
  const { createInvoice, tenantId } = useSupplierInvoices();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [fileType, setFileType] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData>({});
  const [aiRaw, setAiRaw] = useState<any>(null);

  // Editable form fields
  const [form, setForm] = useState({
    supplier_name: "",
    invoice_number: "",
    energy_type: "strom",
    period_start: "",
    period_end: "",
    consumption_kwh: 0,
    consumption_unit: "kWh",
    total_gross: 0,
    total_net: 0,
    tax_amount: 0,
    location_id: "",
    notes: "",
  });

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setFileBase64("");
    setFileType("");
    setFilePath(null);
    setExtracted({});
    setAiRaw(null);
    setForm({
      supplier_name: "",
      invoice_number: "",
      energy_type: "strom",
      period_start: "",
      period_end: "",
      consumption_kwh: 0,
      consumption_unit: "kWh",
      total_gross: 0,
      total_net: 0,
      tax_amount: 0,
      location_id: "",
      notes: "",
    });
  }, []);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 20 MB)");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const validTypes = ["pdf", "jpg", "jpeg", "png", "webp"];
    if (!validTypes.includes(ext)) {
      toast.error("Unterstützte Formate: PDF, JPG, PNG");
      return;
    }

    setFileName(file.name);
    setFileType(ext === "pdf" ? "pdf" : ext);
    setStep("analyzing");

    try {
      // Upload file to storage
      const path = `${tenantId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-files")
        .upload(path, file);
      if (uploadError) console.error("Upload error:", uploadError);
      else setFilePath(path);

      // Convert to base64 for AI
      const base64 = await toBase64(file);
      setFileBase64(base64);

      // Call AI extraction
      const { data: fnData, error: fnError } = await supabase.functions.invoke("extract-invoice", {
        body: {
          file_base64: base64,
          file_type: ext === "pdf" ? "pdf" : ext,
          locations: locations.map((l) => ({ id: l.id, name: l.name, address: l.address })),
        },
      });

      if (fnError) throw fnError;

      if (fnData?.data) {
        const d = fnData.data as ExtractedData;
        setExtracted(d);
        setAiRaw(fnData.raw);
        setForm({
          supplier_name: d.supplier_name || "",
          invoice_number: d.invoice_number || "",
          energy_type: d.energy_type || "strom",
          period_start: d.period_start || "",
          period_end: d.period_end || "",
          consumption_kwh: d.consumption_kwh || 0,
          consumption_unit: d.consumption_unit || "kWh",
          total_gross: d.total_gross || 0,
          total_net: d.total_net || 0,
          tax_amount: d.tax_amount || 0,
          location_id: d.suggested_location_id || "",
          notes: "",
        });
        setStep("review");
      } else {
        throw new Error(fnData?.error || "Extraction failed");
      }
    } catch (err: any) {
      console.error("AI extraction failed:", err);
      toast.error("KI-Extraktion fehlgeschlagen. Bitte Daten manuell eingeben.");
      setStep("review");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleSave = async () => {
    await createInvoice.mutateAsync({
      supplier_name: form.supplier_name || null,
      invoice_number: form.invoice_number || null,
      energy_type: form.energy_type,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      consumption_kwh: form.consumption_kwh,
      consumption_unit: form.consumption_unit,
      total_gross: form.total_gross,
      total_net: form.total_net || null,
      tax_amount: form.tax_amount || null,
      location_id: form.location_id || null,
      file_path: filePath,
      ai_confidence: extracted.confidence || "low",
      ai_raw_response: aiRaw,
      correction_of_id: correctionOfId || null,
      notes: form.notes || null,
      status: "draft",
    } as any);
    setStep("done");
  };

  const confidenceBadge = (level?: string) => {
    if (!level) return null;
    const variant = level === "high" ? "default" : level === "medium" ? "secondary" : "destructive";
    const label = level === "high" ? "Hoch" : level === "medium" ? "Mittel" : "Niedrig";
    return <Badge variant={variant} className="text-[10px] ml-2">{label}</Badge>;
  };

  const fc = extracted.field_confidences || {};

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {correctionOfId
              ? t("invoices.importCorrection" as any)
              : t("invoices.importTitle" as any)}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex gap-1 mb-4">
          {(["upload", "analyzing", "review", "done"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                (["upload", "analyzing", "review", "done"] as Step[]).indexOf(step) >= i
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">{t("invoices.dragDrop" as any)}</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (max. 20 MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          </div>
        )}

        {/* Analyzing */}
        {step === "analyzing" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <div>
              <p className="font-medium">{t("invoices.analyzing" as any)}</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
        )}

        {/* Review */}
        {step === "review" && (
          <div className="space-y-4">
            {extracted.confidence && (
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{t("invoices.aiConfidence" as any)}:</span>
                {confidenceBadge(extracted.confidence)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.supplier" as any)}
                  {confidenceBadge(fc.supplier_name)}
                </Label>
                <Input
                  value={form.supplier_name}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.invoiceNumber" as any)}
                  {confidenceBadge(fc.invoice_number)}
                </Label>
                <Input
                  value={form.invoice_number}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.energyType" as any)}
                  {confidenceBadge(fc.energy_type)}
                </Label>
                <Select
                  value={form.energy_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, energy_type: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENERGY_TYPES.map((et) => (
                      <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.location" as any)}
                  {confidenceBadge(fc.location)}
                </Label>
                <Select
                  value={form.location_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder={t("invoices.selectLocation" as any)} /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.periodStart" as any)}
                  {confidenceBadge(fc.period_start)}
                </Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.periodEnd" as any)}
                  {confidenceBadge(fc.period_end)}
                </Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.consumption" as any)}
                  {confidenceBadge(fc.consumption_kwh)}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.consumption_kwh}
                  onChange={(e) => setForm((f) => ({ ...f, consumption_kwh: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t("invoices.unit" as any)}</Label>
                <Select
                  value={form.consumption_unit}
                  onValueChange={(v) => setForm((f) => ({ ...f, consumption_unit: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kWh">kWh</SelectItem>
                    <SelectItem value="m³">m³</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs flex items-center">
                  {t("invoices.totalGross" as any)}
                  {confidenceBadge(fc.total_gross)}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.total_gross}
                  onChange={(e) => setForm((f) => ({ ...f, total_gross: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">{t("invoices.totalNet" as any)}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.total_net}
                  onChange={(e) => setForm((f) => ({ ...f, total_net: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t("invoices.taxAmount" as any)}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.tax_amount}
                  onChange={(e) => setForm((f) => ({ ...f, tax_amount: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{t("invoices.notes" as any)}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("invoices.notesPlaceholder" as any)}
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => { reset(); setStep("upload"); }}>
                {t("invoices.back" as any)}
              </Button>
              <Button onClick={handleSave} disabled={createInvoice.isPending}>
                {createInvoice.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {t("invoices.save" as any)}
              </Button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
            <p className="text-lg font-bold">{t("invoices.importSuccess" as any)}</p>
            <p className="text-sm text-muted-foreground">{t("invoices.importSuccessDesc" as any)}</p>
            <Button onClick={() => handleClose(false)} className="mt-4">
              {t("invoices.close" as any)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
