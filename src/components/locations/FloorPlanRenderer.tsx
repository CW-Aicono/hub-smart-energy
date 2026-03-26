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
        <iframe
          src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
          title={alt}
          className={className}
          style={{ ...style, minHeight: "400px", width: "100%", height: "100%", border: "none" }}
        />
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
