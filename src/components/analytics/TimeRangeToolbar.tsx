import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnalyticsPeriod } from "@/hooks/useAnalyticsData";

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "quarter", label: "Quartal" },
  { value: "year", label: "Jahr" },
];

interface TimeRangeToolbarProps {
  period: AnalyticsPeriod;
  offset: number;
  onPeriodChange: (p: AnalyticsPeriod) => void;
  onOffsetChange: (delta: number) => void;
}

export function TimeRangeToolbar({ period, offset, onPeriodChange, onOffsetChange }: TimeRangeToolbarProps) {
  return (
    <div className="flex items-center gap-2 bg-card/50 border rounded-lg p-1.5">
      <Select value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)}>
        <SelectTrigger className="w-32 h-8 text-xs bg-transparent border-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1 border-l pl-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOffsetChange(offset - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => onOffsetChange(0)}
          disabled={offset === 0}
        >
          Heute
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOffsetChange(offset + 1)} disabled={offset >= 0}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
