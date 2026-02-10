import { useState } from "react";
import { useMeterScanners, MeterScanner } from "@/hooks/useMeterScanners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Smartphone, Trash2, Pencil, QrCode, Loader2, Copy, Check, Eye, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScannerQrCode } from "./ScannerQrCode";

export function ScannerManagement() {
  const { scanners, loading, createScanner, updateScanner, deleteScanner } = useMeterScanners();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScanner, setEditingScanner] = useState<MeterScanner | null>(null);
  const [qrScanner, setQrScanner] = useState<MeterScanner | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleOpen = (scanner?: MeterScanner) => {
    if (scanner) {
      setEditingScanner(scanner);
      setName(scanner.name);
      setDescription(scanner.description || "");
    } else {
      setEditingScanner(null);
      setName("");
      setDescription("");
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);

    if (editingScanner) {
      const { error } = await updateScanner(editingScanner.id, { name, description });
      if (error) {
        toast({ title: "Fehler", description: "Scanner konnte nicht aktualisiert werden.", variant: "destructive" });
      } else {
        toast({ title: "Scanner aktualisiert" });
      }
    } else {
      const { error } = await createScanner(name, description);
      if (error) {
        toast({ title: "Fehler", description: "Scanner konnte nicht erstellt werden.", variant: "destructive" });
      } else {
        toast({ title: "Scanner erstellt", description: "Sie können jetzt den QR-Code generieren." });
      }
    }
    setSubmitting(false);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteScanner(id);
    if (error) {
      toast({ title: "Fehler", description: "Scanner konnte nicht gelöscht werden.", variant: "destructive" });
    } else {
      toast({ title: "Scanner gelöscht" });
    }
  };

  const handleToggle = async (scanner: MeterScanner, active: boolean) => {
    await updateScanner(scanner.id, { is_active: active });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mobile Scanner
          </h2>
          <p className="text-sm text-muted-foreground">
            Erstellen Sie Scanner für die mobile Zählerstanderfassung per App
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
            <Eye className="h-4 w-4" />
            App-Vorschau
          </Button>
          <Button onClick={() => handleOpen()} className="gap-2">
            <Plus className="h-4 w-4" />
            Scanner erstellen
          </Button>
        </div>
      </div>

      {scanners.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Smartphone className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">Keine Scanner vorhanden</p>
            <p className="text-muted-foreground text-center mt-1">
              Erstellen Sie einen Scanner, um Zählerstände per Smartphone zu erfassen
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scanners.map((scanner) => (
            <Card key={scanner.id} className={!scanner.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Smartphone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{scanner.name}</CardTitle>
                      <Badge variant={scanner.is_active ? "default" : "secondary"} className="mt-1">
                        {scanner.is_active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                  </div>
                  <Switch
                    checked={scanner.is_active}
                    onCheckedChange={(v) => handleToggle(scanner, v)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {scanner.description && (
                  <p className="text-sm text-muted-foreground">{scanner.description}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setQrScanner(scanner)}
                  >
                    <QrCode className="h-4 w-4" />
                    QR-Code
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleOpen(scanner)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Scanner löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Der Scanner „{scanner.name}" wird unwiderruflich gelöscht.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(scanner.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingScanner ? "Scanner bearbeiten" : "Neuen Scanner erstellen"}</DialogTitle>
            <DialogDescription>
              {editingScanner
                ? "Aktualisieren Sie die Scanner-Einstellungen"
                : "Erstellen Sie einen neuen Scanner für die mobile Zählerstanderfassung"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="z.B. Scanner Gebäude A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Textarea
                placeholder="Beschreibung des Scanners..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingScanner ? "Speichern" : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      {qrScanner && (
        <ScannerQrCode
          scanner={qrScanner}
          open={!!qrScanner}
          onOpenChange={(open) => !open && setQrScanner(null)}
        />
      )}
      {/* App Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[370px] p-0 overflow-hidden bg-transparent border-none shadow-none [&>button]:hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">App-Vorschau</DialogTitle>
          <div className="flex flex-col items-center">
            {/* Close button */}
            <div className="w-full flex justify-end mb-2 pr-1">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-full shadow-lg"
                onClick={() => setPreviewOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Smartphone Frame */}
            <div className="relative mx-auto" style={{ width: 320 }}>
              {/* Phone bezel */}
              <div className="rounded-[2.5rem] border-[6px] border-foreground/80 bg-background shadow-2xl overflow-hidden">
                {/* Notch */}
                <div className="relative z-10 flex justify-center pt-2 pb-1 bg-background">
                  <div className="w-24 h-5 bg-foreground/80 rounded-full" />
                </div>
                {/* Screen */}
                <div className="bg-background" style={{ height: 560 }}>
                  <iframe
                    src="/m"
                    className="w-full h-full border-0"
                    title="Mobile App Preview"
                  />
                </div>
                {/* Home indicator */}
                <div className="flex justify-center py-2 bg-background">
                  <div className="w-28 h-1 bg-foreground/30 rounded-full" />
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3 text-center">
              Vorschau der mobilen Erfassungs-App
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
