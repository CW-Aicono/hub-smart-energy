import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info, Lightbulb, Calculator } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { useBoardKpis, type BoardKpis } from "@/hooks/useBoardKpis";
import { TILE_CATALOG, CATEGORY_LABELS } from "@/components/board/tileCatalog";
import { TILE_INFO } from "@/components/board/tileInfo";
import BoardThemeScope from "@/components/board/BoardThemeScope";
import { useBoardThemes, useBoardUserLayout } from "@/hooks/useBoard";

const fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtEur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

interface Block { label: string; value: string }

function buildContext(tileId: string, k: BoardKpis): Block[] {
  const blocks: Block[] = [];
  const add = (label: string, v: number | null, f: (n: number) => string) => {
    if (v != null) blocks.push({ label, value: f(v) });
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
      for (const l of k.top_locations) blocks.push({ label: l.name, value: fmtEur.format(l.cost_month) });
      break;
  }
  return blocks;
}

export default function BoardTileDetail() {
  const { tileId = "" } = useParams<{ tileId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { data: kpiData } = useBoardKpis(tenant?.id ?? null);
  const { themes } = useBoardThemes();
  const { layout } = useBoardUserLayout();

  const meta = TILE_CATALOG[tileId];
  const info = TILE_INFO[tileId];
  const kpis = kpiData?.kpis ?? null;
  const activeTheme = themes.find((t) => t.id === layout?.theme_id) ?? themes[0] ?? null;

  if (!meta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Kennzahl nicht gefunden</h1>
        <button className="text-sm underline" onClick={() => navigate("/board")}>
          Zurück zum Board
        </button>
      </div>
    );
  }

  const resolved = kpis && meta.resolve ? meta.resolve(kpis) : null;
  const context = kpis ? buildContext(tileId, kpis) : [];
  const Icon = meta.icon;

  return (
    <BoardThemeScope theme={activeTheme} mode={layout?.theme_mode ?? "system"}>
      <div className="min-h-screen bg-[hsl(var(--board-background))] text-[hsl(var(--board-foreground))] animate-fade-in">
        <header className="sticky top-0 z-10 bg-[hsl(var(--board-background))]/85 backdrop-blur border-b border-[hsl(var(--board-border))]">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/board")}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[hsl(var(--board-card))]"
              aria-label="Zurück zum Board"
            >
              <ArrowLeft className="h-4 w-4" />
              Board
            </button>
            <span className="text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
              {CATEGORY_LABELS[meta.category]}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          <section className="rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-[hsl(var(--board-accent))]/10 p-3">
                <Icon className="h-6 w-6 text-[hsl(var(--board-accent))]" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-semibold">{meta.title}</h1>
                {info?.description && (
                  <p className="mt-1 text-sm text-[hsl(var(--board-muted))]">{info.description}</p>
                )}
              </div>
            </div>
            <div className="mt-6">
              <div className="text-5xl font-semibold tracking-tight tabular-nums">
                {resolved?.value ?? "—"}
              </div>
              {resolved?.hint && (
                <div className="mt-2 text-sm text-[hsl(var(--board-muted))]">{resolved.hint}</div>
              )}
            </div>
          </section>

          {info && (
            <section className="rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
                <Calculator className="h-3.5 w-3.5" />
                So wird gerechnet
              </div>
              <p className="mt-2 text-sm">{info.methodology}</p>
            </section>
          )}

          {info && info.insights.length > 0 && (
            <section className="rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
                <Lightbulb className="h-3.5 w-3.5" />
                Was Sie daraus ableiten können
              </div>
              <ul className="mt-3 space-y-2">
                {info.insights.map((tip, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-[hsl(var(--board-accent))]">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {context.length > 0 && (
            <section className="rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--board-muted))] mb-3">
                <Info className="h-3.5 w-3.5" />
                Im Zusammenhang
              </div>
              <ul className="divide-y divide-[hsl(var(--board-border))] rounded-xl border border-[hsl(var(--board-border))] overflow-hidden">
                {context.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between px-4 py-3 bg-[hsl(var(--board-background))]/40"
                  >
                    <span className="text-sm">{b.label}</span>
                    <span className="text-sm font-medium tabular-nums">{b.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>
    </BoardThemeScope>
  );
}
