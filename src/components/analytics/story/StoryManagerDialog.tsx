import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoryStep } from "./storyTypes";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { ArrowUp, ArrowDown, Trash2, Plus, Play, Pencil, Camera, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  steps: StoryStep[];
  onStepsChange: (steps: StoryStep[]) => void;
  currentPeriod: AnalyticsPeriod;
  currentOffset: number;
  blocks: AnalysisBlock[];
  onPresent: (startIndex: number) => void;
}

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  custom: "Benutzerdefiniert",
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function StoryManagerDialog({
  open,
  onOpenChange,
  steps,
  onStepsChange,
  currentPeriod,
  currentOffset,
  blocks,
  onPresent,
}: Props) {
  const [editing, setEditing] = useState<StoryStep | null>(null);

  const captureCurrent = () => {
    const step: StoryStep = {
      id: makeId(),
      title: `Schritt ${steps.length + 1}`,
      description: "",
      period: currentPeriod,
      offset: currentOffset,
    };
    onStepsChange([...steps, step]);
    setEditing(step);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onStepsChange(next);
  };

  const remove = (id: string) => {
    onStepsChange(steps.filter((s) => s.id !== id));
  };

  const patch = (id: string, patch: Partial<StoryStep>) => {
    onStepsChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    if (editing?.id === id) setEditing({ ...editing, ...patch });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Story-Modus</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 pb-2 border-b">
            <Button size="sm" onClick={captureCurrent} className="gap-2">
              <Camera className="h-4 w-4" /> Aktuelle Ansicht als Schritt speichern
            </Button>
            <div className="text-xs text-muted-foreground ml-auto">
              {steps.length} Schritt{steps.length !== 1 ? "e" : ""}
            </div>
            {steps.length > 0 && (
              <Button size="sm" variant="default" className="gap-2" onClick={() => onPresent(0)}>
                <Play className="h-4 w-4" /> Präsentieren
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            {steps.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Noch keine Schritte. Passe Zeitraum und Ansicht an und klicke auf „Aktuelle Ansicht als Schritt speichern".
              </div>
            ) : (
              <ol className="space-y-2 py-2">
                {steps.map((s, idx) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-lg border bg-card/50 p-3"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                    <div className="flex flex-col shrink-0 mr-1">
                      <span className="text-[10px] text-muted-foreground">Schritt</span>
                      <span className="text-lg font-semibold leading-none">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.title || "Ohne Titel"}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {s.description}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {PERIOD_LABEL[s.period]} · Offset {s.offset}
                        {s.hiddenBlockIds?.length ? ` · ${s.hiddenBlockIds.length} Block(s) ausgeblendet` : ""}
                        {s.focusBlockIds?.length ? ` · ${s.focusBlockIds.length} fokussiert` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, 1)} disabled={idx === steps.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onPresent(idx)}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schritt bearbeiten</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Titel</Label>
                <Input value={editing.title} onChange={(e) => patch(editing.id, { title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Beschreibung / Notiz</Label>
                <Textarea
                  rows={3}
                  value={editing.description ?? ""}
                  onChange={(e) => patch(editing.id, { description: e.target.value })}
                  placeholder="Was soll das Publikum in diesem Schritt sehen?"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Zeitraum</Label>
                  <select
                    className="w-full h-9 text-sm rounded-md border bg-background px-2"
                    value={editing.period}
                    onChange={(e) => patch(editing.id, { period: e.target.value as AnalyticsPeriod })}
                  >
                    {(Object.keys(PERIOD_LABEL) as AnalyticsPeriod[]).map((p) => (
                      <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Offset</Label>
                  <Input
                    type="number" step="1"
                    value={editing.offset}
                    onChange={(e) => patch(editing.id, { offset: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {blocks.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Blöcke anzeigen</Label>
                  <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
                    {blocks.map((b) => {
                      const hidden = editing.hiddenBlockIds?.includes(b.id);
                      const focused = editing.focusBlockIds?.includes(b.id);
                      return (
                        <div key={b.id} className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            className={cn(
                              "flex-1 text-left truncate px-2 py-1 rounded border",
                              hidden ? "opacity-50 line-through" : "bg-card",
                              focused && !hidden ? "ring-2 ring-primary/60" : ""
                            )}
                            onClick={() => {
                              const isHidden = editing.hiddenBlockIds?.includes(b.id);
                              patch(editing.id, {
                                hiddenBlockIds: isHidden
                                  ? editing.hiddenBlockIds!.filter((x) => x !== b.id)
                                  : [...(editing.hiddenBlockIds ?? []), b.id],
                              });
                            }}
                          >
                            {b.title || b.type} <span className="text-muted-foreground">({b.type})</span>
                          </button>
                          <Button
                            variant={focused ? "default" : "outline"}
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              const isFocused = editing.focusBlockIds?.includes(b.id);
                              patch(editing.id, {
                                focusBlockIds: isFocused
                                  ? editing.focusBlockIds!.filter((x) => x !== b.id)
                                  : [...(editing.focusBlockIds ?? []), b.id],
                              });
                            }}
                          >
                            Fokus
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Klick auf einen Block-Namen: aus-/einblenden. „Fokus" hebt Blöcke während der Präsentation hervor.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Fertig</Button>
            {editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  patch(editing.id, { period: currentPeriod, offset: currentOffset });
                }}
              >
                Zeitraum aus Ansicht übernehmen
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
