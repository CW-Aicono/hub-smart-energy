// Central registry of runtime data requirements for dashboard widgets.
// A widget is only rendered when its requirement returns true.
// Widgets not listed here have no data requirement and are always shown
// (subject to module + user visibility filters upstream).

export interface WidgetAvailabilitySignals {
  hasMeter: boolean;
  hasPvSource: boolean;
  hasGasOrHeatMeter: boolean;
  hasFloorPlan: boolean;
  hasCostTariff: boolean;
  hasDynamicTariff: boolean;
  hasArbitrageStrategy: boolean;
  hasPpaContract: boolean;
  hasSavingsContract: boolean;
  hasIntegrationError: boolean;
  hasMultipleLocations: boolean;
  arbitrageModuleEnabled: boolean;
  gainSharingModuleEnabled: boolean;
}

export interface WidgetRequirement {
  check: (s: WidgetAvailabilitySignals) => boolean;
  /** Short reason shown in the customizer when the requirement fails. */
  reasonKey: string;
}

export const WIDGET_REQUIREMENTS: Record<string, WidgetRequirement> = {
  pv_forecast: {
    check: (s) => s.hasPvSource,
    reasonKey: "widgetReq.pvSourceNeeded",
  },
  cost_overview: {
    check: (s) => s.hasCostTariff,
    reasonKey: "widgetReq.costTariffNeeded",
  },
  spot_price: {
    check: (s) => s.hasDynamicTariff || (s.arbitrageModuleEnabled && s.hasArbitrageStrategy),
    reasonKey: "widgetReq.dynamicOrArbitrageNeeded",
  },
  arbitrage_ai: {
    check: (s) => s.arbitrageModuleEnabled && s.hasArbitrageStrategy,
    reasonKey: "widgetReq.arbitrageStrategyNeeded",
  },
  floor_plan: {
    check: (s) => s.hasFloorPlan,
    reasonKey: "widgetReq.floorPlanNeeded",
  },
  floor_plan_explorer: {
    check: (s) => s.hasFloorPlan,
    reasonKey: "widgetReq.floorPlanNeeded",
  },
  savings_share: {
    check: (s) => s.gainSharingModuleEnabled && s.hasSavingsContract,
    reasonKey: "widgetReq.savingsContractNeeded",
  },
  ppa_fleet: {
    check: (s) => s.hasPpaContract,
    reasonKey: "widgetReq.ppaContractNeeded",
  },
  weather_normalization: {
    check: (s) => s.hasGasOrHeatMeter,
    reasonKey: "widgetReq.gasOrHeatMeterNeeded",
  },
  integration_errors: {
    check: (s) => s.hasIntegrationError,
    reasonKey: "widgetReq.noIntegrationErrors",
  },
  location_map: {
    check: (s) => s.hasMultipleLocations,
    reasonKey: "widgetReq.multipleLocationsNeeded",
  },
  sustainability_kpis: {
    check: (s) => s.hasMeter,
    reasonKey: "widgetReq.meterNeeded",
  },
  energy_gauge: { check: (s) => s.hasMeter, reasonKey: "widgetReq.meterNeeded" },
  energy_chart: { check: (s) => s.hasMeter, reasonKey: "widgetReq.meterNeeded" },
  pie_chart: { check: (s) => s.hasMeter, reasonKey: "widgetReq.meterNeeded" },
  sankey: { check: (s) => s.hasMeter, reasonKey: "widgetReq.meterNeeded" },
  forecast: { check: (s) => s.hasMeter, reasonKey: "widgetReq.meterNeeded" },
  anomaly: { check: (s) => s.hasMeter, reasonKey: "widgetReq.meterNeeded" },
};

export function isWidgetAvailable(
  widgetType: string,
  signals: WidgetAvailabilitySignals | null,
): boolean {
  const req = WIDGET_REQUIREMENTS[widgetType];
  if (!req) return true;
  if (!signals) return true; // during loading, don't hide
  return req.check(signals);
}

export function widgetUnavailableReason(
  widgetType: string,
  signals: WidgetAvailabilitySignals | null,
): string | null {
  const req = WIDGET_REQUIREMENTS[widgetType];
  if (!req || !signals) return null;
  return req.check(signals) ? null : req.reasonKey;
}
