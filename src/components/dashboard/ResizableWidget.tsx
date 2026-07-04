import { useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResizableWidgetProps {
  height?: number;
  onHeightChange: (height: number | undefined) => void;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  widgetSize?: string;
  children: React.ReactNode;
}

const DEFAULT_MIN = 260;
const DEFAULT_MAX = 1200;
const HANDLE_ROW_HEIGHT = 10; // px — compact, consistent row below the card for the drag handle

const clampHeight = (value: number | undefined, min: number, max: number) => {
  if (typeof value !== "number") return undefined;
  return Math.min(max, Math.max(min, value));
};

/**
 * Wrapper for dashboard widgets that adds a drag-handle *below* the widget
 * card to resize its height. The handle lives in its own row so widget
 * content (chart legends, gauges, etc.) never gets covered.
 *
 * `height` is the wrapper's total height including the handle row.
 * Double-clicking the handle resets to the widget's intrinsic (default) height.
 */
export default function ResizableWidget({
  height,
  onHeightChange,
  minHeight = DEFAULT_MIN,
  maxHeight = DEFAULT_MAX,
  className,
  widgetSize,
  children,
}: ResizableWidgetProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [localHeight, setLocalHeight] = useState<number | undefined>(() =>
    clampHeight(height, minHeight, maxHeight),
  );
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    setLocalHeight(clampHeight(height, minHeight, maxHeight));
  }, [height, minHeight, maxHeight]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const currentHeight =
        localHeight ?? wrapperRef.current?.getBoundingClientRect().height ?? minHeight;
      dragState.current = { startY: e.clientY, startHeight: currentHeight };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [localHeight, minHeight],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const delta = e.clientY - dragState.current.startY;
      const next = Math.min(
        maxHeight,
        Math.max(minHeight, dragState.current.startHeight + delta),
      );
      setLocalHeight(next);
    },
    [minHeight, maxHeight],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const final = localHeight;
      dragState.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (typeof final === "number") onHeightChange(final);
    },
    [localHeight, onHeightChange],
  );

  const onDoubleClick = useCallback(() => {
    setLocalHeight(undefined);
    onHeightChange(undefined);
  }, [onHeightChange]);

  const controlled = typeof localHeight === "number";
  const style: React.CSSProperties = controlled ? { height: `${localHeight}px` } : {};

  return (
    <div
      ref={wrapperRef}
      data-widget-size={widgetSize}
      className={cn(
        "w-full min-w-0 relative group flex flex-col",
        // With an explicit widget height, the lazy wrapper gets the remaining
        // space above the resize handle and the Card stretches with it. Cards
        // keep overflow contained while per-widget minHeight clamps prevent
        // shrinking below usable content sizes.
        controlled && [
          "[&>[data-lazy]]:!h-auto [&>[data-lazy]]:flex-1 [&>[data-lazy]]:min-h-0",
          "[&>[data-lazy]>[data-slot=card]]:h-full [&>[data-lazy]>[data-slot=card]]:min-h-0 [&>[data-lazy]>[data-slot=card]]:flex [&>[data-lazy]>[data-slot=card]]:flex-col [&>[data-lazy]>[data-slot=card]]:overflow-hidden",
          "[&>[data-lazy]>[data-slot=card]>[data-slot=card-content]]:flex-1 [&>[data-lazy]>[data-slot=card]>[data-slot=card-content]]:min-h-0",
          "[&_.leaflet-container]:!h-full [&_.leaflet-container]:!w-full",
        ],
        className,
      )}
      style={style}
    >

      {children}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Widget-Höhe anpassen (Doppelklick zum Zurücksetzen)"
        title="Ziehen zum Anpassen • Doppelklick zum Zurücksetzen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ height: `${HANDLE_ROW_HEIGHT}px` }}
        className={cn(
          "shrink-0 flex items-start justify-center pt-1",
          "cursor-ns-resize touch-none select-none",
          "text-muted-foreground/50 hover:text-primary transition-colors",
          dragState.current ? "text-primary" : "",
        )}
      >
        <div
          className={cn(
            "h-1.5 w-16 rounded-full bg-border/70 group-hover:bg-primary/70 transition-colors flex items-center justify-center",
            dragState.current ? "!bg-primary" : "",
          )}
        >
          <GripHorizontal className="h-2.5 w-2.5 text-background pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
