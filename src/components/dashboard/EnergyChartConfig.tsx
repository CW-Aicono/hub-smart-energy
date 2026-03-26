import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { ENERGY_CHART_COLORS, ENERGY_TYPE_LABELS } from "@/lib/energyTypeColors";
import type { Meter } from "@/hooks/useMeters";

interface EnergyChartConfigProps {
  meters: Meter[];
  locationId: string | null;
  selectedMeterIds: Set<string>;
  onToggleMeter: (meterId: string) => void;
  showSoc: boolean;
  onToggleSoc: () => void;
  hasSocMeters: boolean;
}

export default function EnergyChartConfig({
  meters,
  locationId,
  selectedMeterIds,
  onToggleMeter,
  showSoc,
  onToggleSoc,
  hasSocMeters,
}: EnergyChartConfigProps) {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

  const relevantMeters = useMemo(() => {
    return meters
      .filter((m) => !m.is_archived)
      .filter((m) => !locationId || m.location_id === locationId);
  }, [meters, locationId]);

  // Group meters by energy type
  const grouped = useMemo(() => {
    const groups: Record<string, Meter[]> = {};
    for (const m of relevantMeters) {
      const et = m.energy_type || "strom";
      if (!groups[et]) groups[et] = [];
      groups[et].push(m);
    }
    return groups;
  }, [relevantMeters]);

  const groupOrder = ["strom", "gas", "waerme", "wasser"];
  const sortedKeys = useMemo(() => {
    const known = groupOrder.filter((k) => k in grouped);
    const extra = Object.keys(grouped).filter((k) => !groupOrder.includes(k));
    return [...known, ...extra];
  }, [grouped]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-h-80 overflow-y-auto" align="end">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          {T("chart.configTitle")}
        </p>

        {sortedKeys.map((et) => (
          <div key={et} className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: ENERGY_CHART_COLORS[et] || "hsl(var(--muted-foreground))" }}
              />
              <span className="text-xs font-medium">
                {T(`energy.${et}`) || ENERGY_TYPE_LABELS[et] || et}
              </span>
            </div>
            {grouped[et].map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 py-1 pl-4 cursor-pointer hover:bg-accent/50 rounded-sm"
              >
                <Checkbox
                  checked={selectedMeterIds.has(m.id)}
                  onCheckedChange={() => onToggleMeter(m.id)}
                />
                <span className="text-xs truncate">{m.name}</span>
                {m.is_main_meter && (
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                    {T("chart.mainMeter")}
                  </span>
                )}
              </label>
            ))}
          </div>
        ))}

        {hasSocMeters && (
          <>
            <div className="border-t pt-2 mt-2">
              <label className="flex items-center gap-2 py-1 cursor-pointer hover:bg-accent/50 rounded-sm">
                <Checkbox checked={showSoc} onCheckedChange={onToggleSoc} />
                <span className="text-xs font-medium">{T("chart.socLabel")}</span>
              </label>
              <p className="text-[10px] text-muted-foreground pl-6">
                {T("chart.socHint")}
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
