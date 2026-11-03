import { format } from "date-fns";
import { de, enGB, es, nl } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";

export function BookingDatePicker({ label, value, onChange, disabledDate }: { label: string; value: string; onChange: (value: string) => void; disabledDate?: (date: Date) => boolean }) {
  const { language } = useTranslation();
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  return <div className="space-y-1"><Label>{label}</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal" aria-label={label}><CalendarIcon className="mr-2 h-4 w-4" />{selected?.toLocaleDateString("de-DE") ?? "—"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" locale={{ de, en: enGB, es, nl }[language]} selected={selected} defaultMonth={selected} disabled={disabledDate} onSelect={date => { if (date) onChange(format(date, "yyyy-MM-dd")); }} initialFocus className="pointer-events-auto p-3" /></PopoverContent></Popover></div>;
}