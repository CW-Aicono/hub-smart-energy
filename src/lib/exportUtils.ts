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

/**
 * PDF Export Utility – generates a printable HTML table in a new window
 */
export function downloadPDF(
  data: Record<string, unknown>[],
  filename: string,
  headers?: Record<string, string>,
  title?: string
) {
  if (!data.length) return;

  const keys = Object.keys(headers || data[0]);
  const headerLabels = keys.map((k) => headers?.[k] ?? k);

  const tableRows = data
    .map(
      (row) =>
        "<tr>" +
        keys.map((k) => `<td>${row[k] ?? ""}</td>`).join("") +
        "</tr>"
    )
    .join("");

  const html = `
    <html><head>
    <title>${title || filename}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 30px; font-size: 12px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
      tr:nth-child(even) { background: #fafafa; }
      @media print { button { display: none; } @page { margin: 15mm; } }
    </style></head><body>
    <h1>${title || "Energiedaten Export"}</h1>
    <p class="meta">Erstellt am ${new Date().toLocaleDateString("de-DE")} – ${data.length} Datensätze</p>
    <table>
      <thead><tr>${headerLabels.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <br/><button onclick="window.print()">Als PDF drucken</button>
    </body></html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
