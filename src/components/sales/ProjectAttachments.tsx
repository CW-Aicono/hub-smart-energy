import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Upload, FileText, Trash2, Paperclip, Loader2, ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Attachment {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  kategorie: string;
  created_at: string;
}

const KATEGORIEN: Record<string, string> = {
  grundriss: "Grundriss",
  rechnung: "Rechnung",
  foto: "Foto",
  sonstiges: "Sonstiges",
};

export function ProjectAttachments({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("sales_project_attachments")
      .select("id, file_path, file_name, content_type, file_size, kategorie, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Attachment[];
    setItems(list);
    setLoading(false);

    // Load signed URLs for image previews
    const imgs = list.filter((a) => a.content_type?.startsWith("image/"));
    const map: Record<string, string> = {};
    await Promise.all(
      imgs.map(async (a) => {
        const { data: signed } = await supabase.storage.from("sales-photos").createSignedUrl(a.file_path, 3600);
        if (signed?.signedUrl) map[a.id] = signed.signedUrl;
      })
    );
    setThumbs(map);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (file: File, kategorie: string) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const id = crypto.randomUUID();
    const path = `${user.id}/projects/${projectId}/${id}.${ext}`;

    const { error: upErr } = await supabase.storage.from("sales-photos").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (upErr) {
      setUploading(false);
      toast.error("Upload fehlgeschlagen", { description: upErr.message });
      return;
    }

    const { error: insErr } = await supabase.from("sales_project_attachments").insert({
      project_id: projectId,
      partner_id: user.id,
      file_path: path,
      file_name: file.name,
      content_type: file.type || null,
      file_size: file.size,
      kategorie,
    });
    setUploading(false);
    if (insErr) {
      toast.error("Speichern fehlgeschlagen", { description: insErr.message });
      return;
    }
    toast.success("Hochgeladen");
    load();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, kategorie: string) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleUpload(file, kategorie);
  };

  const openItem = async (a: Attachment) => {
    const { data } = await supabase.storage.from("sales-photos").createSignedUrl(a.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const updateKategorie = async (id: string, kategorie: string) => {
    const { error } = await supabase
      .from("sales_project_attachments")
      .update({ kategorie })
      .eq("id", id);
    if (error) {
      toast.error("Speichern fehlgeschlagen", { description: error.message });
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, kategorie } : it)));
  };

  const deleteItem = async (a: Attachment) => {
    await supabase.storage.from("sales-photos").remove([a.file_path]);
    const { error } = await supabase.from("sales_project_attachments").delete().eq("id", a.id);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Gelöscht");
    load();
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Dokumente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => cameraInput.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
            Kamera
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" /> Datei wählen
          </Button>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e, "foto")}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e, "sonstiges")}
          />
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground py-2 text-center">Lädt…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">
            Noch keine Dokumente. Lade Grundrisse, Rechnungen oder Fotos hoch.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => {
              const isImg = a.content_type?.startsWith("image/");
              return (
                <li key={a.id} className="flex items-center gap-2 rounded-md border bg-card p-2">
                  <button
                    type="button"
                    onClick={() => openItem(a)}
                    className="shrink-0 h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden"
                    aria-label="Vorschau öffnen"
                  >
                    {isImg && thumbs[a.id] ? (
                      <img src={thumbs[a.id]} alt={a.file_name} className="h-full w-full object-cover" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openItem(a)}
                      className="text-sm font-medium truncate text-left hover:underline flex items-center gap-1 w-full"
                    >
                      <span className="truncate">{a.file_name}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                    <select
                      value={a.kategorie}
                      onChange={(e) => updateKategorie(a.id, e.target.value)}
                      className="mt-0.5 h-6 text-xs rounded border border-input bg-background px-1"
                    >
                      {Object.entries(KATEGORIEN).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteItem(a)}>Löschen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
