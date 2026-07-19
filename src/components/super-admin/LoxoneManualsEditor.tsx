import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download, Save, Sparkles } from "lucide-react";
import { ALL_SNIPPETS } from "@/lib/loxone/snippetsCatalog";
import {
  buildManualSkeleton,
  downloadManualPdf,
  type ManualDoc,
  type ManualImage,
} from "@/lib/loxone/generateManualPdf";
import { ManualSectionImages } from "./ManualSectionImages";

export default function LoxoneManualsEditor() {
  const { toast } = useToast();
  const [manuals, setManuals] = useState<Record<string, ManualDoc>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("loxone_snippet_manuals").select("*");
    if (error) {
      toast({ title: "Fehler beim Laden", description: error.message, variant: "destructive" });
    }
    const map: Record<string, ManualDoc> = {};
    for (const row of (data ?? []) as ManualDoc[]) map[row.template_key] = row;
    setManuals(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_SNIPPETS.filter((s) =>
      !q || s.templateKey.toLowerCase().includes(q) || s.title.toLowerCase().includes(q),
    ).map((s) => {
      const existing = manuals[s.templateKey];
      return {
        templateKey: s.templateKey,
        title: s.title,
        version: existing?.version ?? null,
        edited: !!existing && existing.version > 1,
        seeded: !!existing,
      };
    });
  }, [manuals, search]);

  const seedMissing = async () => {
    setSaving(true);
    try {
      const missing = ALL_SNIPPETS.filter((s) => !manuals[s.templateKey]);
      if (missing.length === 0) {
        toast({ title: "Nichts zu tun", description: "Alle Bausteine haben bereits einen v1-Eintrag." });
        return;
      }
      const rows = missing.map((s) => buildManualSkeleton(s.templateKey));
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      const { error } = await supabase
        .from("loxone_snippet_manuals")
        .upsert(rows.map((r) => ({ ...r, updated_by: uid })), { onConflict: "template_key" });
      if (error) throw error;
      toast({ title: "v1-Skelette angelegt", description: `${rows.length} Bausteine.` });
      await load();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selected = selectedKey ? manuals[selectedKey] ?? null : null;

  const startEditFor = (key: string) => {
    setSelectedKey(key);
    if (!manuals[key]) {
      const skel = buildManualSkeleton(key);
      setManuals((m) => ({
        ...m,
        [key]: { ...skel, updated_at: new Date().toISOString() },
      }));
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      const nextVersion = (selected.version ?? 1) + 1;
      const payload = {
        template_key: selected.template_key,
        title: selected.title,
        purpose_md: selected.purpose_md,
        wiring_md: selected.wiring_md,
        test_md: selected.test_md,
        version: nextVersion,
        updated_by: uid,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("loxone_snippet_manuals")
        .upsert(payload, { onConflict: "template_key" });
      if (error) throw error;
      toast({ title: "Gespeichert", description: `Neue Version v${nextVersion}` });
      await load();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof ManualDoc, value: string) => {
    if (!selected) return;
    setManuals((m) => ({ ...m, [selected.template_key]: { ...selected, [field]: value } }));
  };

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bausteine</CardTitle>
          <CardDescription className="text-xs">
            {Object.keys(manuals).length} von {ALL_SNIPPETS.length} mit Anleitung
          </CardDescription>
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
            <Button size="sm" variant="outline" onClick={seedMissing} disabled={saving} title="Fehlende v1-Skelette anlegen">
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {list.map((item) => (
            <button
              key={item.templateKey}
              onClick={() => startEditFor(item.templateKey)}
              className={`w-full text-left rounded-md px-2 py-1.5 hover:bg-muted transition text-xs ${
                selectedKey === item.templateKey ? "bg-muted" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">{item.title}</span>
              </div>
              <div className="flex items-center gap-1 pl-5 mt-0.5">
                <span className="text-muted-foreground truncate">{item.templateKey}</span>
                {item.seeded ? (
                  item.edited ? (
                    <Badge variant="default" className="text-[9px] h-4">v{item.version}</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] h-4">Skelett</Badge>
                  )
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4">neu</Badge>
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        {!selected ? (
          <CardContent className="p-8 text-sm text-muted-foreground">
            Bitte links einen Baustein wählen.
          </CardContent>
        ) : (
          <>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">{selected.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {selected.template_key} · v{selected.version}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadManualPdf(selected)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> PDF-Vorschau
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Speichern (v{(selected.version ?? 1) + 1})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium">Titel</label>
                <Input value={selected.title} onChange={(e) => updateField("title", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium">Zweck des Bausteins</label>
                <Textarea
                  rows={5}
                  value={selected.purpose_md}
                  onChange={(e) => updateField("purpose_md", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Einrichtung im Miniserver (Verdrahtung)</label>
                <Textarea
                  rows={8}
                  value={selected.wiring_md}
                  onChange={(e) => updateField("wiring_md", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Test & Inbetriebnahme</label>
                <Textarea
                  rows={6}
                  value={selected.test_md}
                  onChange={(e) => updateField("test_md", e.target.value)}
                />
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
