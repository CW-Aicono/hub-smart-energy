import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Trash2, ArrowUp, ArrowDown, Image as ImageIcon } from "lucide-react";
import type { ManualImage, ManualSection, ManualImageWidth } from "@/lib/loxone/generateManualPdf";

interface Props {
  templateKey: string;
  section: ManualSection;
  label: string;
}

export function ManualSectionImages({ templateKey, section, label }: Props) {
  const { toast } = useToast();
  const [images, setImages] = useState<ManualImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loxone_snippet_manual_images")
      .select("*")
      .eq("template_key", templateKey)
      .eq("section", section)
      .order("sort_order", { ascending: true });
    if (error) {
      toast({ title: "Fehler beim Laden", description: error.message, variant: "destructive" });
    }
    const list = (data ?? []) as ManualImage[];
    setImages(list);
    const map: Record<string, string> = {};
    await Promise.all(
      list.map(async (img) => {
        const { data: s } = await supabase.storage
          .from("loxone-manuals")
          .createSignedUrl(img.storage_path, 600);
        if (s?.signedUrl) map[img.id] = s.signedUrl;
      }),
    );
    setThumbs(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, section]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${templateKey}/${section}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("loxone-manuals")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: userRes } = await supabase.auth.getUser();
      const nextOrder = images.length > 0 ? Math.max(...images.map((i) => i.sort_order)) + 10 : 10;
      const { error: insErr } = await supabase.from("loxone_snippet_manual_images").insert({
        template_key: templateKey,
        section,
        storage_path: path,
        width: "full" as ManualImageWidth,
        sort_order: nextOrder,
        caption: null,
        updated_by: userRes.user?.id ?? null,
      });
      if (insErr) throw insErr;
      toast({ title: "Bild hinzugefügt" });
      await load();
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const updateImage = async (id: string, patch: Partial<ManualImage>) => {
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { signed_url: _ignored, ...dbPatch } = patch as Partial<ManualImage> & { signed_url?: string };
    const { error } = await supabase
      .from("loxone_snippet_manual_images")
      .update(dbPatch)
      .eq("id", id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
  };

  const deleteImage = async (img: ManualImage) => {
    if (!confirm("Bild wirklich löschen?")) return;
    await supabase.storage.from("loxone-manuals").remove([img.storage_path]);
    const { error } = await supabase.from("loxone_snippet_manual_images").delete().eq("id", img.id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    await load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const a = images[index];
    const b = images[target];
    await Promise.all([
      supabase.from("loxone_snippet_manual_images").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("loxone_snippet_manual_images").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    await load();
  };

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium flex items-center gap-2">
          <ImageIcon className="h-3.5 w-3.5" /> Bilder für „{label}"
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <Button asChild size="sm" variant="outline" disabled={uploading}>
            <span>
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Bild hochladen
            </span>
          </Button>
        </label>
      </div>

      {images.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">Noch keine Bilder in diesem Abschnitt.</p>
      )}

      {images.map((img, idx) => (
        <div key={img.id} className="flex gap-3 items-start bg-background p-2 rounded-md border">
          <img
            src={thumbs[img.id]}
            alt=""
            className="w-24 h-16 object-cover rounded border bg-muted"
          />
          <div className="flex-1 space-y-2 min-w-0">
            <Input
              placeholder="Bildunterschrift (optional)"
              value={img.caption ?? ""}
              onChange={(e) => updateImage(img.id, { caption: e.target.value })}
              className="h-8 text-xs"
            />
            <div className="flex gap-2 items-center">
              <Select
                value={img.width}
                onValueChange={(v) => updateImage(img.id, { width: v as ManualImageWidth })}
              >
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Klein</SelectItem>
                  <SelectItem value="medium">Mittel</SelectItem>
                  <SelectItem value="full">Volle Breite</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => move(idx, 1)}
                disabled={idx === images.length - 1}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteImage(img)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
