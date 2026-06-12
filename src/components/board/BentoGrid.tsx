import { TILE_CATALOG } from "./tileCatalog";

interface Tile {
  id: string;
  size: "S" | "M" | "L";
}

const SIZE_CLASSES: Record<Tile["size"], string> = {
  S: "col-span-2 sm:col-span-2 lg:col-span-3",
  M: "col-span-2 sm:col-span-3 lg:col-span-4",
  L: "col-span-2 sm:col-span-6 lg:col-span-6",
};

interface Props {
  tiles: Tile[];
}

/**
 * Bento-Grid mit Platzhalter-Kacheln. Echte KPI-Daten kommen in Phase 3.
 */
export default function BentoGrid({ tiles }: Props) {
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
              <div className="text-3xl font-semibold tracking-tight tabular-nums">—</div>
            </div>
            <div className="text-[11px] text-[hsl(var(--board-muted))]">
              Daten folgen in Phase 3
            </div>
          </div>
        );
      })}
    </div>
  );
}
