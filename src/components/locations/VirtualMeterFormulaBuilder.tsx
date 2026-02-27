import { useState } from "react";
import { Meter } from "@/hooks/useMeters";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Trash2, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/ui/help-tooltip";

export interface VirtualMeterSource {
  source_meter_id: string;
  operator: "+" | "-";
}

interface VirtualMeterFormulaBuilderProps {
  sources: VirtualMeterSource[];
  onSourcesChange: (sources: VirtualMeterSource[]) => void;
  availableMeters: Meter[];
}

export const VirtualMeterFormulaBuilder = ({
  sources,
  onSourcesChange,
  availableMeters,
}: VirtualMeterFormulaBuilderProps) => {
  const [addingMeterId, setAddingMeterId] = useState("");

  const usedMeterIds = new Set(sources.map((s) => s.source_meter_id));
  const selectableMeters = availableMeters.filter(
    (m) => !m.is_archived && m.capture_type !== "virtual" && !usedMeterIds.has(m.id)
  );

  const addSource = (operator: "+" | "-") => {
    if (!addingMeterId) return;
    onSourcesChange([...sources, { source_meter_id: addingMeterId, operator }]);
    setAddingMeterId("");
  };

  const removeSource = (index: number) => {
    onSourcesChange(sources.filter((_, i) => i !== index));
  };

  const toggleOperator = (index: number) => {
    const updated = [...sources];
    updated[index] = { ...updated[index], operator: updated[index].operator === "+" ? "-" : "+" };
    onSourcesChange(updated);
  };

  const getMeterName = (id: string) => availableMeters.find((m) => m.id === id)?.name || "Unbekannt";
  const getMeterType = (id: string) => {
    const meter = availableMeters.find((m) => m.id === id);
    if (!meter) return "";
    const types: Record<string, string> = { strom: "Strom", gas: "Gas", waerme: "Wärme", wasser: "Wasser" };
    return types[meter.energy_type] || meter.energy_type;
  };

  // Build formula preview: Source1 − Source2 − Source3 = Virtueller Zähler
  const formulaPreview = sources.length > 0
    ? sources.map((s, i) => `${i === 0 && s.operator === "+" ? "" : s.operator === "+" ? " + " : " − "}${getMeterName(s.source_meter_id)}`).join("") + " = Virtueller Zähler"
    : "Noch keine Quellzähler ausgewählt";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-muted-foreground" />
        <Label className="font-medium">Berechnungsformel</Label>
        <HelpTooltip text="Definieren Sie, wie der virtuelle Zähler berechnet wird: Addieren (+) oder subtrahieren (−) Sie die Werte anderer Zähler." iconSize={12} />
      </div>

      {/* Current sources */}
      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((source, index) => (
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
                <span className="text-sm font-medium truncate block">{getMeterName(source.source_meter_id)}</span>
                <span className="text-xs text-muted-foreground">{getMeterType(source.source_meter_id)}</span>
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
          ))}
        </div>
      )}

      {/* Add new source */}
      {selectableMeters.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Quellzähler hinzufügen</Label>
            <Select value={addingMeterId} onValueChange={setAddingMeterId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Zähler auswählen" />
              </SelectTrigger>
              <SelectContent>
                {selectableMeters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!addingMeterId}
            onClick={() => addSource("+")}
          >
            <Plus className="h-3.5 w-3.5" /> Add.
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!addingMeterId}
            onClick={() => addSource("-")}
          >
            <Minus className="h-3.5 w-3.5" /> Sub.
          </Button>
        </div>
      )}

      {selectableMeters.length === 0 && sources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Keine geeigneten Quellzähler vorhanden. Erstellen Sie zuerst manuelle oder automatische Zähler.
        </p>
      )}

      {/* Formula preview */}
      {sources.length > 0 && (
        <div className="rounded-md bg-background border p-2">
          <p className="text-xs text-muted-foreground mb-1">Vorschau:</p>
          <p className="text-sm font-mono">{formulaPreview}</p>
        </div>
      )}

      {sources.length < 2 && sources.length > 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          ⚠ Mindestens zwei Quellzähler erforderlich.
        </p>
      )}
    </div>
  );
};
