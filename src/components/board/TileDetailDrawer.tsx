import { useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { BoardKpis } from "@/hooks/useBoardKpis";
import { TILE_CATALOG } from "./tileCatalog";

interface Props {
  tileId: string | null;
  kpis: BoardKpis | null;
  onClose: () => void;
}

interface DetailBlock {
  label: string;
  value: string;
}

/** Mapping: Kachel-ID → Tenant-Zielroute */
const TILE_LINKS: Record<string, { label: string; route: string }> = {
  cost_today: { label: "Energiedaten öffnen", route: "/energy-data" },
  cost_month: { label: "Energiedaten öffnen", route: "/energy-data" },
  cost_ytd: { label: "Energiedaten öffnen", route: "/energy-data" },
  savings_vs_last_year: { label: "Energiebericht öffnen", route: "/energy-report" },
  forecast_eom: { label: "Energiebericht öffnen", route: "/energy-report" },
  co2_month: { label: "Energiebericht öffnen", route: "/energy-report" },
  co2_ytd: { label: "Energiebericht öffnen", route: "/energy-report" },
  co2_avoided_tons: { label: "Energiebericht öffnen", route: "/energy-report" },
  self_consumption_ratio: { label: "Energiebericht öffnen", route: "/energy-report" },
  self_sufficiency: { label: "Energiebericht öffnen", route: "/energy-report" },
  pv_yield_month: { label: "Energiebericht öffnen", route: "/energy-report" },
  top_locations: { label: "Standorte öffnen", route: "/locations" },
  alerts_open: { label: "Aufgaben öffnen", route: "/tasks" },
  gateway_availability: { label: "Integrationen öffnen", route: "/integrations" },
  cp_stability: { label: "Ladepunkte öffnen", route: "/charging/points" },
  charging_revenue_month: { label: "Ladepunkte öffnen", route: "/charging/points" },
  trading_pnl_month: { label: "Arbitrage-Trading öffnen", route: "/arbitrage" },
  invoices_open: { label: "Energiedaten öffnen", route: "/energy-data" },
  tasks_open: { label: "Aufgaben öffnen", route: "/tasks" },
  tasks_overdue: { label: "Aufgaben öffnen", route: "/tasks" },
};


const fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtEur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Kontext-Blöcke je nach Kachel: zeigt zusammenhängende KPIs */
function buildContext(tileId: string, k: BoardKpis): DetailBlock[] {
  const blocks: DetailBlock[] = [];
  const add = (label: string, v: number | null, fmtFn: (n: number) => string) => {
    if (v != null) blocks.push({ label, value: fmtFn(v) });
  };

  switch (tileId) {
    case "cost_today":
    case "cost_month":
    case "cost_ytd":
    case "forecast_eom":
    case "savings_vs_last_year":
      add("Kosten heute", k.cost_today, fmtEur.format);
      add("Kosten Monat", k.cost_month, fmtEur.format);
      add("Prognose Monatsende", k.forecast_eom, fmtEur.format);
      add("Kosten YTD", k.cost_ytd, fmtEur.format);
      if (k.savings_vs_last_year != null) {
        blocks.push({
          label: k.savings_vs_last_year >= 0 ? "Einsparung ggü. Vorjahr" : "Mehrkosten ggü. Vorjahr",
          value: fmtEur.format(Math.abs(k.savings_vs_last_year)),
        });
      }
      break;
    case "co2_month":
    case "co2_ytd":
    case "co2_avoided_tons":
      add("CO₂ Monat", k.co2_month, (v) => `${fmt1.format(v)} t`);
      add("CO₂ YTD", k.co2_ytd, (v) => `${fmt1.format(v)} t`);
      add("Vermieden durch PV", k.co2_avoided_tons, (v) => `${fmt1.format(v)} t`);
      break;
    case "self_consumption_ratio":
    case "self_sufficiency":
    case "pv_yield_month":
      add("Eigenverbrauchsquote", k.self_consumption_ratio, (v) => `${fmt1.format(v)} %`);
      add("Autarkiegrad", k.self_sufficiency, (v) => `${fmt1.format(v)} %`);
      add("PV-Ertrag Monat", k.pv_yield_month, (v) => `${fmt.format(v)} kWh`);
      add("PV-Ertrag YTD", k.pv_yield_ytd, (v) => `${fmt.format(v)} kWh`);
      break;
    case "tasks_open":
    case "tasks_overdue":
    case "alerts_open":
      add("Offene Aufgaben", k.tasks_open, fmt.format);
      add("Überfällige Aufgaben", k.tasks_overdue, fmt.format);
      add("Offene Alerts (Integrationen)", k.alerts_open, fmt.format);
      break;
    case "gateway_availability":
    case "cp_stability":
      add("Gateway-Verfügbarkeit", k.gateway_availability, (v) => `${fmt1.format(v)} %`);
      add("Ladepunkt-Stabilität", k.cp_stability, (v) => `${fmt1.format(v)} %`);
      break;
    case "charging_revenue_month":
    case "trading_pnl_month":
    case "invoices_open":
      add("Ladevolumen Monat", k.charging_kwh_month, (v) => `${fmt.format(v)} kWh`);
      add("Trading P&L Monat", k.trading_pnl_month, (v) => `${fmt1.format(v)} €`);
      add("Offene Rechnungen", k.invoices_open, fmt.format);
      break;
    case "top_locations":
      for (const l of k.top_locations) {
        blocks.push({ label: l.name, value: fmtEur.format(l.cost_month) });
      }
      break;
  }
  return blocks;
}

export default function TileDetailDrawer({ tileId, kpis, onClose }: Props) {
  const navigate = useNavigate();
  const meta = tileId ? TILE_CATALOG[tileId] : null;
  const link = tileId ? TILE_LINKS[tileId] : null;
  const open = !!tileId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !meta) return null;

  const resolved = kpis && meta.resolve ? meta.resolve(kpis) : null;
  const context = kpis && tileId ? buildContext(tileId, kpis) : [];
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={meta.title}>
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <aside className="w-full max-w-md bg-[hsl(var(--board-card))] border-l border-[hsl(var(--board-border))] shadow-2xl animate-slide-in-right flex flex-col">
        <header className="flex items-center justify-between p-5 border-b border-[hsl(var(--board-border))]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[hsl(var(--board-accent))]/10 p-2">
              <Icon className="h-5 w-5 text-[hsl(var(--board-accent))]" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
                Detail-Ansicht
              </div>
              <div className="text-base font-semibold text-[hsl(var(--board-foreground))]">
                {meta.title}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-[hsl(var(--board-background))]"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <div className="text-5xl font-semibold tracking-tight tabular-nums text-[hsl(var(--board-foreground))]">
              {resolved?.value ?? "—"}
            </div>
            {resolved?.hint && (
              <div className="mt-2 text-sm text-[hsl(var(--board-muted))]">{resolved.hint}</div>
            )}
          </div>

          {context.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-[hsl(var(--board-muted))] mb-3">
                Im Zusammenhang
              </div>
              <ul className="divide-y divide-[hsl(var(--board-border))] rounded-xl border border-[hsl(var(--board-border))] overflow-hidden">
                {context.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between px-4 py-3 bg-[hsl(var(--board-background))]/40"
                  >
                    <span className="text-sm text-[hsl(var(--board-foreground))]">{b.label}</span>
                    <span className="text-sm font-medium tabular-nums text-[hsl(var(--board-foreground))]">
                      {b.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {link && (
          <footer className="p-5 border-t border-[hsl(var(--board-border))]">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(link.route);
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--board-accent))] text-[hsl(var(--board-background))] py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {link.label}
              <ArrowRight className="h-4 w-4" />
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
