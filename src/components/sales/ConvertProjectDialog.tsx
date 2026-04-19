import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Rocket, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
  alreadyConverted: boolean;
  convertedTenantId: string | null;
  onConverted: () => void;
}

export function ConvertProjectDialog({ projectId, alreadyConverted, convertedTenantId, onConverted }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const convert = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sales-convert-to-tenant", {
        body: { project_id: projectId },
      });
      if (error) throw error;
      toast.success("Mandant angelegt", {
        description: `${data.modules_enabled} Module aktiviert · Slug: ${data.tenant_slug}`,
      });
      onConverted();
      setOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Konvertierung fehlgeschlagen", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  if (alreadyConverted) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">Konvertiert zu Mandant</div>
          <div className="text-xs text-muted-foreground truncate">{convertedTenantId}</div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="default">
          <Rocket className="h-4 w-4 mr-2" />
          In Mandant konvertieren
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lead in Mandant umwandeln</DialogTitle>
          <DialogDescription>
            Es wird automatisch ein Mandant inkl. Hauptliegenschaft, Kontaktdaten und allen
            Modulen des aktuellsten Angebots angelegt. Diese Aktion kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button onClick={convert} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Jetzt konvertieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
