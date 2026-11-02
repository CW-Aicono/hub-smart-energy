import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

GlobalWorkerOptions.workerSrc = workerUrl;

export function InvoicePdfPreview({ blob, title, onClose }: { blob: Blob | null; title: string; onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    let task: ReturnType<typeof getDocument> | undefined;
    setLoading(true); setError("");
    const render = async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      task = getDocument({ data: bytes });
      const pdf = await task.promise;
      const host = container.current;
      if (!host || cancelled) return;
      host.replaceChildren();
      for (let n = 1; n <= pdf.numPages; n++) {
        if (cancelled) return;
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        canvas.className = "w-full h-auto mb-4";
        canvas.setAttribute("aria-label", `${title} – ${n}`);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        await page.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) host.appendChild(canvas);
      }
      if (!cancelled) setLoading(false);
    };
    render().catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; void task?.destroy(); };
  }, [blob, title]);
  return <Dialog open={!!blob} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><div className="overflow-y-auto min-h-0 flex-1">{loading && <Loader2 className="h-6 w-6 animate-spin mx-auto" />}{error && <p className="text-destructive">{error}</p>}<div ref={container} /></div></DialogContent></Dialog>;
}