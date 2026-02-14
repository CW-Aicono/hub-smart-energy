import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

export default function UpdateBanner() {
  const { updateAvailable, dismissed, applyUpdate, dismissUpdate } = useUpdateCheck();

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground px-4 pb-3 flex items-center justify-center gap-4 shadow-lg" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <Download className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">
        Eine neue Version ist verfügbar.
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={applyUpdate}
        className="h-7 text-xs"
      >
        Jetzt aktualisieren
      </Button>
      <button
        onClick={dismissUpdate}
        className="ml-2 text-primary-foreground/70 hover:text-primary-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
