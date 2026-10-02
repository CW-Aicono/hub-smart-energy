import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Activity, Upload, Loader2, FileText, AlertTriangle } from "lucide-react";

interface LocationRow {
  id: string;
  name: string;
}

interface ImportRow {
  id: string;
  file_name: string;
  status: string;
  rows_imported: number;
  rows_skipped: number;
  file_size_bytes: number | null;
  error_message: string | null;
  created_at: string;
  location_id: string | null;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return <Badge variant="success">Importiert</Badge>;
    case "parser_pending":
      return <Badge variant="secondary">Parser folgt</Badge>;
    case "failed":
      return <Badge variant="destructive">Fehlgeschlagen</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const formatBytes = (n: number | null): string => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 2 })} MB`;
};

export const SmartMeterImport = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [{ data: locs }, { data: imps }] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase
        .from("smart_meter_mscons_imports")
        .select("id, file_name, status, rows_imported, rows_skipped, file_size_bytes, error_message, created_at, location_id")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setLocations((locs as LocationRow[]) || []);
    setImports((imps as ImportRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: "Keine Datei ausgewählt", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (locationId) fd.append("location_id", locationId);

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-meter-mscons-import`;
      const res = await fetch(url, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Upload fehlgeschlagen", description: json?.error || res.statusText, variant: "destructive" });
      } else if (json?.deduplicated) {
        toast({ title: "Datei bereits importiert", description: "Identische Datei (Hash) wurde übersprungen." });
      } else {
        toast({
          title: "Upload erfolgreich",
          description: json?.note || "Datei wurde gespeichert.",
        });
      }
      if (fileRef.current) fileRef.current.value = "";
      await loadData();
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const locationName = (id: string | null) =>
    locations.find((l) => l.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-3 px-4 text-sm text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <span>
            Phase 1: Manueller MSCONS-Upload (EDIFACT) vom Messstellenbetreiber.
            Der EDIFACT-Parser wird mit einer echten Beispieldatei testgetrieben
            ergänzt – aktuell werden Uploads nur protokolliert
            (Status „Parser folgt"). Die §50-MsbG-Einwilligung des Anschlussnutzers
            muss vor dem Import vorliegen.
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> MSCONS-Datei hochladen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="sm-location">Liegenschaft (optional)</Label>
              <Select value={locationId || "_none"} onValueChange={(v) => setLocationId(v === "_none" ? "" : v)}>
                <SelectTrigger id="sm-location">
                  <SelectValue placeholder="Liegenschaft wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Keine Zuordnung —</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sm-file">MSCONS-Datei (.edi, .txt, .xml)</Label>
              <Input id="sm-file" type="file" ref={fileRef} accept=".edi,.txt,.xml,.mscons" />
            </div>
          </div>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lade hoch …
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Hochladen
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Import-Verlauf
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : imports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Activity className="h-8 w-8 mb-2" />
              <p>Noch keine Importe vorhanden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                    <th className="py-2 pr-3">Datum</th>
                    <th className="py-2 pr-3">Datei</th>
                    <th className="py-2 pr-3">Liegenschaft</th>
                    <th className="py-2 pr-3">Größe</th>
                    <th className="py-2 pr-3">Zeilen</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("de-DE")}
                      </td>
                      <td className="py-2 pr-3 max-w-[240px] truncate" title={row.file_name}>
                        {row.file_name}
                      </td>
                      <td className="py-2 pr-3">{locationName(row.location_id)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatBytes(row.file_size_bytes)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {row.rows_imported.toLocaleString("de-DE")}
                        {row.rows_skipped > 0 && (
                          <span className="text-muted-foreground"> / {row.rows_skipped.toLocaleString("de-DE")} übersprungen</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {statusBadge(row.status)}
                        {row.error_message && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-[300px]">
                            {row.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
