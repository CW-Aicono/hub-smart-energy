import { TrendingUp, Leaf, MapPin, AlertTriangle, Gauge, Activity, Zap, Receipt, Sun, ListChecks, Clock, LineChart, Coins } from "lucide-react";
import type { BoardKpis } from "@/hooks/useBoardKpis";

export interface TileMeta {
  id: string;
  title: string;
  category: "energy" | "esg" | "portfolio" | "trading" | "tasks";
  icon: typeof TrendingUp;
  /** Liefert formatierten Wert + Hinweis. value=null → "—". */
  resolve?: (k: BoardKpis) => { value: string; hint?: string; tone?: "default" | "positive" | "warning" | "danger" };
}

const fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtEur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const dash = () => ({ value: "—", hint: "Daten folgen" });

export const TILE_CATALOG: Record<string, TileMeta> = {
  // Energie & Kosten
  cost_today:           { id: "cost_today",           title: "Kosten heute",           category: "energy",   icon: Coins,     resolve: dash },
  cost_month:           { id: "cost_month",           title: "Kosten Monat",           category: "energy",   icon: Coins,     resolve: dash },
  cost_ytd:             { id: "cost_ytd",             title: "Kosten YTD",             category: "energy",   icon: Coins,     resolve: dash },
  savings_vs_last_year: { id: "savings_vs_last_year", title: "Einsparung ggü. Vorjahr", category: "energy",   icon: TrendingUp, resolve: dash },
  forecast_eom:         { id: "forecast_eom",         title: "Prognose Monatsende",     category: "energy",   icon: LineChart,  resolve: dash },

  // ESG / Nachhaltigkeit
  co2_month:               { id: "co2_month",               title: "CO₂ Monat",             category: "esg", icon: Leaf,  resolve: dash },
  co2_ytd:                 { id: "co2_ytd",                 title: "CO₂ YTD",               category: "esg", icon: Leaf,  resolve: dash },
  co2_avoided_tons:        { id: "co2_avoided_tons",        title: "Vermiedene Tonnen CO₂", category: "esg", icon: Leaf,
    resolve: (k) => k.co2_avoided_tons == null
      ? { value: "—" }
      : { value: `${fmt1.format(k.co2_avoided_tons)} t`, hint: "YTD · Ø 0,4 kg CO₂/kWh", tone: "positive" } },
  self_consumption_ratio:  { id: "self_consumption_ratio",  title: "Eigenverbrauchsquote",  category: "esg", icon: Sun,   resolve: dash },
  self_sufficiency:        { id: "self_sufficiency",        title: "Autarkiegrad",          category: "esg", icon: Gauge, resolve: dash },
  pv_yield_month:          { id: "pv_yield_month",          title: "PV-Ertrag Monat",       category: "esg", icon: Sun,
    resolve: (k) => k.pv_yield_month == null
      ? { value: "—" }
      : { value: `${fmt.format(k.pv_yield_month)} kWh`, tone: "positive" } },

  // Portfolio
  top_locations:        { id: "top_locations",        title: "Top/Flop-Standorte",      category: "portfolio", icon: MapPin,        resolve: dash },
  alerts_open:          { id: "alerts_open",          title: "Offene Alerts",           category: "portfolio", icon: AlertTriangle, resolve: dash },
  gateway_availability: { id: "gateway_availability", title: "Gateway-Verfügbarkeit",   category: "portfolio", icon: Activity,      resolve: dash },
  cp_stability:         { id: "cp_stability",         title: "Ladepunkt-Stabilität",     category: "portfolio", icon: Gauge,
    resolve: (k) => k.cp_stability == null
      ? { value: "—", hint: "Keine Ladepunkte" }
      : { value: `${fmt1.format(k.cp_stability)} %`, hint: "30 Tage online",
          tone: k.cp_stability >= 98 ? "positive" : k.cp_stability >= 95 ? "default" : "warning" } },

  // Trading
  charging_revenue_month: { id: "charging_revenue_month", title: "Ladevolumen Monat",    category: "trading", icon: Zap,
    resolve: (k) => k.charging_kwh_month == null
      ? { value: "—" }
      : { value: `${fmt.format(k.charging_kwh_month)} kWh` } },
  trading_pnl_month:      { id: "trading_pnl_month",      title: "Trading P&L Monat",    category: "trading", icon: Activity,
    resolve: (k) => k.trading_pnl_month == null
      ? { value: "—" }
      : { value: fmtEur.format(k.trading_pnl_month),
          tone: k.trading_pnl_month >= 0 ? "positive" : "danger" } },
  invoices_open:          { id: "invoices_open",          title: "Offene Rechnungen",    category: "trading", icon: Receipt,
    resolve: (k) => k.invoices_open == null
      ? { value: "—" }
      : { value: fmt.format(k.invoices_open),
          tone: k.invoices_open > 0 ? "warning" : "positive" } },

  // Aufgaben
  tasks_open:    { id: "tasks_open",    title: "Offene Aufgaben",      category: "tasks", icon: ListChecks,
    resolve: (k) => k.tasks_open == null
      ? { value: "—" }
      : { value: fmt.format(k.tasks_open) } },
  tasks_overdue: { id: "tasks_overdue", title: "Überfällige Aufgaben", category: "tasks", icon: Clock,
    resolve: (k) => k.tasks_overdue == null
      ? { value: "—" }
      : { value: fmt.format(k.tasks_overdue),
          tone: k.tasks_overdue > 0 ? "danger" : "positive" } },
};

export const CATEGORY_LABELS: Record<TileMeta["category"], string> = {
  energy: "Energie & Kosten",
  esg: "Nachhaltigkeit",
  portfolio: "Portfolio",
  trading: "Trading",
  tasks: "Aufgaben",
};
