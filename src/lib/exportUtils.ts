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
