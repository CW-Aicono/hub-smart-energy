import { useRef, useState, useEffect, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface LazyWidgetProps {
  children: ReactNode;
  /** Minimum height for the placeholder so layout doesn't jump */
  minHeight?: number;
}

/**
 * Renders children only once the wrapper scrolls into the viewport.
 * Uses IntersectionObserver with a generous rootMargin so widgets
 * start loading slightly before they become visible.
 */
export default function LazyWidget({ children, minHeight = 200 }: LazyWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Find the nearest scrollable ancestor so the observer works
    // inside overflow-auto containers (e.g. <main>), not just the viewport.
    let root: Element | null = null;
    let parent = el.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflow === "auto" || style.overflow === "scroll" ||
          style.overflowY === "auto" || style.overflowY === "scroll") {
        root = parent;
        break;
      }
      parent = parent.parentElement;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: "800px" }, // start rendering 800px before visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!visible) {
    return (
      <div ref={ref} style={{ minHeight }}>
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-[140px] w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div ref={ref}>{children}</div>;
}
