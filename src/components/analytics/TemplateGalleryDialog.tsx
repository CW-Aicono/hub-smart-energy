import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Search, Trash2, LayoutTemplate } from "lucide-react";
import { AnalysisTemplate, useAnalysisTemplates } from "@/hooks/useAnalysisTemplates";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";

interface TemplateGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (blocks: AnalysisBlock[], layout: Record<string, unknown>, name: string) => void;
}

export function TemplateGalleryDialog({ open, onOpenChange, onSelectTemplate }: TemplateGalleryDialogProps) {
  const { templates, isLoading, removeTemplate } = useAnalysisTemplates();
  const [search, setSearch] = useState("");

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  const systemTemplates = filtered.filter((t) => t.is_system);
  const tenantTemplates = filtered.filter((t) => !t.is_system);

  const handlePick = (t: AnalysisTemplate) => {
    // Clone blocks with fresh IDs to prevent collisions
    const cloned = t.blocks.map((b) => ({
      ...b,
      id: `${b.id}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    onSelectTemplate(cloned, t.layout ?? {}, t.name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" /> Vorlagen-Galerie
          </DialogTitle>
          <DialogDescription>
            Starte mit einer fertigen Analyse — Blöcke und Layout werden übernommen, Geräte weist du danach zu.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Beschreibung oder Kategorie…"
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {isLoading && <div className="text-sm text-muted-foreground py-8 text-center">Lade Vorlagen…</div>}

          {systemTemplates.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> System-Vorlagen
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {systemTemplates.map((t) => (
                  <TemplateCard key={t.id} template={t} onPick={handlePick} />
                ))}
              </div>
            </section>
          )}

          {tenantTemplates.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Eigene Vorlagen
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {tenantTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onPick={handlePick}
                    onDelete={() => removeTemplate(t.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Keine passenden Vorlagen gefunden.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  onPick,
  onDelete,
}: {
  template: AnalysisTemplate;
  onPick: (t: AnalysisTemplate) => void;
  onDelete?: () => void;
}) {
  return (
    <Card className="p-3 flex flex-col gap-2 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{template.name}</div>
          {template.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{template.description}</p>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {template.category}
        </Badge>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {template.blocks.length} Block{template.blocks.length !== 1 ? "s" : ""}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => onPick(template)}>
          Verwenden
        </Button>
        {onDelete && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
