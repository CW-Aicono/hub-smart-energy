import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Zap,
  ZapOff,
  Pause,
  Play,
  Plug,
  Square,
  AlertTriangle,
  Sliders,
  Trash2,
} from "lucide-react";

const FAULTS = [
  "GroundFailure",
  "OverCurrentFailure",
  "OverVoltage",
  "UnderVoltage",
  "ConnectorLockFailure",
  "EVCommunicationError",
  "PowerMeterFailure",
  "InternalError",
];

interface Props {
  liveStatus: string;
  powerKw: number | null;
  paused: boolean;
  pending: boolean;
  onStartTx: () => void;
  onStopTx: () => void;
  onSetPower: (kw: number) => void;
  onPause: () => void;
  onResume: () => void;
  onUnplug: () => void;
  onFault: (code: string) => void;
  onClearFault: () => void;
  onStop: () => void;
  onDelete: () => void;
}

export function SimulatorRowActions({
  liveStatus,
  powerKw,
  paused,
  pending,
  onStartTx,
  onStopTx,
  onSetPower,
  onPause,
  onResume,
  onUnplug,
  onFault,
  onClearFault,
  onStop,
  onDelete,
}: Props) {
  const isCharging = liveStatus === "charging";
  const isOnline = liveStatus === "online";
  const isFaulted = liveStatus === "faulted";
  const isActive = !["stopped", "error"].includes(liveStatus);
  const [localKw, setLocalKw] = useState<number>(powerKw ?? 11);

  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {isOnline && !isFaulted && (
        <Button size="sm" variant="outline" onClick={onStartTx} disabled={pending}>
          <Zap className="h-3 w-3 mr-1" />
          Laden
        </Button>
      )}

      {isCharging && !paused && (
        <Button size="sm" variant="outline" onClick={onPause} disabled={pending} title="Pause">
          <Pause className="h-3 w-3" />
        </Button>
      )}
      {isCharging && paused && (
        <Button size="sm" variant="outline" onClick={onResume} disabled={pending} title="Resume">
          <Play className="h-3 w-3" />
        </Button>
      )}

      {isCharging && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" title="Leistung live ändern">
                <Sliders className="h-3 w-3 mr-1" />
                {(powerKw ?? 11).toFixed(1)} kW
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-3">
                <div className="text-sm font-medium">Live-Leistung: {localKw.toFixed(1)} kW</div>
                <Slider
                  value={[localKw]}
                  min={0}
                  max={150}
                  step={0.5}
                  onValueChange={(v) => setLocalKw(v[0])}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => onSetPower(localKw)}
                  disabled={pending}
                >
                  Übernehmen
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button size="sm" variant="outline" onClick={onStopTx} disabled={pending}>
            <ZapOff className="h-3 w-3 mr-1" />
            Stop Tx
          </Button>
        </>
      )}

      {(isCharging || isOnline) && (
        <Button size="sm" variant="outline" onClick={onUnplug} disabled={pending} title="Stecker ziehen">
          <Plug className="h-3 w-3" />
        </Button>
      )}

      {isActive && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" title="Fehler simulieren">
              <AlertTriangle className="h-3 w-3 text-destructive" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Fehler simulieren</DropdownMenuLabel>
            {FAULTS.map((code) => (
              <DropdownMenuItem
                key={code}
                onClick={() => onFault(code)}
                disabled={pending}
              >
                {code}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClearFault} disabled={pending}>
              Fehler löschen (NoError)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isActive && (
        <Button size="sm" variant="destructive" onClick={onStop} disabled={pending}>
          <Square className="h-3 w-3 mr-1" />
          Stoppen
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={pending}
        title="Eintrag löschen"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
