/**
 * ROI-Berechnung für einen Ladepunkt.
 * Inputs: Sessions, Wirtschaftlichkeitsdaten, Verkaufspreis €/kWh.
 */
export interface RoiSessionInput {
  start_time: string;
  energy_kwh: number | null;
}

export interface RoiInput {
  capex_cents: number;
  opex_monthly_cents: number;
  commissioned_on: string | null; // ISO Datum
  electricity_cost_eur_per_kwh: number; // Einkauf
  sale_price_eur_per_kwh: number; // Verkauf (aus default tariff)
  sessions: RoiSessionInput[];
  /** Bezugszeitpunkt für Payback-Hochrechnung (Default: jetzt). */
  now?: Date;
}

export interface RoiKpis {
  totalKwh: number;
  totalRevenueCents: number;
  totalElectricityCostCents: number;
  totalOpexCents: number;
  cumulativeCashflowCents: number; // Erlös - Stromkosten - OPEX - CAPEX
  avgMonthlyNetCents: number; // letzte 6 Monate
  paybackDate: Date | null; // null wenn nicht erreichbar
  monthlySeries: { month: string; netCents: number; cumulativeCents: number }[];
}

const ymKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function calcRoi(input: RoiInput): RoiKpis {
  const now = input.now ?? new Date();
  const commissioned = input.commissioned_on
    ? new Date(input.commissioned_on)
    : null;

  // Monats-Buckets vom Inbetriebnahmedatum bis heute
  const months: string[] = [];
  if (commissioned) {
    const cur = new Date(commissioned.getFullYear(), commissioned.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cur <= last) {
      months.push(ymKey(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  const kwhPerMonth = new Map<string, number>();
  let totalKwh = 0;
  for (const s of input.sessions) {
    const kwh = Number(s.energy_kwh ?? 0);
    if (!kwh) continue;
    const d = new Date(s.start_time);
    const key = ymKey(d);
    kwhPerMonth.set(key, (kwhPerMonth.get(key) ?? 0) + kwh);
    totalKwh += kwh;
  }

  const totalRevenueCents = Math.round(
    totalKwh * input.sale_price_eur_per_kwh * 100,
  );
  const totalElectricityCostCents = Math.round(
    totalKwh * input.electricity_cost_eur_per_kwh * 100,
  );
  const totalOpexCents = months.length * input.opex_monthly_cents;
  const cumulativeCashflowCents =
    totalRevenueCents -
    totalElectricityCostCents -
    totalOpexCents -
    input.capex_cents;

  const monthlySeries: RoiKpis["monthlySeries"] = [];
  let cum = -input.capex_cents;
  const marginPerKwhCents =
    (input.sale_price_eur_per_kwh - input.electricity_cost_eur_per_kwh) * 100;

  for (const m of months) {
    const kwh = kwhPerMonth.get(m) ?? 0;
    const net = Math.round(kwh * marginPerKwhCents) - input.opex_monthly_cents;
    cum += net;
    monthlySeries.push({ month: m, netCents: net, cumulativeCents: cum });
  }

  // Avg netto letzte 6 Monate (vollständige)
  const last6 = monthlySeries.slice(-6);
  const avgMonthlyNetCents = last6.length
    ? Math.round(last6.reduce((s, x) => s + x.netCents, 0) / last6.length)
    : 0;

  // Payback: linear hochrechnen ab heute mit avgMonthlyNetCents
  let paybackDate: Date | null = null;
  if (cumulativeCashflowCents >= 0) {
    // Bereits amortisiert: Datum aus monthlySeries finden
    const idx = monthlySeries.findIndex((x) => x.cumulativeCents >= 0);
    if (idx >= 0) {
      const [y, mo] = monthlySeries[idx].month.split("-").map(Number);
      paybackDate = new Date(y, mo - 1, 1);
    }
  } else if (avgMonthlyNetCents > 0) {
    const monthsToBreakeven = Math.ceil(
      -cumulativeCashflowCents / avgMonthlyNetCents,
    );
    paybackDate = new Date(
      now.getFullYear(),
      now.getMonth() + monthsToBreakeven,
      1,
    );
  }

  return {
    totalKwh,
    totalRevenueCents,
    totalElectricityCostCents,
    totalOpexCents,
    cumulativeCashflowCents,
    avgMonthlyNetCents,
    paybackDate,
    monthlySeries,
  };
}
