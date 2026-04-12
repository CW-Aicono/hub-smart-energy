import { useState, useRef, useEffect } from "react";
import { TaskAttachment, useTaskAttachments } from "@/hooks/useTaskAttachments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImagePlus, Trash2, X, Download, Maximize2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskImageGalleryProps {
  taskId: string | null;
  /** For create dialog: files queued before task exists */
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  compact?: boolean;
}

export const TaskImageGallery = ({
  taskId,
  pendingFiles,
  onPendingFilesChange,
  compact = false,
}: TaskImageGalleryProps) => {
  const { attachments, isLoading, uploadAttachment, deleteAttachment, getSignedUrl } =
    useTaskAttachments(taskId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);

  // Load signed URLs for thumbnails
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const urls: Record<string, string> = {};
      for (const att of attachments) {
        if (!thumbnailUrls[att.id]) {
          try {
            urls[att.id] = await getSignedUrl(att.file_path);
          } catch { /* ignore */ }
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) {
        setThumbnailUrls((prev) => ({ ...prev, ...urls }));
      }
    };
    if (attachments.length > 0) load();
    return () => { cancelled = true; };
  }, [attachments]);

  // Generate previews for pending files
  useEffect(() => {
    if (!pendingFiles?.length) { setPendingPreviews([]); return; }
    const urls = pendingFiles.map((f) => URL.createObjectURL(f));
    setPendingPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [pendingFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (taskId) {
      // Upload directly
      files.forEach((file) => uploadAttachment.mutate({ taskId, file }));
    } else if (onPendingFilesChange && pendingFiles) {
      // Queue for later
      onPendingFilesChange([...pendingFiles, ...files]);
    }
    e.target.value = "";
  };

  const handleOpenFullscreen = async (att: TaskAttachment) => {
    try {
      const url = thumbnailUrls[att.id] || (await getSignedUrl(att.file_path));
      setFullscreenUrl(url);
    } catch { /* ignore */ }
  };

  const handleDownload = async (att: TaskAttachment) => {
    try {
      const url = thumbnailUrls[att.id] || (await getSignedUrl(att.file_path));
      const a = document.createElement("a");
      a.href = url;
      a.download = att.file_name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch { /* ignore */ }
  };

  const removePending = (idx: number) => {
    if (onPendingFilesChange && pendingFiles) {
      onPendingFilesChange(pendingFiles.filter((_, i) => i !== idx));
    }
  };

  const allEmpty = attachments.length === 0 && (!pendingFiles || pendingFiles.length === 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Bilder
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadAttachment.isPending}
        >
          {uploadAttachment.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          Bild hinzufügen
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {!allEmpty && (
        <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3")}>
          {/* Existing attachments */}
          {attachments.map((att) => (
            <div key={att.id} className="relative group rounded-lg overflow-hidden border border-border bg-muted/30 aspect-square">
              {thumbnailUrls[att.id] ? (
                <img
                  src={thumbnailUrls[att.id]}
                  alt={att.file_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {/* Overlay actions */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => handleOpenFullscreen(att)}
                  title="Vollbild"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => handleDownload(att)}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => deleteAttachment.mutate(att)}
                  title="Löschen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {/* Pending files (create dialog) */}
          {pendingPreviews.map((url, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-dashed border-primary/40 bg-muted/30 aspect-square">
              <img src={url} alt="" className="w-full h-full object-cover opacity-70" />
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removePending(idx)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen overlay */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setFullscreenUrl(null)}
        >
          <img
            src={fullscreenUrl}
            alt="Vollbild"
            className="max-w-[95vw] max-h-[95vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20 h-10 w-10"
            onClick={() => setFullscreenUrl(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-16 text-white hover:bg-white/20 h-10 w-10"
            onClick={(e) => {
              e.stopPropagation();
              const a = document.createElement("a");
              a.href = fullscreenUrl;
              a.download = "image";
              a.target = "_blank";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            title="Download"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
};
