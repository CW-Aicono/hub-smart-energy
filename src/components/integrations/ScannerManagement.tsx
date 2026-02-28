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
import { Plus, Smartphone, Trash2, Pencil, QrCode, Loader2, Copy, Check, Eye, X, ExternalLink, Camera, Keyboard, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
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
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

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
        toast({ title: T("common.error"), description: T("scanner.errorUpdate"), variant: "destructive" });
      } else {
        toast({ title: T("scanner.updated") });
      }
    } else {
      const { error } = await createScanner(name, description);
      if (error) {
        toast({ title: T("common.error"), description: T("scanner.errorCreate"), variant: "destructive" });
      } else {
        toast({ title: T("scanner.created"), description: T("scanner.createdDesc") });
      }
    }
    setSubmitting(false);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteScanner(id);
    if (error) {
      toast({ title: T("common.error"), description: T("scanner.errorDelete"), variant: "destructive" });
    } else {
      toast({ title: T("scanner.deleted") });
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
            {T("scanner.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {T("scanner.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
            <Eye className="h-4 w-4" />
            {T("scanner.appPreview")}
          </Button>
          <Button onClick={() => handleOpen()} className="gap-2">
            <Plus className="h-4 w-4" />
            {T("scanner.create")}
          </Button>
        </div>
      </div>

      {scanners.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Smartphone className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">{T("scanner.none")}</p>
            <p className="text-muted-foreground text-center mt-1">
              {T("scanner.noneDesc")}
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
                        {scanner.is_active ? T("scanner.active") : T("scanner.inactive")}
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
                        <AlertDialogTitle>{T("scanner.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {T("scanner.deleteDesc").replace("{name}", scanner.name)}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{T("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(scanner.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {T("common.delete")}
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
            <DialogTitle>{editingScanner ? T("scanner.editTitle") : T("scanner.createTitle")}</DialogTitle>
            <DialogDescription>
              {editingScanner ? T("scanner.editDesc") : T("scanner.createDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{T("common.name")}</Label>
              <Input
                placeholder={T("scanner.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{T("scanner.descLabel")}</Label>
              <Textarea
                placeholder={T("scanner.descPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{T("common.cancel")}</Button>
              <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingScanner ? T("common.save") : T("common.create")}
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
      {/* App Preview - static mockup */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreviewOpen(false)} />
          <div className="relative z-10 flex flex-col items-center">
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
            <div className="relative mx-auto" style={{ width: 320 }}>
              <div className="rounded-[2.5rem] border-[6px] border-foreground/80 bg-background shadow-2xl overflow-hidden">
                <div className="relative z-10 flex justify-center pt-2 pb-1 bg-background">
                  <div className="w-24 h-5 bg-foreground/80 rounded-full" />
                </div>
                <div className="bg-background flex flex-col" style={{ height: 560 }}>
                  <div className="border-b px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                        <Zap className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <span className="font-bold text-xs">{T("scanner.appTitle")}</span>
                    </div>
                  </div>
                  <div className="flex border-b">
                    <div className="flex-1 py-2 text-center text-xs font-medium border-b-2 border-primary text-primary flex items-center justify-center gap-1">
                      <Camera className="h-3 w-3" /> {T("scanner.tabPhoto")}
                    </div>
                    <div className="flex-1 py-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <QrCode className="h-3 w-3" /> QR-Code
                    </div>
                    <div className="flex-1 py-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Keyboard className="h-3 w-3" /> {T("scanner.tabManual")}
                    </div>
                  </div>
                  <div className="flex-1 p-4 space-y-4">
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {T("scanner.photoDesc")}
                      </p>
                      <div className="h-12 rounded-lg bg-secondary flex items-center justify-center gap-2 text-sm font-medium">
                        <Camera className="h-4 w-4" />
                        {T("scanner.takePhoto")}
                      </div>
                      <div className="h-12 rounded-lg border border-dashed flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Smartphone className="h-4 w-4" />
                        {T("scanner.gallery")}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-primary" />
                        {T("scanner.feat1")}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-primary" />
                        {T("scanner.feat2")}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-primary" />
                        {T("scanner.feat3")}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-primary" />
                        {T("scanner.feat4")}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center py-2 bg-background">
                  <div className="w-28 h-1 bg-foreground/30 rounded-full" />
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              className="mt-3 gap-2"
              onClick={() => window.open("/m", "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              {T("scanner.openInNewTab")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}