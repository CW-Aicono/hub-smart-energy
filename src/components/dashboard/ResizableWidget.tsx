import { useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResizableWidgetProps {
  height?: number;
  onHeightChange: (height: number | undefined) => void;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  children: React.ReactNode;
}

const DEFAULT_MIN = 200;
const DEFAULT_MAX = 1200;

/**
 * Wrapper for dashboard widgets that adds a bottom drag-handle to resize the
 * widget height in pixels. Double-clicking the handle resets to the widget's
 * intrinsic (default) height.
 *
 * Persistence is triggered on pointer-up (not during drag) to avoid DB churn.
 * Internally we force the direct child (Card) and Recharts containers to fill
 * the wrapper so the drag actually changes visible chart height.
 */
export default function ResizableWidget({
  height,
  onHeightChange,
  minHeight = DEFAULT_MIN,
  maxHeight = DEFAULT_MAX,
  className,
  children,
}: ResizableWidgetProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [localHeight, setLocalHeight] = useState<number | undefined>(height);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    setLocalHeight(height);
  }, [height]);

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

  const style: React.CSSProperties = localHeight
    ? { height: `${localHeight}px` }
    : {};

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "w-full min-w-0 relative group",
        // Force the root Card (direct child) + CardContent + Recharts to fill
        // the wrapper so the drag actually stretches the visible content.
        localHeight
          ? "[&>*:first-child]:!h-full [&>*:first-child]:!flex [&>*:first-child]:!flex-col [&_[data-slot=card-content]]:!flex-1 [&_[data-slot=card-content]]:!min-h-0 [&_.recharts-responsive-container]:!h-full"
          : "",
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
        className={cn(
          "absolute -bottom-1 left-1/2 -translate-x-1/2 z-20",
          "flex items-center justify-center",
          "h-3 w-16 rounded-full cursor-ns-resize touch-none select-none",
          "bg-border/70 hover:bg-primary/70 transition-colors",
          "opacity-0 group-hover:opacity-100",
          dragState.current ? "opacity-100 bg-primary" : "",
        )}
      >
        <GripHorizontal className="h-3 w-3 text-background pointer-events-none" />
      </div>
    </div>
  );
}
