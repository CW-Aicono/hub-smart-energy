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

interface Props {
  connectorType: string;
  connectorCount: number;
}

export default function ConnectorTypeIcons({ connectorType, connectorCount }: Props) {
  const types = connectorType ? connectorType.split(",").filter(Boolean) : ["Other"];

  // Build list of icons to render
  const icons: { type: string; config: (typeof CONNECTOR_ICONS)[string] }[] = [];

  if (types.length === 1) {
    // Single type: repeat icon for each connector
    const cfg = CONNECTOR_ICONS[types[0]] || CONNECTOR_ICONS.Other;
    for (let i = 0; i < Math.max(1, connectorCount); i++) {
      icons.push({ type: types[0], config: cfg });
    }
  } else {
    // Multiple types: one icon per type
    for (const t of types) {
      const cfg = CONNECTOR_ICONS[t] || CONNECTOR_ICONS.Other;
      icons.push({ type: t, config: cfg });
    }
  }

  const summary = types.length === 1
    ? `${connectorCount}× ${CONNECTOR_ICONS[types[0]]?.label || types[0]}`
    : types.map((t) => CONNECTOR_ICONS[t]?.label || t).join(" + ");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-0.5">
            {icons.map((icon, i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`h-5 w-5 ${icon.config.color} shrink-0`}
              >
                <path d={icon.config.path} />
              </svg>
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{summary}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
