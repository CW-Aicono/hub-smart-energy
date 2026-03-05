import { useState, useEffect } from "react";
import { useLegalPages } from "@/hooks/useLegalPages";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Save, Shield } from "lucide-react";

const PAGES = [
  { key: "datenschutz", label: "Datenschutzerklärung", icon: Shield },
  { key: "impressum", label: "Impressum", icon: FileText },
] as const;

export function LegalPagesSettings() {
  const { data: pages, isLoading, upsert } = useLegalPages();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rechtliche Seiten
        </CardTitle>
        <CardDescription>
          Pflegen Sie hier die Inhalte für Datenschutzerklärung und Impressum. 
          Diese werden auf den öffentlichen Seiten und im Cookie-Banner verlinkt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse text-muted-foreground text-sm">Laden…</div>
        ) : (
          <Tabs defaultValue="datenschutz">
            <TabsList>
              {PAGES.map((p) => (
                <TabsTrigger key={p.key} value={p.key} className="gap-2">
                  <p.icon className="h-4 w-4" />
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {PAGES.map((p) => (
              <TabsContent key={p.key} value={p.key}>
                <LegalPageEditor
                  pageKey={p.key}
                  label={p.label}
                  existing={pages?.find((pg) => pg.page_key === p.key) ?? null}
                  onSave={(title, html) => upsert.mutate({ pageKey: p.key, title, contentHtml: html })}
                  saving={upsert.isPending}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function LegalPageEditor({
  pageKey,
  label,
  existing,
  onSave,
  saving,
}: {
  pageKey: string;
  label: string;
  existing: { title: string; content_html: string; updated_at: string } | null;
  onSave: (title: string, html: string) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(existing?.title ?? label);
  const [content, setContent] = useState(existing?.content_html ?? "");

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setContent(existing.content_html);
    }
  }, [existing]);

  return (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor={`${pageKey}-title`}>Seitentitel</Label>
        <Input
          id={`${pageKey}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={label}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${pageKey}-content`}>Inhalt</Label>
        <RichTextEditor
          content={content}
          onChange={(html) => setContent(html)}
        />
      </div>
      {existing?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Zuletzt aktualisiert: {new Date(existing.updated_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      <Button onClick={() => onSave(title, content)} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Speichern…" : "Speichern"}
      </Button>
    </div>
  );
}
