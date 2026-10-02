import { useEffect, useMemo, useState } from "react";
import { StoryStep } from "./storyTypes";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { AnalyticsCanvas } from "@/components/analytics/AnalyticsCanvas";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  steps: StoryStep[];
  startIndex: number;
  blocks: AnalysisBlock[];
}

export function StoryPresenter({ open, onClose, steps, startIndex, blocks }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(startIndex, 0), Math.max(steps.length - 1, 0)));
  }, [open, startIndex, steps.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, steps.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Home") {
        setIndex(0);
      } else if (e.key === "End") {
        setIndex(steps.length - 1);
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, onClose]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFs(true);
      } else {
        await document.exitFullscreen();
        setFs(false);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const step = steps[index];

  const visibleBlocks = useMemo(() => {
    if (!step) return blocks;
    const hidden = new Set(step.hiddenBlockIds ?? []);
    const focus = new Set(step.focusBlockIds ?? []);
    let list = blocks.filter((b) => !hidden.has(b.id));
    if (focus.size > 0) {
      list = list.filter((b) => focus.has(b.id));
    }
    return list;
  }, [blocks, step]);

  if (!open || !step) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Top bar */}
      <div className="h-14 border-b bg-card/60 backdrop-blur px-4 flex items-center gap-3 shrink-0">
        <div className="text-xs font-mono text-muted-foreground">
          {index + 1} / {steps.length}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{step.title || "Ohne Titel"}</div>
          {step.description && (
            <div className="text-xs text-muted-foreground truncate">{step.description}</div>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen} title="Vollbild (F)">
          {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Schließen (Esc)">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Full description banner if long */}
      {step.description && step.description.length > 60 && (
        <div className="px-4 py-2 border-b bg-primary/5 text-sm">
          {step.description}
        </div>
      )}

      {/* Canvas (read-only) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnalyticsCanvas
          blocks={visibleBlocks}
          period={step.period}
          offset={step.offset}
          editMode={false}
          onBlocksChange={() => {}}
          onEditModeChange={() => {}}
        />
      </div>

      {/* Nav controls */}
      <div className="h-14 border-t bg-card/60 backdrop-blur px-4 flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
        >
          <ChevronLeft className="h-4 w-4" /> Zurück
        </Button>

        <div className="flex-1 flex items-center gap-1 justify-center flex-wrap">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index ? "w-8 bg-primary" : "w-2 bg-muted hover:bg-muted-foreground/50"
              )}
              title={`${i + 1}. ${s.title}`}
            />
          ))}
        </div>

        <Button
          size="sm"
          className="gap-2"
          onClick={() => setIndex((i) => Math.min(i + 1, steps.length - 1))}
          disabled={index === steps.length - 1}
        >
          Weiter <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
