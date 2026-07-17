import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Download, Upload, Trash2, FileArchive, Info, Loader2 } from "lucide-react";

const BUCKET = "loxone-master";

interface MasterFile {
  name: string;
  size: number;
  updated_at: string;
  metadata?: any;
}

export default function LoxoneMasterProject() {
  const { toast } = useToast();
  const { isSuperAdmin } = useSuperAdmin();
  const [files, setFiles] = useState<MasterFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      setFiles([]);
    } else {
      setFiles((data ?? []).filter((f) => f.name && !f.name.startsWith(".")) as any);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({ title: "Keine Datei", description: "Bitte AICONO_Master.Loxone-Datei auswählen." });
      return;
    }
    if (!version.trim()) {
      toast({ title: "Version fehlt", description: "Bitte Versionsnummer eintragen (z. B. 1.2)." });
      return;
    }
    setUploading(true);
    const cleanVersion = version.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const ext = file.name.toLowerCase().endsWith(".loxone") ? "Loxone" : file.name.split(".").pop() || "Loxone";
    const path = `AICONO_Master_v${cleanVersion}_${timestamp}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: "application/octet-stream",
      upsert: false,
      metadata: { version: cleanVersion, notes: notes.trim() } as any,
    });
    setUploading(false);
    if (error) {
      toast({ title: "Upload fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Master-Projekt hochgeladen", description: `Version ${cleanVersion} steht bereit.` });
    setVersion("");
    setNotes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
  };

  const handleDownload = async (name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(name, 300, { download: name });
    if (error || !data?.signedUrl) {
      toast({ title: "Download fehlgeschlagen", description: error?.message ?? "Kein Link erhalten.", variant: "destructive" });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Datei „${name}" wirklich löschen?`)) return;
    const { error } = await supabase.storage.from(BUCKET).remove([name]);
    if (error) {
      toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gelöscht", description: name });
    await load();
  };

  const latest = files[0];
  const formatBytes = (b: number) => {
    if (!b) return "—";
    const mb = b / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(b / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>AICONO Master-Projekt (.Loxone)</AlertTitle>
        <AlertDescription>
          Das Master-Projekt enthält alle AICO_*-Bausteine (Gruppen A–F) fertig verdrahtet.
          Tenants öffnen die Datei parallel zum Kundenprojekt in Loxone Config und übernehmen die
          benötigten Bausteine per Copy &amp; Paste (Strg+C / Strg+V). Namen der virtuellen Eingänge
          dabei nicht ändern – nur die Instanz-Nummer anpassen. Neue Snippets werden zusätzlich
          weiterhin als einzelne XML-Vorlagen unter „Snippet-Pakete" bereitgestellt.
        </AlertDescription>
      </Alert>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Neue Version hochladen</CardTitle>
            <CardDescription>
              Nur Super-Admins. Datei muss die Endung <code>.Loxone</code> haben (Export aus Loxone Config).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="master-file">Datei</Label>
                <Input id="master-file" ref={fileInputRef} type="file" accept=".Loxone,.loxone,application/octet-stream" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="master-version">Version</Label>
                <Input id="master-version" placeholder="z. B. 1.2" value={version} onChange={(e) => setVersion(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="master-notes">Notizen (optional)</Label>
              <Input id="master-notes" placeholder="Was ist neu?" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Hochladen
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><FileArchive className="h-5 w-5" /> Verfügbare Versionen</CardTitle>
            <CardDescription>
              {latest ? "Neueste Version wird oben empfohlen." : "Noch keine Master-Datei hochgeladen."}
            </CardDescription>
          </div>
          {latest && (
            <Button onClick={() => handleDownload(latest.name)}>
              <Download className="h-4 w-4 mr-2" /> Neueste laden
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Datei vorhanden. {isSuperAdmin && "Bitte oben eine .Loxone-Datei hochladen."}
            </p>
          ) : (
            <div className="divide-y border rounded-md">
              {files.map((f, idx) => (
                <div key={f.name} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{f.name}</span>
                      {idx === 0 && <Badge className="text-[10px]">Aktuell</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBytes(f.metadata?.size ?? f.size ?? 0)} ·{" "}
                      {f.updated_at ? new Date(f.updated_at).toLocaleString("de-DE") : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleDownload(f.name)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Laden
                    </Button>
                    {isSuperAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(f.name)} title="Löschen">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
