import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddMeterReadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meterName: string;
  meterUnit: string;
  lastReading: { value: number; reading_date: string } | null;
  onSubmit: (data: { value: number; reading_date: string; notes?: string }) => Promise<boolean | undefined>;
}

export const AddMeterReadingDialog = ({
  open,
  onOpenChange,
  meterName,
  meterUnit,
  lastReading,
  onSubmit,
}: AddMeterReadingDialogProps) => {
  const [date, setDate] = useState<Date>(new Date());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zählerstand erfassen</DialogTitle>
          <DialogDescription>
            {meterName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date picker */}
          <div className="space-y-2">
            <Label>Ablesedatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal")}
                >
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
              <p className="text-xs text-muted-foreground">Letzter Zählerstand</p>
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
            <Label>Neuer Zählerstand ({meterUnit})</Label>
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
                Der neue Zählerstand ({numericValue.toLocaleString("de-DE")} {meterUnit}) ist kleiner als der letzte ({lastReading!.value.toLocaleString("de-DE")} {meterUnit}). Bitte prüfen Sie die Eingabe.
              </AlertDescription>
            </Alert>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Bemerkung (optional)</Label>
            <Textarea
              placeholder="z.B. Zählerwechsel, Korrektur..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? "Speichern..." : "Zählerstand speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
