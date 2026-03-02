import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/useTranslation";
import type { MeterReading } from "@/hooks/useMeterReadings";

interface AddMeterReadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meterName: string;
  meterUnit: string;
  lastReading: { value: number; reading_date: string } | null;
  onSubmit: (data: { value: number; reading_date: string; notes?: string }) => Promise<boolean | undefined>;
  readings?: MeterReading[];
  onDeleteReading?: (id: string) => Promise<boolean>;
}

export const AddMeterReadingDialog = ({
  open,
  onOpenChange,
  meterName,
  meterUnit,
  lastReading,
  onSubmit,
  readings = [],
  onDeleteReading,
}: AddMeterReadingDialogProps) => {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date>(new Date());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const numericValue = parseFloat(value.replace(",", "."));
  const isValid = !isNaN(numericValue) && numericValue >= 0;
  const isLowerThanLast = isValid && lastReading && numericValue < lastReading.value;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    const success = await onSubmit({
      value: numericValue,
      reading_date: format(date, "yyyy-MM-dd"),
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (success) {
      setValue("");
      setNotes("");
      setDate(new Date());
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId || !onDeleteReading) return;
    setDeleting(true);
    await onDeleteReading(deleteConfirmId);
    setDeleting(false);
    setDeleteConfirmId(null);
  };

  const sortedReadings = [...readings].sort((a, b) => b.reading_date.localeCompare(a.reading_date));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("meterReadingDialog.title")}</DialogTitle>
            <DialogDescription>{meterName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Date picker */}
            <div className="space-y-2">
              <Label>{t("meterReadingDialog.readingDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "dd.MM.yyyy", { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Last reading info */}
            {lastReading && (
              <div className="rounded-md border p-3 bg-muted/50">
                <p className="text-xs text-muted-foreground">{t("meterReadingDialog.lastReading")}</p>
                <p className="text-sm font-medium">
                  {lastReading.value.toLocaleString("de-DE")} {meterUnit}
                  <span className="text-muted-foreground font-normal ml-2">
                    ({format(new Date(lastReading.reading_date), "dd.MM.yyyy", { locale: de })})
                  </span>
                </p>
              </div>
            )}

            {/* Value input */}
            <div className="space-y-2">
              <Label>{t("meterReadingDialog.newReading")} ({meterUnit})</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={`z.B. ${lastReading ? Math.round(lastReading.value + 100) : "12345"}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>

            {/* Plausibility warning */}
            {isLowerThanLast && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {numericValue.toLocaleString("de-DE")} {meterUnit} {t("meterReadingDialog.warningLower")} ({lastReading!.value.toLocaleString("de-DE")} {meterUnit}). {t("meterReadingDialog.checkInput")}
                </AlertDescription>
              </Alert>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t("meterReadingDialog.notes")}</Label>
              <Textarea
                placeholder={t("meterReadingDialog.notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid || submitting}>
              {submitting ? t("meterReadingDialog.saving") : t("meterReadingDialog.save")}
            </Button>
          </DialogFooter>

          {/* Reading history */}
          {sortedReadings.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("meterReadingDialog.previousReadings" as any) || "Bisherige Ablesungen"}</Label>
                <ScrollArea className="max-h-48">
                  <div className="space-y-1">
                    {sortedReadings.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground w-20">
                            {format(new Date(r.reading_date), "dd.MM.yy", { locale: de })}
                          </span>
                          <span className="font-medium">
                            {r.value.toLocaleString("de-DE")} {meterUnit}
                          </span>
                        </div>
                        {onDeleteReading && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteConfirmId(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("meterReadingDialog.deleteTitle" as any) || "Zählerstand löschen"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("meterReadingDialog.deleteConfirm" as any) || "Möchten Sie diesen Zählerstand wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "..." : (t("common.delete" as any) || "Löschen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
