import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import {
  RoadmapItem,
  roadmapScore,
  useRoadmapHistory,
} from "@/hooks/useRoadmapItems";
import { CATEGORY_LABELS, STATUS_LABELS } from "./constants";

interface Props {
  item: RoadmapItem | null;
  isNew?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (values: Partial<RoadmapItem> & { id?: string }) => void;
}

const emptyDraft: Partial<RoadmapItem> = {
  title: "",
  description: "",
  category: "feature",
  status: "backlog",
  impact: 3,
  effort: 3,
  risk: 3,
  owner: "",
  due_date: null,
  plan_ref: "",
};

export default function RoadmapItemSheet({ item, isNew, open, onOpenChange, onSave }: Props) {
  const [draft, setDraft] = useState<Partial<RoadmapItem>>(emptyDraft);
  const { data: history } = useRoadmapHistory(!isNew && item ? item.id : null);

  useEffect(() => {
    if (open) setDraft(isNew || !item ? { ...emptyDraft } : { ...item });
  }, [open, item, isNew]);

  const set = (patch: Partial<RoadmapItem>) => setDraft((d) => ({ ...d, ...patch }));

  const score = roadmapScore({
    impact: draft.impact ?? 3,
    effort: draft.effort ?? 3,
    risk: draft.risk ?? 3,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isNew ? "Neuer Roadmap-Eintrag" : "Eintrag bearbeiten"}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rm-title">Titel</Label>
            <Input id="rm-title" value={draft.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rm-desc">Beschreibung</Label>
            <Textarea id="rm-desc" rows={4} value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kategorie</Label>
              <Select value={draft.category ?? "feature"} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={draft.status ?? "backlog"} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {([
            ["impact", "Wirkung"],
            ["effort", "Aufwand"],
            ["risk", "Risiko"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="text-sm text-muted-foreground">
                  {(draft[key] as number | undefined)?.toLocaleString("de-DE") ?? "3"} / 5
                </span>
              </div>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[(draft[key] as number | undefined) ?? 3]}
                onValueChange={([v]) => set({ [key]: v } as Partial<RoadmapItem>)}
              />
            </div>
          ))}

          <div className="rounded-lg border p-3 text-sm">
            Rang-Score: <strong>{score.toLocaleString("de-DE")}</strong>
            <span className="text-muted-foreground"> (Wirkung und Risiko im Verhältnis zum Aufwand)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rm-owner">Verantwortlich</Label>
              <Input id="rm-owner" value={draft.owner ?? ""} onChange={(e) => set({ owner: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-due">Fällig bis</Label>
              <Input
                id="rm-due"
                type="date"
                value={draft.due_date ?? ""}
                onChange={(e) => set({ due_date: e.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rm-plan">Plan-Referenz</Label>
            <Input id="rm-plan" value={draft.plan_ref ?? ""} onChange={(e) => set({ plan_ref: e.target.value })} />
          </div>

          {!isNew && history && history.length > 0 && (
            <div className="space-y-2">
              <Label>Historie</Label>
              <div className="space-y-1 text-sm text-muted-foreground">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-wrap gap-2">
                    <Badge variant="outline">{format(new Date(h.created_at), "dd.MM.yyyy HH:mm")}</Badge>
                    <span>{h.field}: {h.old_value ?? "—"} → {h.new_value ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button
              disabled={!draft.title?.trim()}
              onClick={() => {
                onSave(isNew ? draft : { ...draft, id: item!.id });
                onOpenChange(false);
              }}
            >
              Speichern
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
