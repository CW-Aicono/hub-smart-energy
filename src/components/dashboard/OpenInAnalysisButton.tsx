import { useNavigate } from "react-router-dom";
import { LineChart as LineChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildAnalysisUrl, Preset } from "@/lib/energyAnalysisState";

const PERIOD_TO_PRESET: Record<string, Preset> = {
  day: "today", week: "7d", month: "month", quarter: "30d", year: "year", all: "lastYear",
};

/** Öffnet die Messstellen dieser Grafik in der Energieanalyse. */
export function OpenInAnalysisButton({ meterIds, period }: { meterIds: string[]; period?: string }) {
  const navigate = useNavigate();
  if (!meterIds.length) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      title="In Analyse öffnen"
      aria-label="In Analyse öffnen"
      onClick={() =>
        navigate(buildAnalysisUrl({
          series: meterIds.slice(0, 20).map((id) => ({ id })),
          preset: PERIOD_TO_PRESET[period ?? "day"] ?? "7d",
        }))
      }
    >
      <LineChartIcon className="h-4 w-4" />
    </Button>
  );
}
