import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDocumentsForScope, type DocumentScope } from "@/hooks/useDocuments";
import { DocumentCard } from "./DocumentCard";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import { useTenantModules } from "@/hooks/useTenantModules";
import { useTenant } from "@/hooks/useTenant";

interface Props {
  scope: DocumentScope;
  scopeId: string | null;
  label?: string;
  allowUpload?: boolean;
  variant?: "badge" | "inline";
}

/** Compact badge to show + open the docs attached to a specific device/entity. */
export function DocumentBadge({ scope, scopeId, label, allowUpload = true, variant = "badge" }: Props) {
  const { tenant } = useTenant();
  const { isModuleEnabled } = useTenantModules(tenant?.id ?? null);
  const enabled = isModuleEnabled("documentation");
  const { data: docs = [], isLoading } = useDocumentsForScope(scope, scopeId);
  const [open, setOpen] = useState(false);
  const [upload, setUpload] = useState(false);

  if (!enabled) return null;
  if (isLoading && docs.length === 0 && variant === "badge") return null;

  const count = docs.length;
  // Hide entirely if user can't see any docs and cannot upload
  if (count === 0 && !allowUpload) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={(e) => e.stopPropagation()}
            title="Dokumente"
          >
            <FileText className="h-3.5 w-3.5" />
            {count > 0 ? count : ""}
            {variant === "inline" && <span>Dokumente</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-3" align="end" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium text-sm">Dokumente {label ? `– ${label}` : ""}</div>
            {allowUpload && (
              <Button size="sm" variant="outline" onClick={() => { setOpen(false); setUpload(true); }}>
                Hochladen
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-80">
            <div className="space-y-2">
              {docs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Dokumente.</p>}
              {docs.map((d) => <DocumentCard key={d.id} document={d} compact />)}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {allowUpload && (
        <DocumentUploadDialog
          open={upload}
          onOpenChange={setUpload}
          fixedScope={{ scope, scope_id: scopeId, label }}
        />
      )}
    </>
  );
}
