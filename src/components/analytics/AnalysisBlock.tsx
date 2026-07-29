import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Move, Settings } from "lucide-react";
import { AnalysisBlock as AnalysisBlockType } from "@/hooks/useAnalysisWorkspaces";
import { TimeSeriesBlock } from "./blocks/TimeSeriesBlock";
import { KpiBlock } from "./blocks/KpiBlock";
import { ComparisonBlock } from "./blocks/ComparisonBlock";
import { HeatmapBlock } from "./blocks/HeatmapBlock";
import { CorrelationBlock } from "./blocks/CorrelationBlock";
import { FormulaBlock } from "./blocks/FormulaBlock";
import { AiInsightBlock } from "./blocks/AiInsightBlock";
import { SimulationBlock } from "./blocks/SimulationBlock";
import { cn } from "@/lib/utils";

interface AnalysisBlockProps {
  block: AnalysisBlockType;
  period: import("@/hooks/useAnalyticsData").AnalyticsPeriod;
  offset: number;
  isEditMode: boolean;
  onRemove: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  allBlocks?: AnalysisBlockType[];
}

export function AnalysisBlockCard({ block, period, offset, isEditMode, onRemove, onConfigChange, allBlocks }: AnalysisBlockProps) {
  const title = block.title || "Analyse";

  const content = useMemo(() => {
    switch (block.type) {
      case "timeseries":
        return <TimeSeriesBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "kpi":
        return <KpiBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "comparison":
        return <ComparisonBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "heatmap":
        return <HeatmapBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "correlation":
        return <CorrelationBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "formula":
        return <FormulaBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "simulation":
        return <SimulationBlock block={block} period={period} offset={offset} onConfigChange={onConfigChange} />;
      case "ai_insight":
        return (
          <AiInsightBlock
            block={block}
            period={period}
            offset={offset}
            onConfigChange={onConfigChange}
            allBlocks={allBlocks ?? []}
          />
        );
      default:
        return <div className="text-sm text-muted-foreground p-4">Nicht implementierter Blocktyp</div>;
    }
  }, [block, period, offset, onConfigChange, allBlocks]);

  return (
    <Card
      className={cn(
        "relative h-full flex flex-col overflow-hidden bg-card border transition-shadow",
        isEditMode ? "ring-1 ring-dashed ring-primary/40" : "hover:shadow-md"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {isEditMode && <Move className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />}
          <span className="text-xs font-semibold truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {isEditMode && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(block.id)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 p-3">{content}</div>
    </Card>
  );
}
