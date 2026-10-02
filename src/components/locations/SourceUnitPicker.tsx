import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOURCE_UNIT_GROUPS,
  SourceUnitGroup,
  getUnitCategory,
  getUnitsForCategory,
} from "@/lib/sensorUnits";

interface SourceUnitPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional additional category groups (e.g. cumulative energy in bulk edit). */
  extraGroups?: SourceUnitGroup[];
  /** Style trigger compact (h-8 text-xs) or default. */
  compact?: boolean;
  className?: string;
}

/**
 * Two coupled dropdowns: category first, then unit filtered by category.
 * Replaces the single long grouped select for meter/sensor source units.
 */
export const SourceUnitPicker = ({
  value,
  onChange,
  extraGroups = [],
  compact = false,
  className,
}: SourceUnitPickerProps) => {
  const allGroups = useMemo<SourceUnitGroup[]>(
    () => [...SOURCE_UNIT_GROUPS, ...extraGroups],
    [extraGroups],
  );

  const currentCategory =
    getUnitCategory(value, extraGroups) ?? allGroups[0]?.label ?? "";

  const unitsInCategory = useMemo(
    () => getUnitsForCategory(currentCategory, extraGroups),
    [currentCategory, extraGroups],
  );

  const triggerCls = compact ? "h-8 text-xs" : "";

  const handleCategoryChange = (nextCategory: string) => {
    const nextUnits = getUnitsForCategory(nextCategory, extraGroups);
    if (nextUnits.length === 0) return;
    // If current value already belongs to the new category, keep it; else pick first.
    const stillValid = nextUnits.some((o) => o.value === value);
    onChange(stillValid ? value : nextUnits[0].value);
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${className ?? ""}`}>
      <Select value={currentCategory} onValueChange={handleCategoryChange}>
        <SelectTrigger className={triggerCls}>
          <SelectValue placeholder="Kategorie" />
        </SelectTrigger>
        <SelectContent>
          {allGroups.map((g) => (
            <SelectItem key={g.label} value={g.label}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={triggerCls}>
          <SelectValue placeholder="Einheit" />
        </SelectTrigger>
        <SelectContent>
          {unitsInCategory.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
