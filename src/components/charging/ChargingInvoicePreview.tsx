interface Props {
  form: {
    company_name: string;
    company_address: string;
    company_email: string;
    company_phone: string;
    tax_id: string;
    iban: string;
    bic: string;
    bank_name: string;
    footer_text: string;
    logo_url: string;
  };
}

const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmtKwh = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kWh";

export default function ChargingInvoicePreview({ form }: Props) {
  // Demo invoice data
  const lines = [
    { date: "05.06.2026", point: "Wallbox 1 · AC", kwh: 24.53, price: 0.45 },
    { date: "12.06.2026", point: "Wallbox 1 · AC", kwh: 31.20, price: 0.45 },
    { date: "21.06.2026", point: "DC-Schnelllader", kwh: 42.80, price: 0.59 },
  ];
  const subtotal = lines.reduce((s, l) => s + l.kwh * l.price, 0);
  const tax = subtotal * 0.19;
  const total = subtotal + tax;

  return (
    <div className="bg-white text-black rounded-lg border shadow-sm overflow-hidden">
      <div className="bg-muted/40 px-3 py-1.5 border-b text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        Vorschau
      </div>
      <div
        className="p-5 text-[10px] leading-snug font-sans"
        style={{ aspectRatio: "210/297", overflow: "hidden" }}
      >
        {/* Logo */}
        {form.logo_url ? (
          <img
            src={form.logo_url}
            alt="Logo"
            className="h-10 max-w-[120px] object-contain mb-1"
          />
        ) : (
          <div className="h-10 w-24 border border-dashed rounded mb-1 flex items-center justify-center text-[8px] text-gray-400">
            Logo
          </div>
        )}

        {/* Sender line */}
        <div className="text-[7px] text-gray-500 border-b border-gray-200 pb-1 mb-3">
          {[form.company_name, form.company_address?.replace(/\n/g, ", ")]
            .filter(Boolean)
            .join(" · ") || "Ihre Firma · Musterstr. 1, 12345 Musterstadt"}
        </div>

        {/* Recipient + Meta */}
        <div className="flex justify-between mb-4">
          <div>
            <div className="text-[9px] font-medium">Max Mustermann</div>
            <div className="text-[8px] text-gray-500">max@example.com</div>
          </div>
          <div className="text-[8px] text-right space-y-0.5">
            <div className="flex gap-2 justify-end">
              <span className="text-gray-500">Rechnungs-Nr.:</span>
              <span className="font-medium">2026-0042</span>
            </div>
            <div className="flex gap-2 justify-end">
              <span className="text-gray-500">Datum:</span>
              <span className="font-medium">30.06.2026</span>
            </div>
            <div className="flex gap-2 justify-end">
              <span className="text-gray-500">Zeitraum:</span>
              <span className="font-medium">01.–30.06.2026</span>
            </div>
            {form.tax_id && (
              <div className="flex gap-2 justify-end">
                <span className="text-gray-500">USt-IdNr.:</span>
                <span className="font-medium">{form.tax_id}</span>
              </div>
            )}
          </div>
        </div>

        <div className="text-sm font-bold mb-2">Rechnung – Ladevorgänge</div>

        {/* Table */}
        <table className="w-full text-[8px] border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-1 font-medium">Datum</th>
              <th className="p-1 font-medium">Ladepunkt</th>
              <th className="p-1 font-medium text-right">Energie</th>
              <th className="p-1 font-medium text-right">Preis</th>
              <th className="p-1 font-medium text-right">Summe</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="p-1">{l.date}</td>
                <td className="p-1">{l.point}</td>
                <td className="p-1 text-right">{fmtKwh(l.kwh)}</td>
                <td className="p-1 text-right">{fmtEur(l.price)}/kWh</td>
                <td className="p-1 text-right">{fmtEur(l.kwh * l.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-4">
          <div className="w-2/3 text-[8px] space-y-0.5">
            <div className="flex justify-between"><span>Zwischensumme</span><span>{fmtEur(subtotal)}</span></div>
            <div className="flex justify-between"><span>USt. 19 %</span><span>{fmtEur(tax)}</span></div>
            <div className="flex justify-between font-bold border-t pt-0.5 mt-0.5 text-[9px]">
              <span>Gesamtbetrag</span><span>{fmtEur(total)}</span>
            </div>
          </div>
        </div>

        {/* Bank */}
        <div className="text-[7px] text-gray-600 border-t pt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="font-medium text-gray-700 mb-0.5">Kontakt</div>
            <div>{form.company_email || "info@beispiel.de"}</div>
            <div>{form.company_phone || "+49 000 0000000"}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700 mb-0.5">Bankverbindung</div>
            <div>{form.bank_name || "Musterbank"}</div>
            <div>IBAN: {form.iban || "DE00 0000 0000 0000 0000 00"}</div>
            <div>BIC: {form.bic || "MUSTDEXXX"}</div>
          </div>
        </div>

        {/* Footer */}
        {form.footer_text && (
          <div className="text-[7px] text-gray-500 text-center mt-3 border-t pt-2 whitespace-pre-wrap">
            {form.footer_text}
          </div>
        )}
      </div>
    </div>
  );
}
