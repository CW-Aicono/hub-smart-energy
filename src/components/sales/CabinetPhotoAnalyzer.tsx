import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, Loader2, Sparkles, Image as ImageIcon, Check, X } from "lucide-react";

interface Suggestion {
  bezeichnung: string;
  energieart: string;
  phasen: number;
  strombereich_a: number;
  anwendungsfall: string;
  montage: string;
  hinweise?: string;
}

interface KiAnalyse {
  zusammenfassung?: string;
  erkannte_sicherungen?: number;
  freie_hutschienen_plaetze?: number;
  vorschlaege?: Suggestion[];
}

interface Props {
  distributionId: string;
  fotoUrl: string | null;
  kiAnalyse: KiAnalyse | null;
  onUpdated: () => void;
}

export function CabinetPhotoAnalyzer({ distributionId, fotoUrl, kiAnalyse, onUpdated }: Props) {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPreview = async (path: string) => {
    const { data } = await supabase.storage
      .from("sales-photos")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
  };

  // Initialer Preview-Load
  if (fotoUrl && !previewUrl) {
    loadPreview(fotoUrl);
  }

  const handleUpload = async (file: File) => {
    setUploading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      toast.error("Nicht angemeldet");
      setUploading(false);
      return;
    }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userRes.user.id}/${distributionId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("sales-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast.error("Upload fehlgeschlagen", { description: error.message });
      setUploading(false);
      return;
    }
    await supabase
      .from("sales_distributions")
      .update({ foto_url: path })
      .eq("id", distributionId);
    await loadPreview(path);
    setUploading(false);
    toast.success("Foto hochgeladen");
    onUpdated();
  };

  const handleAnalyze = async () => {
    if (!fotoUrl) {
      toast.error("Erst Foto hochladen");
      return;
    }
    setAnalyzing(true);
    const { data, error } = await supabase.functions.invoke("sales-analyze-cabinet", {
      body: { distribution_id: distributionId, image_path: fotoUrl },
    });
    setAnalyzing(false);
    if (error) {
      toast.error("KI-Analyse fehlgeschlagen", { description: error.message });
      return;
    }
    if ((data as { error?: string })?.error) {
      toast.error("KI-Analyse fehlgeschlagen", { description: (data as { error: string }).error });
      return;
    }
    toast.success("KI-Vorschläge erstellt");
    onUpdated();
  };

  const handleAcceptSuggestion = async (idx: number, s: Suggestion) => {
    setAccepting(idx);
    const { error } = await supabase.from("sales_measurement_points").insert({
      distribution_id: distributionId,
      bezeichnung: s.bezeichnung,
      energieart: s.energieart,
      phasen: s.phasen,
      strombereich_a: s.strombereich_a,
      anwendungsfall: s.anwendungsfall,
      montage: s.montage,
      hinweise: s.hinweise ?? null,
      bestand: false,
    });
    setAccepting(null);
    if (error) {
      toast.error("Übernehmen fehlgeschlagen", { description: error.message });
      return;
    }
    // Vorschlag aus Liste entfernen
    if (kiAnalyse?.vorschlaege) {
      const remaining = kiAnalyse.vorschlaege.filter((_, i) => i !== idx);
      await supabase
        .from("sales_distributions")
        .update({
          ki_analyse: { ...kiAnalyse, vorschlaege: remaining } as never,
        })
        .eq("id", distributionId);
    }
    toast.success("Messpunkt angelegt");
    onUpdated();
  };

  const handleDismissSuggestion = async (idx: number) => {
    if (!kiAnalyse?.vorschlaege) return;
    const remaining = kiAnalyse.vorschlaege.filter((_, i) => i !== idx);
    await supabase
      .from("sales_distributions")
      .update({
        ki_analyse: { ...kiAnalyse, vorschlaege: remaining } as never,
      })
      .eq("id", distributionId);
    onUpdated();
  };

  const suggestions = kiAnalyse?.vorschlaege ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-1" />
          )}
          {fotoUrl ? "Foto ersetzen" : "Foto aufnehmen"}
        </Button>
        {fotoUrl && (
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex-1"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            KI-Analyse
          </Button>
        )}
      </div>

      {previewUrl && (
        <div className="rounded-md overflow-hidden border bg-muted">
          <img src={previewUrl} alt="Schaltschrank" className="w-full max-h-64 object-contain" />
        </div>
      )}

      {!previewUrl && !fotoUrl && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 p-3 rounded-md border border-dashed">
          <ImageIcon className="h-4 w-4" />
          Foto vom Schaltschrank für KI-gestützte Messpunkt-Erkennung.
        </div>
      )}

      {kiAnalyse?.zusammenfassung && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 text-xs space-y-1">
            <div className="font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> KI-Erkennung
            </div>
            <p className="text-muted-foreground">{kiAnalyse.zusammenfassung}</p>
            <div className="flex gap-2 flex-wrap">
              {kiAnalyse.erkannte_sicherungen != null && (
                <Badge variant="secondary" className="text-xs">
                  {kiAnalyse.erkannte_sicherungen} Sicherungen
                </Badge>
              )}
              {kiAnalyse.freie_hutschienen_plaetze != null && (
                <Badge variant="secondary" className="text-xs">
                  {kiAnalyse.freie_hutschienen_plaetze} Plätze frei
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Vorgeschlagene Messpunkte ({suggestions.length})
          </div>
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              className="rounded-md border bg-card p-2.5 flex items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{s.bezeichnung}</div>
                <div className="text-xs text-muted-foreground">
                  {s.phasen}-phasig · ≤{s.strombereich_a}A · {s.anwendungsfall} · {s.montage}
                </div>
                {s.hinweise && (
                  <div className="text-xs text-muted-foreground italic mt-0.5">
                    {s.hinweise}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => handleAcceptSuggestion(idx, s)}
                  disabled={accepting === idx}
                >
                  {accepting === idx ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => handleDismissSuggestion(idx)}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
