/**
 * CSV Export Utility
 */
export function downloadCSV(
  data: Record<string, unknown>[],
  filename: string,
  headers?: Record<string, string>
) {
  if (!data.length) return;

  const keys = Object.keys(headers || data[0]);
  const headerRow = keys.map((k) => headers?.[k] ?? k).join(";");

  const rows = data.map((row) =>
    keys.map((k) => {
      const val = row[k];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(";") || str.includes('"')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(";")
  );

  const csv = "\uFEFF" + [headerRow, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDE(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function formatDateDE(d: string): string {
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}

function buildBarChartSVG(data: { label: string; value: number; color: string }[]): string {
  if (!data.length) return "";
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 60;
  const gap = 20;
  const chartHeight = 160;
  const chartWidth = data.length * (barWidth + gap) + gap;

  const bars = data.map((d, i) => {
    const barH = (d.value / maxVal) * (chartHeight - 30);
    const x = gap + i * (barWidth + gap);
    const y = chartHeight - barH - 25;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="${d.color}" opacity="0.85"/>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#333" font-weight="600">${formatDE(d.value)}</text>
      <text x="${x + barWidth / 2}" y="${chartHeight - 6}" text-anchor="middle" font-size="10" fill="#666">${d.label}</text>
    `;
  }).join("");

  return `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">${bars}</svg>`;
}

function buildDonutSVG(data: { label: string; value: number; color: string }[]): string {
  if (!data.length) return "";
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return "";
  const cx = 80, cy = 80, r = 60, r2 = 35;
  let cumAngle = -90;

  const slices = data.map((d) => {
    const pct = d.value / total;
    const angle = pct * 360;
    const startRad = (cumAngle * Math.PI) / 180;
    const endRad = ((cumAngle + angle) * Math.PI) / 180;
    cumAngle += angle;
    const large = angle > 180 ? 1 : 0;
    const x1o = cx + r * Math.cos(startRad), y1o = cy + r * Math.sin(startRad);
    const x2o = cx + r * Math.cos(endRad), y2o = cy + r * Math.sin(endRad);
    const x1i = cx + r2 * Math.cos(endRad), y1i = cy + r2 * Math.sin(endRad);
    const x2i = cx + r2 * Math.cos(startRad), y2i = cy + r2 * Math.sin(startRad);
    return `<path d="M${x1o},${y1o} A${r},${r} 0 ${large} 1 ${x2o},${y2o} L${x1i},${y1i} A${r2},${r2} 0 ${large} 0 ${x2i},${y2i}Z" fill="${d.color}" opacity="0.85"/>`;
  }).join("");

  const legend = data.map((d, i) => {
    const pct = ((d.value / total) * 100).toFixed(1);
    return `<g transform="translate(175, ${i * 24 + 20})">
      <rect width="14" height="14" rx="3" fill="${d.color}" opacity="0.85"/>
      <text x="20" y="11" font-size="11" fill="#333">${d.label}: ${pct}%</text>
    </g>`;
  }).join("");

  return `<svg width="340" height="${Math.max(160, data.length * 24 + 40)}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
    ${slices}
    <circle cx="${cx}" cy="${cy}" r="${r2 - 5}" fill="white"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" fill="#333" font-weight="700">${formatDE(total)}</text>
    ${legend}
  </svg>`;
}

const ENERGY_COLORS: Record<string, string> = {
  Strom: "#eab308", Gas: "#f97316", "Wärme": "#ef4444", Wasser: "#3b82f6",
};

/**
 * PDF Export Utility – generates a professional printable report in a new window
 */
export function downloadPDF(
  data: Record<string, unknown>[],
  filename: string,
  headers?: Record<string, string>,
  title?: string,
  options?: { logoUrl?: string | null; tenantName?: string }
) {
  if (!data.length) return;

  const keys = Object.keys(headers || data[0]);
  const headerLabels = keys.map((k) => headers?.[k] ?? k);

  // Build energy summary for charts
  const energyCol = keys.find((k) => (headers?.[k] ?? k) === "Energieart");
  const valueCol = keys.find((k) => (headers?.[k] ?? k) === "Wert");
  const locCol = keys.find((k) => (headers?.[k] ?? k) === "Standort");

  const energyTotals = new Map<string, number>();
  if (energyCol && valueCol) {
    data.forEach((r) => {
      const type = String(r[energyCol] ?? "");
      if (type) energyTotals.set(type, (energyTotals.get(type) || 0) + (Number(r[valueCol]) || 0));
    });
  }
  const chartData = Array.from(energyTotals.entries()).map(([label, value]) => ({
    label, value, color: ENERGY_COLORS[label] || "#94a3b8",
  }));

  // Location breakdown
  const locCounts = new Map<string, number>();
  if (locCol) {
    data.forEach((r) => {
      const loc = String(r[locCol] ?? "");
      if (loc) locCounts.set(loc, (locCounts.get(loc) || 0) + 1);
    });
  }
  const locationSummary = Array.from(locCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const maxLocCount = Math.max(...locationSummary.map((l) => l.count), 1);

  // KPI values
  const totalRows = data.length;
  const uniqueLocations = new Set(locCol ? data.map((r) => r[locCol]) : []).size;
  const meterCol = keys.find((k) => (headers?.[k] ?? k) === "Zähler");
  const uniqueMeters = new Set(meterCol ? data.map((r) => r[meterCol]) : []).size;

  // Table rows
  const tableRows = data.map((row, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    return "<tr>" + keys.map((k) => {
      let val = row[k] ?? "";
      const label = headers?.[k] ?? k;
      if (label === "Datum" && typeof val === "string" && val.includes("-")) val = formatDateDE(val as string);
      if (label === "Wert" && typeof val === "number") val = formatDE(val as number);
      return `<td style="padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg}">${val}</td>`;
    }).join("") + "</tr>";
  }).join("");

  const barChart = chartData.length > 1 ? buildBarChartSVG(chartData) : "";
  const donutChart = chartData.length > 1 ? buildDonutSVG(chartData) : "";

  const locationBars = locationSummary.map((l) => {
    const pct = Math.round((l.count / maxLocCount) * 100);
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="color:#334155;font-weight:500">${l.name}</span>
        <span style="color:#64748b">${l.count} Einträge</span>
      </div>
      <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#3b82f6,#06b6d4);width:${pct}%;height:100%;border-radius:4px"></div>
      </div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8"/>
<title>${title || filename}</title>
<style>
  @media print {
    body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    @page { margin: 12mm 15mm; size: A4; }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #fff; }
  .container { max-width: 800px; margin: 0 auto; padding: 32px; }
</style></head><body>
<div class="container">

  <!-- Title bar -->
  <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:24px 28px;margin-bottom:24px;color:white;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:22px;font-weight:700;margin-bottom:4px">${title || "Energiedaten Export"}</div>
      <div style="font-size:13px;opacity:0.8">Erstellt am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}${options?.tenantName ? ` · ${options.tenantName}` : ""}</div>
    </div>
    ${options?.logoUrl ? `<img src="${options.logoUrl}" alt="Logo" style="max-height:52px;max-width:160px;object-fit:contain;border-radius:6px" />` : ""}
  </div>

  <!-- KPI Cards -->
  <table style="width:100%;margin-bottom:24px;border-spacing:8px;border-collapse:separate">
    <tr>
      <td style="padding:8px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;text-align:center">
        <div style="font-size:22px;margin-bottom:4px">📊</div>
        <div style="font-size:24px;font-weight:700;color:#1e293b">${formatDE(totalRows)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Datensätze</div>
      </div></td>
      <td style="padding:8px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;text-align:center">
        <div style="font-size:22px;margin-bottom:4px">🏢</div>
        <div style="font-size:24px;font-weight:700;color:#1e293b">${formatDE(uniqueLocations)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Standorte</div>
      </div></td>
      <td style="padding:8px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;text-align:center">
        <div style="font-size:22px;margin-bottom:4px">⚙️</div>
        <div style="font-size:24px;font-weight:700;color:#1e293b">${formatDE(uniqueMeters)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Zähler</div>
      </div></td>
    </tr>
  </table>

  ${chartData.length > 1 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Verbrauch nach Energieart</div>
    <table style="width:100%"><tr>
      <td style="width:55%;vertical-align:top;padding-right:16px">${barChart}</td>
      <td style="width:45%;vertical-align:top">${donutChart}</td>
    </tr></table>
  </div>` : ""}

  ${locationBars ? `
  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Verteilung nach Standort</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px">${locationBars}</div>
  </div>` : ""}

  <div style="margin-bottom:24px">
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Detaildaten</div>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <thead><tr>${headerLabels.map((h) => `<th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc">${h}</th>`).join("")}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;text-align:center">
    <div style="font-size:11px;color:#94a3b8">Energiebericht · Erstellt am ${new Date().toLocaleDateString("de-DE")} · ${totalRows} Datensätze</div>
  </div>

  <div class="no-print" style="text-align:center;margin-top:20px">
    <button onclick="window.print()" style="background:#1e293b;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">Als PDF drucken</button>
  </div>

</div></body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
