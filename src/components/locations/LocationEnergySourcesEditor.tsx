import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ENERGY_TYPES, type LocationEnergySourceInsert } from "@/hooks/useLocationEnergySources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface LocationEnergySourcesEditorProps {
  value: LocationEnergySourceInsert[];
  onChange: (sources: LocationEnergySourceInsert[]) => void;
}

export function LocationEnergySourcesEditor({ value, onChange }: LocationEnergySourcesEditorProps) {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

  const getDefaultName = (type: string) => {
    const entry = ENERGY_TYPES.find((e) => e.value === type);
    return entry ? T(entry.labelKey) : type;
  };

  const addSource = () => {
    onChange([...value, { energy_type: "strom", custom_name: getDefaultName("strom"), sort_order: value.length }]);
  };

  const removeSource = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateSource = (index: number, updates: Partial<LocationEnergySourceInsert>) => {
    const updated = value.map((item, i) => (i === index ? { ...item, ...updates } : item));
    onChange(updated);
  };

  const handleTypeChange = (index: number, newType: string) => {
    const item = value[index];
    // Auto-update name if it was the default for the old type
    const oldDefault = getDefaultName(item.energy_type);
    const newName = item.custom_name === oldDefault ? getDefaultName(newType) : item.custom_name;
    updateSource(index, { energy_type: newType, custom_name: newName });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {value.map((source, index) => (
          <div key={index} className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={source.energy_type} onValueChange={(v) => handleTypeChange(index, v)}>
              <SelectTrigger className="w-[180px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENERGY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {T(type.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={source.custom_name}
              onChange={(e) => updateSource(index, { custom_name: e.target.value })}
              placeholder={T("energy.customNamePlaceholder")}
              className="flex-1"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeSource(index)} className="shrink-0 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addSource} className="gap-1">
        <Plus className="h-4 w-4" />
        {T("energy.addSource")}
      </Button>
    </div>
  );
}
