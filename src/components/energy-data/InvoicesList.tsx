import { useState, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, Download, Pencil, Trash2, CornerDownRight, Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocations } from "@/hooks/useLocations";
import { useSupplierInvoices, type SupplierInvoice } from "@/hooks/useSupplierInvoices";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const InvoiceImportDialog = lazy(() => import("./InvoiceImportDialog"));

const STATUS_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  draft: { variant: "secondary", label: "Entwurf" },
  confirmed: { variant: "default", label: "Bestätigt" },
};

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
  fernwaerme: "Fernwärme",
};

export default function InvoicesList() {
  const { t } = useTranslation();
  const { locations } = useLocations();
  const {
    invoices,
    originalInvoices,
    isLoading,
    deleteInvoice,
    updateInvoice,
    getCorrections,
    getNetConsumption,
    getNetAmount,
  } = useSupplierInvoices();

  const [importOpen, setImportOpen] = useState(false);
  const [correctionOfId, setCorrectionOfId] = useState<string | null>(null);
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = originalInvoices.filter((inv) => {
    if (filterLocation !== "all" && inv.location_id !== filterLocation) return false;
    if (filterStatus !== "all" && inv.status !== filterStatus) return false;
    return true;
  });

  const handleDownload = async (filePath: string | null) => {
    if (!filePath) return;
    const { data } = await supabase.storage.from("invoice-files").createSignedUrl(filePath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleConfirm = (inv: SupplierInvoice) => {
    updateInvoice.mutate({ id: inv.id, status: "confirmed" } as any);
  };

  const handleAddCorrection = (id: string) => {
    setCorrectionOfId(id);
    setImportOpen(true);
  };

  const handleNewImport = () => {
    setCorrectionOfId(null);
    setImportOpen(true);
  };

  const fmt = (d: string | null) => (d ? format(new Date(d), "dd.MM.yyyy") : "–");
  const fmtNum = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–";

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex gap-2">
          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("invoices.allLocations" as any)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("invoices.allLocations" as any)}</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("invoices.allStatuses" as any)}</SelectItem>
              <SelectItem value="draft">{t("invoices.draft" as any)}</SelectItem>
              <SelectItem value="confirmed">{t("invoices.confirmed" as any)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleNewImport}>
          <Plus className="h-4 w-4 mr-2" />
          {t("invoices.importTitle" as any)}
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t("invoices.empty" as any)}</p>
            <Button variant="outline" className="mt-4" onClick={handleNewImport}>
              <Upload className="h-4 w-4 mr-2" />
              {t("invoices.importTitle" as any)}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices.supplier" as any)}</TableHead>
                  <TableHead>{t("invoices.invoiceNumber" as any)}</TableHead>
                  <TableHead>{t("invoices.location" as any)}</TableHead>
                  <TableHead>{t("invoices.energyType" as any)}</TableHead>
                  <TableHead>{t("invoices.period" as any)}</TableHead>
                  <TableHead className="text-right">{t("invoices.consumption" as any)}</TableHead>
                  <TableHead className="text-right">{t("invoices.totalGross" as any)}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const corrections = getCorrections(inv.id);
                  const hasCorrections = corrections.length > 0;
                  const locName =
                    (inv as any).locations?.name ||
                    locations.find((l) => l.id === inv.location_id)?.name ||
                    "–";

                  return (
                    <>
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.supplier_name || "–"}</TableCell>
                        <TableCell className="font-mono text-xs">{inv.invoice_number || "–"}</TableCell>
                        <TableCell>{locName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{ENERGY_LABELS[inv.energy_type] || inv.energy_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {fmt(inv.period_start)} – {fmt(inv.period_end)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtNum(hasCorrections ? getNetConsumption(inv) : inv.consumption_kwh)}{" "}
                          <span className="text-xs text-muted-foreground">{inv.consumption_unit}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtNum(hasCorrections ? getNetAmount(inv) : inv.total_gross)}{" "}
                          <span className="text-xs text-muted-foreground">€</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGES[inv.status]?.variant || "secondary"}>
                            {STATUS_BADGES[inv.status]?.label || inv.status}
                          </Badge>
                          {hasCorrections && (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              Korr.
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {inv.file_path && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDownload(inv.file_path)}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {inv.status === "draft" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleConfirm(inv)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleAddCorrection(inv.id)}
                              title={t("invoices.addCorrection" as any)}
                            >
                              <CornerDownRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteInvoice.mutate(inv.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Correction rows */}
                      {corrections.map((corr) => (
                        <TableRow key={corr.id} className="bg-muted/30">
                          <TableCell className="pl-8 text-xs text-muted-foreground">
                            <CornerDownRight className="h-3 w-3 inline mr-1" />
                            Korrektur
                          </TableCell>
                          <TableCell className="font-mono text-xs">{corr.invoice_number || "–"}</TableCell>
                          <TableCell>–</TableCell>
                          <TableCell>–</TableCell>
                          <TableCell className="text-xs">
                            {fmt(corr.period_start)} – {fmt(corr.period_end)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {fmtNum(corr.consumption_kwh)} {corr.consumption_unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {fmtNum(corr.total_gross)} €
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">Korrektur</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteInvoice.mutate(corr.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Suspense fallback={null}>
        <InvoiceImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          correctionOfId={correctionOfId}
        />
      </Suspense>
    </div>
  );
}
