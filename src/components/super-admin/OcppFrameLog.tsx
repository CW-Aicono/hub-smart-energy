import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Download, Pause, Play } from "lucide-react";
import type { FrameLogEntry } from "@/lib/ocppSimulatorClient";

interface Props {
  entries: FrameLogEntry[];
  onClear: () => void;
}

export default function OcppFrameLog({ entries, onClear }: Props) {
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll || paused) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll, paused]);

  const visible = paused ? entries.slice(0, entries.length) : entries;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ocpp-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colorFor = (d: FrameLogEntry["direction"]) => {
    switch (d) {
      case "out": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "in": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "error": return "bg-destructive/15 text-destructive border-destructive/30";
      case "info":
      default: return "bg-muted text-muted-foreground border-muted";
    }
  };
  const iconFor = (d: FrameLogEntry["direction"]) => {
    switch (d) {
      case "out": return "↑";
      case "in": return "↓";
      case "error": return "⚠";
      default: return "•";
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-[300px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{entries.length} Einträge</span>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Auto-Scroll
          </label>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? <><Play className="h-3.5 w-3.5 mr-1" /> Weiter</> : <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</>}
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={entries.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={onClear} disabled={entries.length === 0}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Leeren
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 border rounded-md bg-background/50">
        <div ref={scrollRef} className="p-2 font-mono text-xs space-y-1 max-h-[500px] overflow-auto">
          {visible.length === 0 && (
            <p className="text-muted-foreground p-4 text-center">Keine Frames bisher. Verbinde dich und sende eine Nachricht.</p>
          )}
          {visible.map((e) => (
            <div key={e.id} className="flex items-start gap-2 hover:bg-muted/30 rounded px-1 py-0.5">
              <span className="text-muted-foreground shrink-0 w-20">
                {new Date(e.ts).toLocaleTimeString("de-DE", { hour12: false })}
              </span>
              <Badge variant="outline" className={`shrink-0 text-[10px] py-0 px-1 ${colorFor(e.direction)}`}>
                {iconFor(e.direction)} {e.action ?? e.direction.toUpperCase()}
              </Badge>
              <span className="break-all flex-1 text-foreground/90">{e.raw}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
