import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Download, FileUp, Loader2, Puzzle, ShieldAlert, Sparkles } from "lucide-react";
import {
  scanTarget,
  planInjection,
  executeInjection,
  validate,
  verifyOriginalPreserved,
  type TemplateBlock,
} from "@/lib/loxone/injector";

const BUCKET = "loxone-master";

interface WishRow {
  type: string;
  count: number;
  existing: number[];
}

export default function LoxoneInjector() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetXml, setTargetXml] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>("");
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [wishes, setWishes] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const xml = await file.text();
      const found = scanTarget(xml);
      setTargetXml(xml);
      setTargetName(file.name);
      setBlocks(found);
      setWishes({});
      toast({ title: "Datei geladen", description: `${found.length} AICO_-Baustein-Typ(en) erkannt.` });
    } catch (e: any) {
      toast({ title: "Fehler beim Lesen", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const preview = useMemo(() => {
    if (!targetXml) return null;
    const list = Object.entries(wishes)
      .filter(([, n]) => n > 0)
      .map(([type, count]) => ({ type, count }));
    if (list.length === 0) return { steps: [], errors: [] };
    return planInjection(targetXml, list);
  }, [targetXml, wishes]);

  const handleDownload = async () => {
    if (!targetXml) return;
    setBusy(true);
    try {
      const wishList = Object.entries(wishes)
        .filter(([, n]) => n > 0)
        .map(([type, count]) => ({ type, count }));
      if (wishList.length === 0) {
        toast({ title: "Nichts ausgewählt", description: "Bitte mindestens eine Instanz > 0 setzen." });
        return;
      }
      const result = executeInjection(targetXml, wishList);
      const val = validate(result.xml);
      if (!val.ok) {
        toast({
          title: "Validierung fehlgeschlagen",
          description: val.errors.join(" | "),
          variant: "destructive",
        });
        return;
      }
      if (!verifyOriginalPreserved(targetXml, result.xml)) {
        toast({
          title: "Byte-Diff fehlgeschlagen",
          description: "Original-Bytes wurden verändert. Download abgebrochen.",
          variant: "destructive",
        });
        return;
      }

      // Download .Loxone
      const stamp = new Date().toISOString().slice(0, 10);
      const baseName = targetName.replace(/\.Loxone$/i, "") || "Kundenprojekt";
      const outName = `${baseName}_erweitert_${stamp}.Loxone`;

      const blob = new Blob([result.xml], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      a.click();
      URL.revokeObjectURL(url);

      // Download Report
      const rBlob = new Blob([result.report], { type: "text/plain" });
      const rUrl = URL.createObjectURL(rBlob);
      const rA = document.createElement("a");
      rA.href = rUrl;
      rA.download = `${baseName}_report_${stamp}.txt`;
      rA.click();
      URL.revokeObjectURL(rUrl);

      toast({ title: "Fertig", description: `${result.steps.length} Instanz(en) eingefügt.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const loadLatestMaster = async () => {
    setBusy(true);
    try {
      const { data: list, error } = await supabase.storage
        .from(BUCKET)
        .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      const latest = (list ?? []).find((f) => f.name && !f.name.startsWith("."));
      if (!latest) {
        toast({ title: "Keine Master-Datei vorhanden", description: "Bitte im Tab „Master-Projekt" hochladen.", variant: "destructive" });
        return;
      }
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(latest.name);
      if (dlErr || !blob) throw dlErr ?? new Error("Download fehlgeschlagen.");
      const file = new File([blob], latest.name, { type: "application/octet-stream" });
      await handleUpload(file);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Sicherheitshinweis</AlertTitle>
        <AlertDescription>
          Diese Datei muss vor dem Einsatz auf einem echten Miniserver zuerst in <strong>Loxone Config</strong>
          {" "}geöffnet und auf einem <strong>Test-Miniserver</strong> verifiziert werden.
          Nicht direkt auf ein Kundengerät hochladen.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5" /> 1. Ziel-Datei laden</CardTitle>
          <CardDescription>
            Lade dein bestehendes Kunden- oder Multiplikator-Projekt (<code>.Loxone</code>) hoch,
            oder starte mit der neuesten <strong>AICONO_Master</strong>-Datei aus dem Master-Projekt-Tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <Label htmlFor="inj-file">Datei</Label>
              <Input
                id="inj-file"
                ref={fileRef}
                type="file"
                accept=".Loxone,.loxone,application/octet-stream,text/xml,application/xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
            </div>
            <Button variant="outline" onClick={loadLatestMaster} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Neuestes Master-Projekt laden
            </Button>
          </div>
          {targetName && (
            <p className="text-xs text-muted-foreground">
              Geladen: <span className="font-mono">{targetName}</span> · {blocks.length} Baustein-Typ(en) erkannt
            </p>
          )}
        </CardContent>
      </Card>

      {blocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Puzzle className="h-5 w-5" /> 2. Instanzen wählen</CardTitle>
            <CardDescription>
              Trage pro Baustein-Typ die <strong>Anzahl neuer Instanzen</strong> ein. Die Instanz-Nummern
              werden automatisch fortlaufend hinter den bereits vorhandenen vergeben.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y border rounded-md">
              {blocks.map((b) => (
                <div key={b.type} className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">AICO_{b.type}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {b.elementCount} Objekt(e) je Instanz
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        vorhanden: {b.existingInstances.join(", ")}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`w-${b.type}`} className="text-xs text-muted-foreground">
                      Neue Instanzen
                    </Label>
                    <Input
                      id={`w-${b.type}`}
                      type="number"
                      min={0}
                      max={99}
                      value={wishes[b.type] ?? 0}
                      onChange={(e) =>
                        setWishes((prev) => ({ ...prev, [b.type]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-20"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (preview.steps.length > 0 || preview.errors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>3. Vorschau</CardTitle>
            <CardDescription>Prüfe, was in die Datei eingefügt wird — vor dem Download.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Nicht möglich</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 space-y-1">
                    {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {preview.steps.map((s) => (
              <div key={s.type} className="text-sm p-2 bg-muted/40 rounded">
                <span className="font-medium">AICO_{s.type}</span> — fügt Instanz{" "}
                <span className="font-mono">{s.newInstances.join(", ")}</span> hinzu
                {" "}({s.elementsPerInstance} Objekte je Instanz)
              </div>
            ))}
            <Button
              onClick={handleDownload}
              disabled={busy || preview.errors.length > 0 || preview.steps.length === 0}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Erweiterte .Loxone-Datei + Report herunterladen
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
