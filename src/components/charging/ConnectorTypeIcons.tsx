import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CONNECTOR_ICONS: Record<string, { label: string; path: string; color: string }> = {
  Type2: {
    label: "Typ 2",
    color: "text-blue-500",
    path: "M12 2a7 7 0 0 0-7 7v1a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a7 7 0 0 0-7-7Zm-3 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM8 17v5h2v-5H8Zm6 0v5h2v-5h-2Z",
  },
  CCS: {
    label: "CCS",
    color: "text-orange-500",
    path: "M12 2a7 7 0 0 0-7 7v1a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a7 7 0 0 0-7-7Zm-3 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM9 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  },
  CHAdeMO: {
    label: "CHAdeMO",
    color: "text-green-500",
    path: "M12 2a8 8 0 0 0-8 8v2a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2a8 8 0 0 0-8-8Zm-3 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 17v5h2v-5H8Zm6 0v5h2v-5h-2Z",
  },
  Other: {
    label: "Sonstige",
    color: "text-muted-foreground",
    path: "M13 2H11v4h2V2ZM5 8v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8H5Zm4 3a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm4 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm-3 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM8 20v2h2v-2H8Zm6 0v2h2v-2h-2Z",
  },
};

// Status-Punkte (kleiner Indikator oben rechts am Stecker-Icon)
const STATUS_DOT: Record<string, { color: string; label: string }> = {
  available: { color: "bg-green-500", label: "Verfügbar" },
  charging: { color: "bg-blue-500", label: "Belegt" },
  faulted: { color: "bg-red-500", label: "Fehler" },
  offline: { color: "bg-orange-500", label: "Offline" },
  unavailable: { color: "bg-yellow-500", label: "Nicht verfügbar" },
  unconfigured: { color: "bg-purple-500", label: "Nicht konfiguriert" },
};

interface ConnectorStatusInfo {
  connectorId: number;
  status: string;
}

interface Props {
  connectorType: string;
  connectorCount: number;
  /** Pro-Stecker-Status. Wenn gesetzt, wird je Icon ein farbiger Status-Punkt eingeblendet. */
  connectorStatuses?: ConnectorStatusInfo[];
}

export default function ConnectorTypeIcons({ connectorType, connectorCount, connectorStatuses }: Props) {
  const types = connectorType ? connectorType.split(",").filter(Boolean) : ["Other"];

  // Build list of icons to render
  const icons: { type: string; config: (typeof CONNECTOR_ICONS)[string]; connectorId?: number }[] = [];

  if (types.length === 1) {
    // Single type: repeat icon for each connector
    const cfg = CONNECTOR_ICONS[types[0]] || CONNECTOR_ICONS.Other;
    for (let i = 0; i < Math.max(1, connectorCount); i++) {
      icons.push({ type: types[0], config: cfg, connectorId: i + 1 });
    }
  } else {
    // Multiple types: one icon per type
    for (let i = 0; i < types.length; i++) {
      const cfg = CONNECTOR_ICONS[types[i]] || CONNECTOR_ICONS.Other;
      icons.push({ type: types[i], config: cfg, connectorId: i + 1 });
    }
  }

  // Map connectorId -> status (falls vorhanden)
  const statusById = new Map<number, string>();
  if (connectorStatuses) {
    const sorted = connectorStatuses.slice().sort((a, b) => a.connectorId - b.connectorId);
    sorted.forEach((s, idx) => {
      statusById.set(s.connectorId, s.status);
      // zusätzlich indexbasiert als Fallback
      if (!statusById.has(idx + 1)) statusById.set(idx + 1, s.status);
    });
  }

  const typeSummary = types.length === 1
    ? `${connectorCount}× ${CONNECTOR_ICONS[types[0]]?.label || types[0]}`
    : types.map((t) => CONNECTOR_ICONS[t]?.label || t).join(" + ");

  const statusSummary = connectorStatuses && connectorStatuses.length > 0
    ? connectorStatuses
        .slice()
        .sort((a, b) => a.connectorId - b.connectorId)
        .map((s) => `Stecker ${s.connectorId}: ${STATUS_DOT[s.status]?.label ?? s.status}`)
        .join(" · ")
    : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {icons.map((icon, i) => {
              const status = statusById.get(icon.connectorId ?? i + 1);
              const dot = status ? STATUS_DOT[status] : null;
              return (
                <div key={i} className="relative inline-flex">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className={`h-5 w-5 ${icon.config.color} shrink-0`}
                  >
                    <path d={icon.config.path} />
                  </svg>
                  {dot && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-background ${dot.color}`}
                      aria-label={dot.label}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{typeSummary}</p>
          {statusSummary && <p className="text-xs text-muted-foreground mt-0.5">{statusSummary}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
