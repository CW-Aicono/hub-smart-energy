import { TrendingUp, TrendingDown, Leaf, MapPin, AlertTriangle, Gauge, Activity, Zap, Receipt, Sun, ListChecks, Clock, LineChart, Coins } from "lucide-react";
import type { BoardKpis } from "@/hooks/useBoardKpis";

export interface ResolvedTile {
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "danger";
  /** Optionaler React-Subbereich (z. B. Top-Locations-Liste). */
  list?: Array<{ label: string; value: string }>;
}

export interface TileMeta {
  id: string;
  title: string;
  category: "energy" | "esg" | "portfolio" | "trading" | "tasks";
  icon: typeof TrendingUp;
  resolve?: (k: BoardKpis) => ResolvedTile;
}

const fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtEur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const dash = (): ResolvedTile => ({ value: "—", hint: "Keine Daten" });

function eur(n: number | null): ResolvedTile {
  if (n == null) return dash();
  return { value: fmtEur.format(n) };
}

export const TILE_CATALOG: Record<string, TileMeta> = {
  // ── Energie & Kosten ───────────────────────────────────────────────
  cost_today: { id: "cost_today", title: "Kosten heute", category: "energy", icon: Coins,
    resolve: (k) => eur(k.cost_today) },
  cost_month: { id: "cost_month", title: "Kosten Monat", category: "energy", icon: Coins,
    resolve: (k) => eur(k.cost_month) },
  cost_ytd: { id: "cost_ytd", title: "Kosten YTD", category: "energy", icon: Coins,
    resolve: (k) => eur(k.cost_ytd) },
  savings_vs_last_year: { id: "savings_vs_last_year", title: "Einsparung ggü. Vorjahr", category: "energy", icon: TrendingUp,
    resolve: (k) => k.savings_vs_last_year == null
      ? dash()
      : { value: fmtEur.format(Math.abs(k.savings_vs_last_year)),
          hint: k.savings_vs_last_year >= 0 ? "weniger Kosten YTD" : "Mehrkosten YTD",
          tone: k.savings_vs_last_year >= 0 ? "positive" : "danger" } },
  forecast_eom: { id: "forecast_eom", title: "Prognose Monatsende", category: "energy", icon: LineChart,
    resolve: (k) => k.forecast_eom == null
      ? dash()
      : { value: fmtEur.format(k.forecast_eom), hint: "Lineare Hochrechnung" } },

  // ── ESG / Nachhaltigkeit ───────────────────────────────────────────
  co2_month: { id: "co2_month", title: "CO₂ Monat", category: "esg", icon: Leaf,
    resolve: (k) => k.co2_month == null
      ? dash()
      : { value: `${fmt1.format(k.co2_month)} t` } },
  co2_ytd: { id: "co2_ytd", title: "CO₂ YTD", category: "esg", icon: Leaf,
    resolve: (k) => k.co2_ytd == null
      ? dash()
      : { value: `${fmt1.format(k.co2_ytd)} t` } },
  co2_avoided_tons: { id: "co2_avoided_tons", title: "Vermiedene Tonnen CO₂", category: "esg", icon: Leaf,
    resolve: (k) => k.co2_avoided_tons == null
      ? dash()
      : { value: `${fmt1.format(k.co2_avoided_tons)} t`, hint: "YTD durch PV", tone: "positive" } },
  self_consumption_ratio: { id: "self_consumption_ratio", title: "Eigenverbrauchsquote", category: "esg", icon: Sun,
    resolve: (k) => k.self_consumption_ratio == null
      ? { value: "—", hint: "Einspeise-Messung fehlt" }
      : { value: `${fmt1.format(k.self_consumption_ratio)} %`, tone: "positive" } },
  self_sufficiency: { id: "self_sufficiency", title: "Autarkiegrad", category: "esg", icon: Gauge,
    resolve: (k) => k.self_sufficiency == null
      ? { value: "—", hint: "PV oder Verbrauch fehlt" }
      : { value: `${fmt1.format(k.self_sufficiency)} %`, hint: "Monat",
          tone: k.self_sufficiency >= 50 ? "positive" : "default" } },
  pv_yield_month: { id: "pv_yield_month", title: "PV-Ertrag Monat", category: "esg", icon: Sun,
    resolve: (k) => k.pv_yield_month == null
      ? dash()
      : { value: `${fmt.format(k.pv_yield_month)} kWh`, tone: "positive" } },

  // ── Portfolio ──────────────────────────────────────────────────────
  top_locations: { id: "top_locations", title: "Top 3 Standorte (Monat)", category: "portfolio", icon: MapPin,
    resolve: (k) => k.top_locations.length === 0
      ? dash()
      : {
          value: fmtEur.format(k.top_locations[0]?.cost_month ?? 0),
          hint: k.top_locations[0]?.name,
          list: k.top_locations.map((l) => ({ label: l.name, value: fmtEur.format(l.cost_month) })),
        } },
  alerts_open: { id: "alerts_open", title: "Offene Alerts", category: "portfolio", icon: AlertTriangle,
    resolve: (k) => k.alerts_open == null
      ? dash()
      : { value: fmt.format(k.alerts_open), hint: "Integration-Fehler",
          tone: k.alerts_open > 0 ? "warning" : "positive" } },
  gateway_availability: { id: "gateway_availability", title: "Gateway-Verfügbarkeit", category: "portfolio", icon: Activity,
    resolve: (k) => k.gateway_availability == null
      ? dash()
      : { value: `${fmt1.format(k.gateway_availability)} %`, hint: "Heartbeat ≤ 3 min",
          tone: k.gateway_availability >= 95 ? "positive" : k.gateway_availability >= 80 ? "warning" : "danger" } },
  cp_stability: { id: "cp_stability", title: "Ladepunkt-Stabilität", category: "portfolio", icon: Gauge,
    resolve: (k) => k.cp_stability == null
      ? { value: "—", hint: "Keine Ladepunkte" }
      : { value: `${fmt1.format(k.cp_stability)} %`, hint: "30 Tage online",
          tone: k.cp_stability >= 98 ? "positive" : k.cp_stability >= 95 ? "default" : "warning" } },

  // ── Trading ────────────────────────────────────────────────────────
  charging_revenue_month: { id: "charging_revenue_month", title: "Ladevolumen Monat", category: "trading", icon: Zap,
    resolve: (k) => k.charging_kwh_month == null
      ? dash()
      : { value: `${fmt.format(k.charging_kwh_month)} kWh` } },
  trading_pnl_month: { id: "trading_pnl_month", title: "Trading P&L Monat", category: "trading", icon: Activity,
    resolve: (k) => k.trading_pnl_month == null
      ? dash()
      : { value: fmt2.format(k.trading_pnl_month) + " €",
          tone: k.trading_pnl_month >= 0 ? "positive" : "danger" } },
  invoices_open: { id: "invoices_open", title: "Offene Rechnungen", category: "trading", icon: Receipt,
    resolve: (k) => k.invoices_open == null
      ? dash()
      : { value: fmt.format(k.invoices_open),
          tone: k.invoices_open > 0 ? "warning" : "positive" } },

  // ── Aufgaben ───────────────────────────────────────────────────────
  tasks_open: { id: "tasks_open", title: "Offene Aufgaben", category: "tasks", icon: ListChecks,
    resolve: (k) => k.tasks_open == null
      ? dash()
      : { value: fmt.format(k.tasks_open) } },
  tasks_overdue: { id: "tasks_overdue", title: "Überfällige Aufgaben", category: "tasks", icon: Clock,
    resolve: (k) => k.tasks_overdue == null
      ? dash()
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

// Suppress unused import warning for TrendingDown (reserviert für Phase 4 Trend-Indikatoren)
void TrendingDown;
