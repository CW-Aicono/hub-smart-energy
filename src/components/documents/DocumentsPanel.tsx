import { useState } from "react";
import { useDocuments, type DocumentScope } from "@/hooks/useDocuments";
import { DocumentCard } from "./DocumentCard";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface Props {
  scope: DocumentScope;
  scopeId: string | null;
  label?: string;
}

/** Full documents panel embedded in a detail page (Location, Meter, Charge Point, etc.). */
export function DocumentsPanel({ scope, scopeId, label }: Props) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: docs = [], isLoading } = useDocuments({ scope, scopeId });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Dokumente</h3>
        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" /> Hochladen
        </Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {!isLoading && docs.length === 0 && (
        <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
          Noch keine Dokumente zugeordnet.
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {docs.map((d) => <DocumentCard key={d.id} document={d} />)}
      </div>
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        fixedScope={{ scope, scope_id: scopeId, label }}
      />
    </div>
  );
}
