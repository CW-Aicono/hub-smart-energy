import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, RefreshCw, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTenantPublicStatusLink, buildPublicStatusUrl } from "@/hooks/useTenantPublicStatusLink";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PublicStatusLinkDialog({ open, onOpenChange }: Props) {
  const { link, ensureLink, disableLink, regenerateToken } = useTenantPublicStatusLink();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const enabled = !!link?.enabled;
  const url = link ? buildPublicStatusUrl(link.token) : "";

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link kopiert" });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Öffentlicher Link
              <Badge variant={enabled ? "default" : "secondary"} className="ml-2">
                {enabled ? "Ein" : "Aus"}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Jeder mit diesem Link kann den aktuellen Status aller Ladepunkte einsehen –
              ohne Anmeldung. Der Link enthält keine sensiblen Daten und kann jederzeit
              deaktiviert werden.
            </p>

            <div>
              <label className="text-sm font-medium mb-1.5 block">URL</label>
              <div className="flex gap-2">
                <Input
                  value={enabled && url ? url : ""}
                  placeholder="Link wird beim Aktivieren erzeugt …"
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copy}
                  disabled={!enabled || !url}
                  title="Kopieren"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                  disabled={!enabled || !url}
                  title="In neuem Tab öffnen"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setConfirmRegen(true)}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Token neu generieren
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            {enabled ? (
              <Button
                variant="destructive"
                onClick={() => setConfirmDisable(true)}
                disabled={disableLink.isPending}
              >
                Öffentlichen Link deaktivieren
              </Button>
            ) : (
              <Button
                onClick={() => ensureLink.mutate()}
                disabled={ensureLink.isPending}
              >
                Öffentlichen Link aktivieren
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Link funktioniert sofort nicht mehr. Bei erneuter Aktivierung wird der
              gleiche Token wiederverwendet, sofern Sie ihn nicht zusätzlich neu generieren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                disableLink.mutate();
                setConfirmDisable(false);
              }}
            >
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Token neu generieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Der bisherige Link funktioniert danach nicht mehr. Verteilen Sie den neuen
              Link an alle Berechtigten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                regenerateToken.mutate();
                setConfirmRegen(false);
              }}
            >
              Neu generieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
