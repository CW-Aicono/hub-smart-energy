import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useOcppLiveData } from "@/hooks/useOcppLiveData";
import { LiveDataPanel } from "@/components/charging/LiveDataPanel";

interface Props {
  chargePointId: string;
  children: React.ReactNode;
}

/**
 * Hover-Popover über einem Element (z. B. Status-Badge), das die aktuellen
 * Live-MeterValues des Ladepunkts anzeigt. Die Hook wird nur beim Öffnen
 * aktiv (lazy mount), um nicht für jede Zeile in der Tabelle ein Abo zu starten.
 */
export function StatusLiveDataHover({ chargePointId, children }: Props) {
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="inline-flex">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-72">
        <HoverContent chargePointId={chargePointId} />
      </HoverCardContent>
    </HoverCard>
  );
}

function HoverContent({ chargePointId }: { chargePointId: string }) {
  const live = useOcppLiveData(chargePointId);
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Live-Daten
      </div>
      <LiveDataPanel live={live} />
    </div>
  );
}
