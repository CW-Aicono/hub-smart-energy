import { useState } from "react";
import {
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  differenceInCalendarMonths,
  differenceInCalendarQuarters,
  differenceInCalendarYears,
} from "date-fns";
import { de } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDashboardFilter, type TimePeriod } from "@/hooks/useDashboardFilter";

interface Props {
  period: TimePeriod | string;
  label: string;
  /** Aktuelles Referenzdatum des Widgets (für Kalender-Default-Monat/-Auswahl). */
  refDate?: Date;
  /** Optional Tailwind width override (different widgets use different min widths). */
  className?: string;
}

/**
 * Klickbares Zeitraum-Label mit Date-Picker.
 * Wird zwischen den Vor-/Zurück-Pfeilen eingebettet. Bei Klick öffnet sich
 * ein Kalender; die Auswahl wird in einen Offset relativ zum heutigen Tag
 * umgerechnet und über `useDashboardFilter().setSelectedOffset` propagiert.
 * Das Label selbst (Datum/KW/Monat/...) bleibt immer sichtbar.
 */
export default function PeriodPickerLabel({ period, label, refDate, className }: Props) {
  const { setSelectedOffset } = useDashboardFilter();
  const [open, setOpen] = useState(false);

  // "all" hat keinen wählbaren Zeitraum -> rein dekoratives Label.
  if (period === "all") {
    return (
      <span className={cn("text-xs text-muted-foreground text-center px-2 py-1", className)}>
        {label}
      </span>
    );
  }

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const today = new Date();
    let offset = 0;
    switch (period) {
      case "day":
        offset = differenceInCalendarDays(date, today);
        break;
      case "week":
        offset = differenceInCalendarWeeks(date, today, { weekStartsOn: 1 });
        break;
      case "month":
        offset = differenceInCalendarMonths(date, today);
        break;
      case "quarter":
        offset = differenceInCalendarQuarters(date, today);
        break;
      case "year":
        offset = differenceInCalendarYears(date, today);
        break;
      default:
        offset = 0;
    }
    setSelectedOffset(offset);
    setOpen(false);
  };

  const useISOWeek = period === "week";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-xs text-muted-foreground hover:text-foreground transition-colors text-center cursor-pointer rounded px-2 py-1 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          aria-label="Zeitraum auswählen"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="center">
        <Calendar
          mode="single"
          selected={refDate}
          defaultMonth={refDate}
          onSelect={handleSelect}
          locale={de}
          weekStartsOn={1}
          ISOWeek={useISOWeek}
          showOutsideDays
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
