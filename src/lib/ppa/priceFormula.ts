import { z } from "zod";

export const PriceModelEnum = z.enum([
  "fixed",
  "index_linked",
  "spot_plus_premium",
  "floor_cap",
]);
export type PriceModel = z.infer<typeof PriceModelEnum>;

export const FixedFormulaSchema = z.object({}).passthrough().nullable();
export const SpotPlusPremiumFormulaSchema = z.object({
  base: z.literal("epex_spot").default("epex_spot"),
  premium: z.number(),
});
export const FloorCapFormulaSchema = z
  .object({
    base: z.literal("epex_spot").default("epex_spot"),
    floor: z.number(),
    cap: z.number(),
  })
  .refine((v) => v.floor <= v.cap, { message: "floor must be <= cap" });
export const IndexLinkedFormulaSchema = z.object({
  base: z.literal("epex_spot").default("epex_spot"),
  factor: z.number(),
  offset: z.number(),
});

export type PriceFormula =
  | null
  | z.infer<typeof SpotPlusPremiumFormulaSchema>
  | z.infer<typeof FloorCapFormulaSchema>
  | z.infer<typeof IndexLinkedFormulaSchema>;

/**
 * Calculate the applicable €/kWh price for a given price model.
 * @param epexEurPerKwh Current or average EPEX spot price in €/kWh
 */
export function computeApplicablePrice(
  model: PriceModel,
  priceEurPerKwh: number | null | undefined,
  formula: any,
  epexEurPerKwh: number | null,
): number | null {
  if (model === "fixed") return priceEurPerKwh ?? null;
  if (epexEurPerKwh == null) return null;
  if (model === "spot_plus_premium") {
    const premium = Number(formula?.premium ?? 0);
    return epexEurPerKwh + premium;
  }
  if (model === "floor_cap") {
    const floor = Number(formula?.floor ?? 0);
    const cap = Number(formula?.cap ?? 0);
    return Math.max(floor, Math.min(cap, epexEurPerKwh));
  }
  if (model === "index_linked") {
    const factor = Number(formula?.factor ?? 1);
    const offset = Number(formula?.offset ?? 0);
    return epexEurPerKwh * factor + offset;
  }
  return null;
}

export function priceModelLabel(model: PriceModel): string {
  switch (model) {
    case "fixed":
      return "Festpreis";
    case "spot_plus_premium":
      return "Spot + Premium";
    case "floor_cap":
      return "Floor / Cap";
    case "index_linked":
      return "Indexgebunden";
  }
}
