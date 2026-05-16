import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { METER_OFFSET_REASONS, type MeterOffsetReason } from "@/lib/meterOffset";

interface MeterOffsetSectionProps {
  /** Offset in kWh as string (German comma allowed). Empty string = 0. */
  value: string;
  onValueChange: (v: string) => void;
  reason: MeterOffsetReason | "";
  onReasonChange: (v: MeterOffsetReason | "") => void;
  note: string;
  onNoteChange: (v: string) => void;
  unit?: string;
}

/**
 * Reusable form section for the per-meter offset (Anfangsbestand).
 * Used in both Add- and Edit-Meter dialogs.
 *
 * Spec: see `src/lib/meterOffset.ts` – the offset is added to the displayed
 * absolute meter level, but does NOT change differences/consumption.
 */
export function MeterOffsetSection({
  value,
  onValueChange,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  unit = "kWh",
}: MeterOffsetSectionProps) {
  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <div>
        <p className="text-sm font-medium">Anfangsbestand / Offset</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Wird zum gemessenen Zählerstand addiert (z. B. wenn der reale Zähler bereits
          einen Stand hat oder das Gerät getauscht wurde). Verbrauchsdifferenzen
          (kWh/Tag, kWh/Monat) bleiben davon unberührt.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Offset ({unit})</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label>Grund</Label>
          <Select
            value={reason || "none"}
            onValueChange={(v) => onReasonChange(v === "none" ? "" : (v as MeterOffsetReason))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— (kein Offset)</SelectItem>
              {METER_OFFSET_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Notiz (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          placeholder="z. B. Zählerstand am Tag der Übernahme: 145.823 kWh"
          className="mt-1"
        />
      </div>
    </div>
  );
}
