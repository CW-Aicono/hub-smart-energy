/**
 * Unified energy type color definitions used across the entire application.
 * All components should import from here to ensure visual consistency.
 *
 * Color scheme:
 *   Strom  (electricity) → Yellow
 *   Gas                  → Orange
 *   Wärme  (heat)        → Red
 *   Wasser (water)       → Blue
 */

/** Labels for energy types */
export const ENERGY_TYPE_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

/** HSL CSS variable references for charts (Recharts fill/stroke) */
export const ENERGY_CHART_COLORS: Record<string, string> = {
  strom: "hsl(var(--energy-strom))",
  gas: "hsl(var(--energy-gas))",
  waerme: "hsl(var(--energy-waerme))",
  wasser: "hsl(var(--energy-wasser))",
};

/** Hex colors for contexts that don't support CSS vars (e.g. PDF export SVGs) */
export const ENERGY_HEX_COLORS: Record<string, string> = {
  strom: "#eab308",
  gas: "#f97316",
  waerme: "#ef4444",
  wasser: "#3b82f6",
  Strom: "#eab308",
  Gas: "#f97316",
  "Wärme": "#ef4444",
  Wasser: "#3b82f6",
};

/** Tailwind classes for icon/text color */
export const ENERGY_ICON_CLASSES: Record<string, string> = {
  strom: "text-energy-strom",
  gas: "text-energy-gas",
  waerme: "text-energy-waerme",
  wasser: "text-energy-wasser",
};

/** Tailwind classes for card/label backgrounds and borders (floor plans, overlays) */
export const ENERGY_CARD_CLASSES: Record<string, string> = {
  strom: "border-energy-strom/40 bg-yellow-50 dark:bg-yellow-950",
  gas: "border-energy-gas/40 bg-orange-50 dark:bg-orange-950",
  waerme: "border-energy-waerme/40 bg-red-50 dark:bg-red-950",
  wasser: "border-energy-wasser/40 bg-blue-50 dark:bg-blue-950",
};

/** Tailwind classes for text + border (sensor overlays in FloorPlanDialog) */
export const ENERGY_SENSOR_CLASSES: Record<string, string> = {
  strom: "text-energy-strom border-energy-strom/30",
  gas: "text-energy-gas border-energy-gas/30",
  waerme: "text-energy-waerme border-energy-waerme/30",
  wasser: "text-energy-wasser border-energy-wasser/30",
};

/** Badge-style Tailwind classes for energy type badges in tables */
export const ENERGY_BADGE_CLASSES: Record<string, string> = {
  strom: "border-energy-strom/40 text-energy-strom bg-yellow-50 dark:bg-yellow-950",
  gas: "border-energy-gas/40 text-energy-gas bg-orange-50 dark:bg-orange-950",
  waerme: "border-energy-waerme/40 text-energy-waerme bg-red-50 dark:bg-red-950",
  wasser: "border-energy-wasser/40 text-energy-wasser bg-blue-50 dark:bg-blue-950",
};
