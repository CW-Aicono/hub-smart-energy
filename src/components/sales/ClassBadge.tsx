import { Badge } from "@/components/ui/badge";
import { Zap, Network, Plug, Cable, Router, Puzzle, Package, Cpu } from "lucide-react";

export const CLASS_LABELS: Record<string, string> = {
  meter: "Zähler",
  gateway: "Gateway",
  power_supply: "Netzteil",
  network_switch: "Switch",
  router: "Router",
  addon_module: "Addon",
  cable: "Kabel",
  accessory: "Zubehör",
  misc: "Sonstige",
};

export function classIcon(klasse: string) {
  switch (klasse) {
    case "meter": return Zap;
    case "gateway": return Cpu;
    case "power_supply": return Plug;
    case "network_switch": return Network;
    case "router": return Router;
    case "addon_module": return Puzzle;
    case "cable": return Cable;
    default: return Package;
  }
}

export function ClassBadge({ klasse, showLabel = false }: { klasse?: string | null; showLabel?: boolean }) {
  const k = klasse || "misc";
  const Icon = classIcon(k);
  return (
    <Badge variant="outline" className="text-[10px] h-5 gap-1 px-1.5">
      <Icon className="h-3 w-3" />
      {showLabel && <span>{CLASS_LABELS[k] ?? k}</span>}
    </Badge>
  );
}
