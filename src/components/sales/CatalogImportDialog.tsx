import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  parseCatalogCsv,
  catalogCsvTemplate,
  type CatalogImportRow,
} from "@/lib/salesCatalogImport";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  onImported: () => void;
}

export function CatalogImportDialog({ open, onOpenChange, partnerId, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CatalogImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const downloadTemplate = () => {
    const blob = new Blob([catalogCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "artikel_vorlage.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    let text: string;
    if (/\.xlsx?$/i.test(file.name)) {
      try {
        const XLSX = await import("@e965/xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // Emit as CSV with semicolon so our parser handles both formats consistently.
        text = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
      } catch (e) {
        toast({
          title: "Excel-Datei konnte nicht gelesen werden",
          description: String(e),
          variant: "destructive",
        });
        return;
      }
    } else {
      text = await file.text();
    }
    const result = parseCatalogCsv(text);
    setRows(result.rows);
    setErrors(result.errors);
  };

  const doImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const payload = rows.map((r) => ({
        ...r,
        geraete_klasse: r.geraete_klasse as any,
        owner_scope: "partner" as const,
        partner_id: partnerId,
        kompatibilitaet: {},
      }));
      const { error } = await supabase.from("device_catalog").insert(payload);
      if (error) throw error;
      toast({ title: `${rows.length} Artikel importiert` });
      setRows([]);
      setErrors([]);
      setFileName("");
      onImported();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Import fehlgeschlagen",
        description: e.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Artikel importieren (CSV / Excel)</DialogTitle>
          <DialogDescription>
            Pflichtspalten: <code>hersteller</code>, <code>modell</code>, <code>vk_preis</code>.
            Optionale Spalten: <code>geraete_klasse</code>, <code>ek_preis</code>,{" "}
            <code>installations_pauschale</code>, <code>einheit</code>,{" "}
            <code>artikelnummer</code>, <code>ean</code>, <code>beschreibung</code>,{" "}
            <code>is_active</code>. Zahlen dürfen deutsches (129,00) oder englisches (129.00)
            Format verwenden.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="h-4 w-4 mr-1" />
            Vorlage herunterladen
          </Button>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            Datei wählen
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {fileName && <span className="text-sm text-muted-foreground self-center">{fileName}</span>}
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-1 max-h-32 overflow-y-auto">
            {errors.map((e, i) => (
              <div key={i} className="text-destructive">
                {e}
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-md border max-h-64 overflow-auto text-xs">
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-1.5">Klasse</th>
                  <th className="text-left p-1.5">Hersteller / Modell</th>
                  <th className="text-left p-1.5">Art.-Nr / EAN</th>
                  <th className="text-right p-1.5">VK €</th>
                  <th className="text-right p-1.5">Inst €</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">{r.geraete_klasse}</td>
                    <td className="p-1.5">
                      <div>{r.hersteller}</div>
                      <div className="text-muted-foreground">{r.modell}</div>
                    </td>
                    <td className="p-1.5">
                      <div>{r.artikelnummer ?? "—"}</div>
                      <div className="text-muted-foreground">{r.ean ?? ""}</div>
                    </td>
                    <td className="p-1.5 text-right tabular-nums">
                      {r.vk_preis.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-1.5 text-right tabular-nums">
                      {r.installations_pauschale.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <div className="p-2 text-muted-foreground border-t">
                … und {rows.length - 100} weitere Zeilen
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={doImport} disabled={busy || rows.length === 0}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            {rows.length > 0 ? `${rows.length} Artikel importieren` : "Importieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
