import { useState, useCallback } from "react";
import { AnalysisBlock as AnalysisBlockType } from "@/hooks/useAnalysisWorkspaces";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlockCard } from "./AnalysisBlock";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, Pencil, LineChart, BarChart3, Table2, Flame } from "lucide-react";
import { DeviceTreeNode } from "@/hooks/useDeviceTree";
import { cn } from "@/lib/utils";

const GRID_COLS = 12;
const ROW_HEIGHT = 160;

interface AnalyticsCanvasProps {
  blocks: AnalysisBlockType[];
  period: AnalyticsPeriod;
  offset: number;
  editMode: boolean;
  onBlocksChange: (blocks: AnalysisBlockType[]) => void;
  onEditModeChange: (v: boolean) => void;
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

export function AnalyticsCanvas({
  blocks,
  period,
  offset,
  editMode,
  onBlocksChange,
  onEditModeChange,
}: AnalyticsCanvasProps) {
  const [draggedNode, setDraggedNode] = useState<DeviceTreeNode | null>(null);

  const addBlock = (type: AnalysisBlockType["type"]) => {
    const block: AnalysisBlockType = {
      id: makeId(),
      type,
      title: type === "timeseries" ? "Zeitreihe" : type === "kpi" ? "KPI" : type === "comparison" ? "Vergleich" : type === "heatmap" ? "Heatmap" : "Formel",
      x: 0,
      y: Math.max(0, ...blocks.map((b) => b.y + b.h)),
      w: type === "kpi" ? 3 : type === "heatmap" ? 6 : 6,
      h: type === "kpi" ? 1 : 2,
      config: {},
    };
    onBlocksChange([...blocks, block]);
  };

  const updateBlock = (id: string, patch: Partial<AnalysisBlockType>) => {
    onBlocksChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== id));
  };

  const handleDrop = (e: React.DragEvent, targetBlock: AnalysisBlockType) => {
    e.preventDefault();
    if (!draggedNode) return;

    const existing = targetBlock.config.meterIds as string[] | undefined;
    const nextIds = [...new Set([...(existing ?? []), draggedNode.id])];
    updateBlock(targetBlock.id, {
      config: { ...targetBlock.config, meterIds: nextIds },
      title: targetBlock.title || `${draggedNode.label}`,
    });
    setDraggedNode(null);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card/30">
        <div className="flex items-center gap-2">
          <Button variant={editMode ? "default" : "outline"} size="sm" className="gap-2" onClick={() => onEditModeChange(!editMode)}>
            <Pencil className="h-4 w-4" />
            {editMode ? "Fertig" : "Bearbeiten"}
          </Button>
          {editMode && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => addBlock("timeseries")}>
                <LineChart className="h-4 w-4" /> Zeitreihe
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => addBlock("kpi")}>
                <Table2 className="h-4 w-4" /> KPI
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => addBlock("comparison")}>
                <BarChart3 className="h-4 w-4" /> Vergleich
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => addBlock("heatmap")}>
                <Flame className="h-4 w-4" /> Heatmap
              </Button>
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {blocks.length} Block{blocks.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridAutoRows: `${ROW_HEIGHT}px` }}
        >
          {blocks.map((block) => (
            <div
              key={block.id}
              onDrop={(e) => handleDrop(e, block)}
              onDragOver={handleDragOver}
              className={cn("col-span-full", block.w <= 3 ? "md:col-span-3" : block.w <= 6 ? "md:col-span-6" : "md:col-span-12")}
              style={{ gridRow: `span ${block.h}` }}
            >
              <AnalysisBlockCard
                block={block}
                period={period}
                offset={offset}
                isEditMode={editMode}
                onRemove={removeBlock}
                onConfigChange={(id, config) => updateBlock(id, { config })}
              />
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center h-96 text-muted-foreground border-2 border-dashed rounded-xl">
              <LayoutGrid className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Noch keine Analyse-Blöcke</p>
              <p className="text-xs mt-1">Schalte „Bearbeiten" ein und füge Blöcke hinzu, oder ziehe Geräte aus der Bibliothek.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
