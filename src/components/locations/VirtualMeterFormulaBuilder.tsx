import { useState } from "react";
import { Meter } from "@/hooks/useMeters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Trash2, Calculator, PlugZap, Users, MapPin, Gauge } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Eine Quelle für einen virtuellen Zähler. Genau eines der vier
 * `source_*`-Felder ist gesetzt — Spiegel des DB-CHECK-Constraints.
 */
export interface VirtualMeterSource {
  operator: "+" | "-";
  source_meter_id?: string | null;
  source_charge_point_id?: string | null;
  source_charge_point_group_id?: string | null;
  source_all_charge_points?: boolean;
}

export interface ChargePointOption {
  id: string;
  name: string;
}
export interface ChargePointGroupOption {
  id: string;
  name: string;
}

interface VirtualMeterFormulaBuilderProps {
  sources: VirtualMeterSource[];
  onSourcesChange: (sources: VirtualMeterSource[]) => void;
  availableMeters: Meter[];
  availableChargePoints?: ChargePointOption[];
  availableChargePointGroups?: ChargePointGroupOption[];
}

const ALL_CP_VALUE = "__all_charge_points__";

type ParsedValue =
  | { kind: "meter"; id: string }
  | { kind: "cp"; id: string }
  | { kind: "cpg"; id: string }
  | { kind: "all" };

const encode = (p: ParsedValue): string => {
  if (p.kind === "all") return ALL_CP_VALUE;
  return `${p.kind}:${p.id}`;
};
const decode = (s: string): ParsedValue | null => {
  if (!s) return null;
  if (s === ALL_CP_VALUE) return { kind: "all" };
  const [kind, ...rest] = s.split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kind === "meter" || kind === "cp" || kind === "cpg") return { kind, id };
  return null;
};

const sourceKey = (s: VirtualMeterSource): string => {
  if (s.source_meter_id) return encode({ kind: "meter", id: s.source_meter_id });
  if (s.source_charge_point_id) return encode({ kind: "cp", id: s.source_charge_point_id });
  if (s.source_charge_point_group_id) return encode({ kind: "cpg", id: s.source_charge_point_group_id });
  if (s.source_all_charge_points) return ALL_CP_VALUE;
  return "";
};

const buildSource = (parsed: ParsedValue, operator: "+" | "-"): VirtualMeterSource => {
  switch (parsed.kind) {
    case "meter":
      return { operator, source_meter_id: parsed.id };
    case "cp":
      return { operator, source_charge_point_id: parsed.id };
    case "cpg":
      return { operator, source_charge_point_group_id: parsed.id };
    case "all":
      return { operator, source_all_charge_points: true };
  }
};

export const VirtualMeterFormulaBuilder = ({
  sources,
  onSourcesChange,
  availableMeters,
  availableChargePoints = [],
  availableChargePointGroups = [],
}: VirtualMeterFormulaBuilderProps) => {
  const [pendingValue, setPendingValue] = useState("");
  const { t } = useTranslation();

  const usedKeys = new Set(sources.map(sourceKey));

  const selectableMeters = availableMeters.filter(
    (m) => !m.is_archived && m.capture_type !== "virtual" && !usedKeys.has(encode({ kind: "meter", id: m.id })),
  );
  const selectableCps = availableChargePoints.filter((c) => !usedKeys.has(encode({ kind: "cp", id: c.id })));
  const selectableCpGroups = availableChargePointGroups.filter(
    (g) => !usedKeys.has(encode({ kind: "cpg", id: g.id })),
  );
  const allCpBlockUsed = usedKeys.has(ALL_CP_VALUE);

  const totalSelectable =
    selectableMeters.length + selectableCps.length + selectableCpGroups.length + (allCpBlockUsed ? 0 : 1);

  const addSource = (operator: "+" | "-") => {
    const parsed = decode(pendingValue);
    if (!parsed) return;
    onSourcesChange([...sources, buildSource(parsed, operator)]);
    setPendingValue("");
  };

  const removeSource = (index: number) => onSourcesChange(sources.filter((_, i) => i !== index));

  const toggleOperator = (index: number) => {
    const updated = [...sources];
    updated[index] = { ...updated[index], operator: updated[index].operator === "+" ? "-" : "+" };
    onSourcesChange(updated);
  };

  const describeSource = (
    s: VirtualMeterSource,
  ): { icon: JSX.Element; label: string; sub: string } => {
    if (s.source_meter_id) {
      const m = availableMeters.find((x) => x.id === s.source_meter_id);
      const types: Record<string, string> = {
        strom: "Strom",
        gas: "Gas",
        waerme: "Wärme",
        wasser: "Wasser",
      };
      return {
        icon: <Gauge className="h-3.5 w-3.5" />,
        label: m?.name ?? "Unbekannter Zähler",
        sub: m ? types[m.energy_type] ?? m.energy_type : "",
      };
    }
    if (s.source_charge_point_id) {
      const cp = availableChargePoints.find((x) => x.id === s.source_charge_point_id);
      return {
        icon: <PlugZap className="h-3.5 w-3.5" />,
        label: cp?.name ?? "Unbekannter Ladepunkt",
        sub: "Ladepunkt",
      };
    }
    if (s.source_charge_point_group_id) {
      const g = availableChargePointGroups.find((x) => x.id === s.source_charge_point_group_id);
      return {
        icon: <Users className="h-3.5 w-3.5" />,
        label: g?.name ?? "Unbekannte Gruppe",
        sub: "Ladepunkt-Gruppe",
      };
    }
    return {
      icon: <MapPin className="h-3.5 w-3.5" />,
      label: "Alle Ladepunkte dieser Liegenschaft",
      sub: "dynamisch aufgelöst",
    };
  };

  const formulaPreview =
    sources.length > 0
      ? sources
          .map((s, i) => {
            const { label } = describeSource(s);
            return `${i === 0 && s.operator === "+" ? "" : s.operator === "+" ? " + " : " − "}${label}`;
          })
          .join("") + " = Virtueller Zähler"
      : "Noch keine Quellen ausgewählt";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-muted-foreground" />
        <Label className="font-medium">Berechnungsformel</Label>
        <HelpTooltip text={t("tooltip.virtualMeterFormula" as any)} iconSize={12} />
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((source, index) => {
            const { icon, label, sub } = describeSource(source);
            return (
              <div key={index} className="flex items-center gap-2 rounded-md border bg-background p-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => toggleOperator(index)}
                  title={source.operator === "+" ? "Addieren → Subtrahieren" : "Subtrahieren → Addieren"}
                >
                  {source.operator === "+" ? (
                    <Plus className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Minus className="h-3.5 w-3.5 text-red-500" />
                  )}
                </Button>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate flex items-center gap-1.5">
                    <span className="text-muted-foreground">{icon}</span>
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">{sub}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSource(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {totalSelectable > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Quelle hinzufügen</Label>
            <Select value={pendingValue} onValueChange={setPendingValue}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Zähler, Ladepunkt oder Gruppe auswählen" />
              </SelectTrigger>
              <SelectContent>
                {selectableMeters.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Zähler</SelectLabel>
                    {selectableMeters.map((m) => (
                      <SelectItem key={`meter-${m.id}`} value={encode({ kind: "meter", id: m.id })}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {selectableCps.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Ladepunkte</SelectLabel>
                    {selectableCps.map((c) => (
                      <SelectItem key={`cp-${c.id}`} value={encode({ kind: "cp", id: c.id })}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {selectableCpGroups.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Ladepunkt-Gruppen</SelectLabel>
                    {selectableCpGroups.map((g) => (
                      <SelectItem key={`cpg-${g.id}`} value={encode({ kind: "cpg", id: g.id })}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {!allCpBlockUsed && (availableChargePoints.length > 0 || availableChargePointGroups.length > 0) && (
                  <SelectGroup>
                    <SelectLabel>Sammelauswahl</SelectLabel>
                    <SelectItem value={ALL_CP_VALUE}>Alle Ladepunkte dieser Liegenschaft</SelectItem>
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!pendingValue}
            onClick={() => addSource("+")}
          >
            <Plus className="h-3.5 w-3.5" /> Add.
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!pendingValue}
            onClick={() => addSource("-")}
          >
            <Minus className="h-3.5 w-3.5" /> Sub.
          </Button>
        </div>
      )}

      {totalSelectable === 0 && sources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Keine geeigneten Quellen vorhanden. Legen Sie zuerst Zähler oder Ladepunkte für diese Liegenschaft an.
        </p>
      )}

      {sources.length > 0 && (
        <div className="rounded-md bg-background border p-2">
          <p className="text-xs text-muted-foreground mb-1">Vorschau:</p>
          <p className="text-sm font-mono">{formulaPreview}</p>
        </div>
      )}

      {sources.length === 1 && (
        <p className="text-xs text-muted-foreground">
          Hinweis: Ein virtueller Zähler funktioniert auch mit einer einzelnen Quelle (z.B. „Alle Ladepunkte" als Wallbox-Summenzähler).
        </p>
      )}
    </div>
  );
};
