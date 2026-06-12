import { TrendingUp, Leaf, MapPin, AlertTriangle, Gauge, Activity, Zap, Receipt, Sun, ListChecks, Clock, LineChart, Coins } from "lucide-react";

export interface TileMeta {
  id: string;
  title: string;
  category: "energy" | "esg" | "portfolio" | "trading" | "tasks";
  icon: typeof TrendingUp;
}

export const TILE_CATALOG: Record<string, TileMeta> = {
  // Energie & Kosten
  cost_today:           { id: "cost_today",           title: "Kosten heute",           category: "energy",   icon: Coins },
  cost_month:           { id: "cost_month",           title: "Kosten Monat",           category: "energy",   icon: Coins },
  cost_ytd:             { id: "cost_ytd",             title: "Kosten YTD",             category: "energy",   icon: Coins },
  savings_vs_last_year: { id: "savings_vs_last_year", title: "Einsparung ggü. Vorjahr", category: "energy",   icon: TrendingUp },
  forecast_eom:         { id: "forecast_eom",         title: "Prognose Monatsende",     category: "energy",   icon: LineChart },

  // ESG / Nachhaltigkeit
  co2_month:               { id: "co2_month",               title: "CO₂ Monat",             category: "esg", icon: Leaf },
  co2_ytd:                 { id: "co2_ytd",                 title: "CO₂ YTD",               category: "esg", icon: Leaf },
  co2_avoided_tons:        { id: "co2_avoided_tons",        title: "Vermiedene Tonnen CO₂", category: "esg", icon: Leaf },
  self_consumption_ratio:  { id: "self_consumption_ratio",  title: "Eigenverbrauchsquote",  category: "esg", icon: Sun },
  self_sufficiency:        { id: "self_sufficiency",        title: "Autarkiegrad",          category: "esg", icon: Gauge },
  pv_yield_month:          { id: "pv_yield_month",          title: "PV-Ertrag Monat",       category: "esg", icon: Sun },

  // Portfolio
  top_locations:        { id: "top_locations",        title: "Top/Flop-Standorte",      category: "portfolio", icon: MapPin },
  alerts_open:          { id: "alerts_open",          title: "Offene Alerts",           category: "portfolio", icon: AlertTriangle },

  // Trading
  charging_revenue_month: { id: "charging_revenue_month", title: "Lade-Umsatz Monat",    category: "trading", icon: Zap },
  trading_pnl_month:      { id: "trading_pnl_month",      title: "Trading P&L Monat",    category: "trading", icon: Activity },
  invoices_open:          { id: "invoices_open",          title: "Offene Rechnungen",    category: "trading", icon: Receipt },

  // Technik
  gateway_availability: { id: "gateway_availability", title: "Gateway-Verfügbarkeit", category: "portfolio", icon: Activity },
  cp_stability:         { id: "cp_stability",         title: "Ladepunkt-Stabilität",   category: "portfolio", icon: Gauge },

  // Aufgaben
  tasks_open:    { id: "tasks_open",    title: "Offene Aufgaben",    category: "tasks", icon: ListChecks },
  tasks_overdue: { id: "tasks_overdue", title: "Überfällige Aufgaben", category: "tasks", icon: Clock },
};

export const CATEGORY_LABELS: Record<TileMeta["category"], string> = {
  energy: "Energie & Kosten",
  esg: "Nachhaltigkeit",
  portfolio: "Portfolio",
  trading: "Trading",
  tasks: "Aufgaben",
};
