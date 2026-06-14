import { TILE_CATALOG } from "./tileCatalog";
import type { BoardKpis } from "@/hooks/useBoardKpis";
import { Loader2, X, Maximize2, GripVertical } from "lucide-react";
import { useState } from "react";
import { boardT, type BoardLang } from "@/i18n/boardStrings";
import AnimatedNumber from "./AnimatedNumber";

interface Tile {
  id: string;
  size: "S" | "M" | "L";
}

const SIZE_CLASSES: Record<Tile["size"], string> = {
  S: "col-span-2 sm:col-span-2 lg:col-span-3",
  M: "col-span-2 sm:col-span-3 lg:col-span-4",
  L: "col-span-2 sm:col-span-6 lg:col-span-6",
};

const NEXT_SIZE: Record<Tile["size"], Tile["size"]> = { S: "M", M: "L", L: "S" };

const TONE_CLASSES: Record<NonNullable<ReturnType<NonNullable<typeof TILE_CATALOG[string]["resolve"]>>["tone"]>, string> = {
  default: "text-[hsl(var(--board-foreground))]",
  positive: "text-[hsl(var(--board-success))]",
  warning: "text-[hsl(var(--board-accent))]",
  danger: "text-red-500",
};

/** Dezenter Kategorie-Gradient als Hintergrund-Akzent oben rechts. */
const CATEGORY_GRADIENT: Record<string, string> = {
  energy: "from-sky-500/15 via-sky-500/5 to-transparent",
  esg: "from-emerald-500/15 via-emerald-500/5 to-transparent",
  portfolio: "from-teal-500/15 via-teal-500/5 to-transparent",
  trading: "from-amber-500/15 via-amber-500/5 to-transparent",
  tasks: "from-violet-500/15 via-violet-500/5 to-transparent",
};

/** Welche Kacheln sollen bei Wert > 0 pulsieren? */
const PULSE_WHEN_POSITIVE = new Set(["alerts_open", "tasks_overdue"]);

interface Props {
  tiles: Tile[];
  kpis: BoardKpis | null;
  loading?: boolean;
  editMode?: boolean;
  onChange?: (tiles: Tile[]) => void;
  onTileClick?: (tileId: string) => void;
  lang?: BoardLang;
}

export default function BentoGrid({
  tiles,
  kpis,
  loading,
  editMode,
  onChange,
  onTileClick,
  lang = "de",
}: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (!tiles.length) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--board-border))] p-8 text-center text-[hsl(var(--board-muted))]">
        {boardT("emptyTiles", lang)}
      </div>
    );
  }

  const remove = (idx: number) => onChange?.(tiles.filter((_, i) => i !== idx));
  const cycleSize = (idx: number) =>
    onChange?.(tiles.map((t, i) => (i === idx ? { ...t, size: NEXT_SIZE[t.size] } : t)));
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...tiles];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    onChange?.(next);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-4">
      {tiles.map((tile, idx) => {
        const meta = TILE_CATALOG[tile.id];
        const Icon = meta?.icon;
        const resolved = meta?.resolve && kpis ? meta.resolve(kpis) : null;
        const tone = resolved?.tone ?? "default";
        const gradient = meta ? CATEGORY_GRADIENT[meta.category] : "";

        // Pulse-Logik: Zahl > 0 in pulse-relevanten Kacheln?
        const numericValue = resolved?.value
          ? parseFloat(resolved.value.replace(/\./g, "").replace(",", "."))
          : NaN;
        const shouldPulse =
          PULSE_WHEN_POSITIVE.has(tile.id) && isFinite(numericValue) && numericValue > 0;

        const clickable = !editMode && !!meta;

        return (
          <div
            key={`${tile.id}-${idx}`}
            style={{ animationDelay: `${Math.min(idx * 40, 400)}ms`, animationFillMode: "both" }}
            draggable={editMode}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => editMode && e.preventDefault()}
            onDrop={(e) => {
              if (!editMode || dragIdx == null) return;
              e.preventDefault();
              move(dragIdx, idx);
              setDragIdx(null);
            }}
            onClick={() => clickable && onTileClick?.(tile.id)}
            onKeyDown={(e) => {
              if (!clickable) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTileClick?.(tile.id);
              }
            }}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            className={`group relative overflow-hidden animate-fade-in ${SIZE_CLASSES[tile.size]} rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-5 shadow-sm flex flex-col gap-3 min-h-[140px] transition-all duration-200 ${
              clickable
                ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 hover:border-[hsl(var(--board-accent))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--board-accent))]"
                : "hover:shadow-md"
            } ${editMode ? "ring-1 ring-dashed ring-[hsl(var(--board-accent))]/40 cursor-grab" : ""}`}
          >
            {/* Kategorie-Gradient */}
            {gradient && (
              <div
                className={`pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br ${gradient} blur-2xl opacity-80 group-hover:opacity-100 transition-opacity`}
                aria-hidden
              />
            )}

            {editMode && (
              <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cycleSize(idx); }}
                  title={`Größe (${tile.size}) → ${NEXT_SIZE[tile.size]}`}
                  className="rounded-md bg-[hsl(var(--board-background))]/80 border border-[hsl(var(--board-border))] p-1 hover:bg-[hsl(var(--board-background))]"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(idx); }}
                  title="Entfernen"
                  className="rounded-md bg-[hsl(var(--board-background))]/80 border border-[hsl(var(--board-border))] p-1 hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {editMode && (
              <div className="absolute top-2 left-2 text-[hsl(var(--board-muted))] z-10">
                <GripVertical className="h-3.5 w-3.5" />
              </div>
            )}

            <div className="relative flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
                {meta?.title ?? tile.id}
              </span>
              {Icon && (
                <span className="relative">
                  {shouldPulse && (
                    <span className="absolute inset-0 -m-1 rounded-full bg-red-500/40 animate-ping" aria-hidden />
                  )}
                  <Icon
                    className={`relative h-4 w-4 ${
                      shouldPulse ? "text-red-500" : "text-[hsl(var(--board-accent))]"
                    }`}
                  />
                </span>
              )}
            </div>
            <div className="relative flex-1 flex flex-col justify-end gap-2">
              {loading && !kpis ? (
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--board-muted))]" />
              ) : resolved?.list && resolved.list.length > 0 ? (
                <ul className="space-y-1">
                  {resolved.list.map((item, i) => (
                    <li key={i} className="flex items-baseline justify-between text-sm">
                      <span className="truncate pr-2 text-[hsl(var(--board-foreground))]">{item.label}</span>
                      <span className={`tabular-nums font-medium ${TONE_CLASSES[tone]}`}>{item.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={`text-3xl font-semibold tracking-tight tabular-nums ${TONE_CLASSES[tone]}`}>
                  <AnimatedNumber value={resolved?.value ?? "—"} />
                </div>
              )}
            </div>
            {resolved?.hint && (
              <div className="relative text-[11px] text-[hsl(var(--board-muted))]">{resolved.hint}</div>
            )}
            {clickable && (
              <div className="absolute bottom-2 right-3 text-[10px] text-[hsl(var(--board-muted))] opacity-0 group-hover:opacity-100 transition-opacity">
                Details →
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
