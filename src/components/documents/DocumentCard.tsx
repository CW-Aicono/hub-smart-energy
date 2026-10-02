import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText, Trash2 } from "lucide-react";
import type { DocumentRow, DocumentVersion } from "@/hooks/useDocuments";
import { downloadDocumentVersion, useDeleteDocument } from "@/hooks/useDocuments";
import { confirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  document: DocumentRow;
  onClick?: () => void;
  compact?: boolean;
}

export function DocumentCard({ document, onClick, compact }: Props) {
  const del = useDeleteDocument();
  const version = document.current_version;
  const size = version?.file_size_bytes ? `${(version.file_size_bytes / 1024).toFixed(0)} KB` : null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (version) await downloadDocumentVersion(version as DocumentVersion);
  };
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "Dokument löschen?", description: `„${document.title}" wird endgültig entfernt.` });
    if (ok) del.mutate(document.id);
  };

  return (
    <Card
      onClick={onClick}
      className={`p-3 cursor-pointer hover:border-primary/50 transition-colors ${compact ? "text-sm" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0" style={{ color: document.category?.color ?? undefined }}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{document.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {document.category && <Badge variant="outline" className="text-[10px]">{document.category.name}</Badge>}
            <span className="text-xs text-muted-foreground">
              v{document.latest_version_no}
              {size ? ` · ${size}` : ""}
              {" · "}
              {formatDistanceToNow(new Date(document.updated_at), { addSuffix: true, locale: de })}
            </span>
          </div>
          {document.description && !compact && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{document.description}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button size="icon" variant="ghost" onClick={handleDownload} disabled={!version} title="Download">
            <Download className="h-4 w-4" />
          </Button>
          {!compact && (
            <Button size="icon" variant="ghost" onClick={handleDelete} title="Löschen">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
