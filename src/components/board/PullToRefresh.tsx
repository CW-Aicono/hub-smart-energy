import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";

interface Props {
  onRefresh: () => Promise<unknown> | unknown;
  threshold?: number;
  labels: { pull: string; release: string; refreshing: string };
  children: React.ReactNode;
}

/**
 * Sehr leichter Pull-to-Refresh (nur Touch, scrollTop===0).
 * Bewusst ohne Library.
 */
export default function PullToRefresh({ onRefresh, threshold = 70, labels, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      setPull(Math.min(dy * 0.5, threshold * 1.5));
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      const distance = pull;
      startY.current = null;
      if (distance >= threshold) {
        setRefreshing(true);
        setPull(threshold);
        try { await onRefresh(); } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [pull, threshold, refreshing, onRefresh]);

  const ready = pull >= threshold;

  return (
    <div ref={ref} className="relative">
      <div
        className="absolute left-0 right-0 -top-12 flex items-center justify-center text-xs text-[hsl(var(--board-muted))] transition-opacity"
        style={{ opacity: pull > 0 ? 1 : 0, transform: `translateY(${pull}px)` }}
      >
        {refreshing ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {labels.refreshing}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <ArrowDown className={`h-3.5 w-3.5 transition-transform ${ready ? "rotate-180" : ""}`} />
            {ready ? labels.release : labels.pull}
          </span>
        )}
      </div>
      <div style={{ transform: `translateY(${pull}px)`, transition: startY.current ? "none" : "transform 200ms" }}>
        {children}
      </div>
    </div>
  );
}
