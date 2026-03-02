import { LocationCompleteness } from "@/hooks/useDataCompleteness";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface DataCompletenessIndicatorProps {
  completeness: LocationCompleteness;
  compact?: boolean;
}

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function DataCompletenessIndicator({ completeness, compact }: DataCompletenessIndicatorProps) {
  const { completenessPercent, months } = completeness;

  const color =
    completenessPercent >= 80 ? "text-emerald-600" :
    completenessPercent >= 50 ? "text-amber-600" : "text-red-600";

  const bgColor =
    completenessPercent >= 80 ? "bg-emerald-100 text-emerald-800" :
    completenessPercent >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

  if (compact) {
    return (
      <Badge variant="outline" className={cn("text-xs", bgColor)}>
        {completenessPercent}%
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Datenqualität</span>
        <span className={cn("text-sm font-bold", color)}>{completenessPercent}%</span>
      </div>
      <div className="flex gap-1">
        {months.map((m, i) => {
          const mColor = m.hasData
            ? m.metersWithData >= m.meterCount ? "bg-emerald-500" : "bg-amber-400"
            : "bg-red-300";
          return (
            <div key={m.month} className="flex flex-col items-center gap-0.5">
              <div className={cn("h-4 w-4 rounded-sm", mColor)} title={`${MONTH_LABELS[i]}: ${m.metersWithData}/${m.meterCount} Zähler`} />
              <span className="text-[9px] text-muted-foreground">{MONTH_LABELS[i]}</span>
            </div>
          );
        })}
      </div>
      {completeness.missingMonths.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Fehlend: {completeness.missingMonths.join(", ")}
        </p>
      )}
    </div>
  );
}
