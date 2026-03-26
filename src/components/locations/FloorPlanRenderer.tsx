import { forwardRef, useCallback, useState } from "react";

function isPdfUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().includes(".pdf");
  }
}

interface FloorPlanRendererProps {
  src: string;
  alt: string;
  className?: string;
  draggable?: boolean;
  onLoad?: () => void;
  style?: React.CSSProperties;
}

/**
 * Renders a floor plan image or PDF.
 * For PDFs, uses <object> with fallback.
 * For images, uses a standard <img>.
 * Forwards ref only for <img> (PDF doesn't support ref-based measurement).
 */
export const FloorPlanImage = forwardRef<HTMLImageElement, FloorPlanRendererProps>(
  ({ src, alt, className, draggable, onLoad, style }, ref) => {
    if (isPdfUrl(src)) {
      return (
        <object
          data={src}
          type="application/pdf"
          className={className}
          style={{ ...style, minHeight: "400px" }}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4">
            <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
              PDF-Grundriss öffnen
            </a>
          </div>
        </object>
      );
    }

    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        className={className}
        draggable={draggable}
        onLoad={onLoad}
        style={style}
      />
    );
  }
);

FloorPlanImage.displayName = "FloorPlanImage";

export { isPdfUrl };
