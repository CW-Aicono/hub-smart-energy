import { TILE_CATALOG } from "./tileCatalog";
import type { BoardKpis } from "@/hooks/useBoardKpis";
import { Loader2 } from "lucide-react";

interface Tile {
  id: string;
  size: "S" | "M" | "L";
}

const SIZE_CLASSES: Record<Tile["size"], string> = {
  S: "col-span-2 sm:col-span-2 lg:col-span-3",
  M: "col-span-2 sm:col-span-3 lg:col-span-4",
  L: "col-span-2 sm:col-span-6 lg:col-span-6",
};

const TONE_CLASSES: Record<NonNullable<ReturnType<NonNullable<typeof TILE_CATALOG[string]["resolve"]>>["tone"]>, string> = {
  default: "text-[hsl(var(--board-foreground))]",
  positive: "text-[hsl(var(--board-success))]",
  warning: "text-[hsl(var(--board-accent))]",
  danger: "text-red-500",
};

interface Props {
  tiles: Tile[];
  kpis: BoardKpis | null;
  loading?: boolean;
}

export default function BentoGrid({ tiles, kpis, loading }: Props) {
  if (!tiles.length) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--board-border))] p-8 text-center text-[hsl(var(--board-muted))]">
        Keine Kacheln ausgewählt. Wähle ein Template oder ergänze Kacheln im Anpassen-Modus.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-4">
      {tiles.map((tile, idx) => {
        const meta = TILE_CATALOG[tile.id];
        const Icon = meta?.icon;
        const resolved = meta?.resolve && kpis ? meta.resolve(kpis) : null;
        const tone = resolved?.tone ?? "default";
        return (
          <div
            key={`${tile.id}-${idx}`}
            className={`${SIZE_CLASSES[tile.size]} rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-5 shadow-sm flex flex-col gap-3 min-h-[140px]`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
                {meta?.title ?? tile.id}
              </span>
              {Icon && <Icon className="h-4 w-4 text-[hsl(var(--board-accent))]" />}
            </div>
            <div className="flex-1 flex items-end">
              {loading && !kpis ? (
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--board-muted))]" />
              ) : (
                <div className={`text-3xl font-semibold tracking-tight tabular-nums ${TONE_CLASSES[tone]}`}>
                  {resolved?.value ?? "—"}
                </div>
              )}
            </div>
            {resolved?.hint && (
              <div className="text-[11px] text-[hsl(var(--board-muted))]">{resolved.hint}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
