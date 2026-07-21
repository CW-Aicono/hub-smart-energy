## Befund

Die Reporting-Zahlen weichen ab, weil mehrere Effekte zusammenkommen:

1. **1:1-Annahme statt N:M-Verknüpfung.** Der Code mappt `session → invoice` als 1:1, obwohl Rechnungen über `charging_invoice_sessions` mehrere Sessions umfassen können und mehrere Rechnungen dieselbe Session referenzieren.
2. **Duplikate.** In der DB gibt es Sessions mit 2–3 Rechnungszeilen. Der aktuelle Map-Aufbau überschreibt zufällig — das Ergebnis ist reihenfolgenabhängig.
3. **Umsatz vs. Nenner passen nicht zusammen.** KPI-Umsatz summiert alle Rechnungen, Ø €/kWh teilt aber nur durch die gemappte Session-Energie → Artefakte wie „0,751 €/kWh".
4. **Fix von letzter Runde überkorrigiert.** `invoice.total_energy_kwh` wird 1:1 einer Session zugerechnet — bei Sammelrechnungen falsch.
5. **Kein Fallback ohne Rechnung.** Tenants ohne Rechnungsstellung sehen aktuell 0 € Umsatz.
6. **Geplanter E-Mail-Report** nutzt ähnliche Logik → gleiche Probleme.

## Zielbild

Eine zentrale, saubere Berechnungsbasis für UI, CSV, XLSX, PDF und geplante Reports. **Hybrider Umsatz**: echte Rechnung wenn vorhanden, sonst kalkulatorisch aus Tarif × Session-kWh. **Transparente Ausweisung**: Zusatz-KPI/-Spalte „davon kalkulatorisch".

## Umsetzung

### 1. Zentrales Reporting-Datenmodell

Neuer Hook / Utility, der einmalig aufbereitet:

- `charging_sessions` im Zeitraum,
- `charging_invoices` + `charging_invoice_sessions` (N:M),
- Legacy `charging_invoices.session_id` nur als Fallback,
- `charging_tariffs` + Zuordnung Nutzer/Gruppe/Ladepunkt inkl. Gültigkeitsdatum,
- Ergebnis pro Session:
  - `energy_kwh` (aus Session),
  - `duration_h`,
  - `revenue_source: "invoice" | "calculated"`,
  - `revenue_gross`, `revenue_net`, `idle_fee`,
  - `billed_energy_kwh` (nur bei `invoice`),
  - `applied_tariff_id` (nur bei `calculated`).

Sammelrechnungen werden proportional nach `session.energy_kwh` auf ihre verknüpften Sessions verteilt (Fallback gleichmäßig, wenn alle 0 kWh).

### 2. Hybride Kostenberechnung

Reihenfolge pro Session:

1. Gibt es eine über `charging_invoice_sessions` verknüpfte Rechnung → Anteil dieser Rechnung nehmen (`revenue_source = "invoice"`).
2. Sonst: Legacy `invoices.session_id` (dedupliziert, jüngste gewinnt).
3. Sonst: **kalkulatorisch** = gültiger Tarif × `session.energy_kwh` + Leerlaufgebühr nach Tarifregel (`revenue_source = "calculated"`).
4. Kein Tarif ermittelbar → Session zählt bei Energie/Anzahl, aber €-Wert bleibt 0 und wird als „ohne Tarif" markiert.

### 3. KPI-Kacheln neu

- **Sessions**: Anzahl eindeutiger Sessions.
- **Energie**: Summe `session.energy_kwh`.
- **Umsatz brutto (gesamt)**: Summe aus Schritt 2.
- **davon kalkulatorisch**: separate KPI, Summe der `calculated`-Anteile.
- **davon abgerechnet**: Summe der `invoice`-Anteile.
- **Ø €/kWh**: Umsatz gesamt / Summe der zugeordneten kWh (konsistenter Zähler & Nenner).
- **Ø Ladedauer**, **Ø kWh/Session**: aus Sessions.
- **Idle-Gebühr**: separat.

### 4. Detailtabelle / Gruppierungen

Für alle Gruppierungen (Ladepunkt, Nutzer, Nutzergruppe, Rechnungsgruppe, Tag/Woche/Monat):

- Session-Werte aus eindeutigen Sessions.
- Umsatz aus Schritt 2.
- Neue Spalte **„davon kalkulatorisch"** (€) bzw. Badge „kalkulatorisch" pro Zeile bei rein kalkulatorischen Gruppen.
- Sammelrechnungen werden nicht mehr komplett dem ersten Ladepunkt zugeschlagen.

### 5. Statusfilter präzisieren

Filter „Alle / bezahlt / offen / kalkulatorisch":

- „bezahlt/offen" filtert nur die Rechnungs-Anteile.
- „kalkulatorisch" zeigt nur unabgerechnete Sessions.
- „Alle" zeigt beides.
- UI-Beschriftung entsprechend anpassen.

### 6. Charts, Heatmap, Vergleichszeitraum

Nutzen dieselbe zentrale Basis inkl. Δ%-Berechnung. Kalkulatorische Anteile werden in Charts optisch getrennt (z. B. gestapelter Balken „Abgerechnet / Kalkulatorisch").

### 7. Exporte & geplanter Versand

CSV, XLSX (Multi-Sheet), PDF und `charging-report-scheduler` verwenden dieselbe Berechnungsbasis. XLSX und PDF bekommen die Spalte „davon kalkulatorisch". Kein zweiter Berechnungspfad mehr.

### 8. Datenqualitäts-Hinweise im UI

Diskreter Info-Block, wenn erkannt:

- mehrere Rechnungen auf derselben Session,
- Rechnung ohne N:M-Verknüpfung,
- Session ohne Tarifzuordnung,
- Rechnungs-kWh weicht > 5 % von Summe der Session-kWh ab.

Ein-Klick-Link zur betroffenen Rechnung/Session zur schnellen Prüfung.

### 9. Keine automatische Datenbereinigung

Doppelte Rechnungen werden nicht automatisch gelöscht. Ich schlage nach dem Fix separat einen Bereinigungs-Plan vor mit klaren Regeln (welche Rechnung bleibt, was mit bezahlten Duplikaten passiert etc.).

## Validierung

- Tabellen-Summen entsprechen den KPI-Werten.
- Umsatz und Ø €/kWh nutzen konsistenten Zähler/Nenner.
- „davon kalkulatorisch" + „davon abgerechnet" = Umsatz gesamt.
- Statusfilter wirkt konsistent auf Umsatz & Ø €/kWh.
- Sammelrechnung: Umsatz verteilt sich korrekt auf beteiligte Ladepunkte.
- Tenant ohne Rechnungen: Reporting zeigt kalkulatorische Kosten korrekt.
- CSV, XLSX, PDF und geplanter E-Mail-Report liefern dieselben Zahlen wie die UI.
- Die konkreten Screenshot-Differenzen (34,4 kWh / 4,145 €/kWh, 80,4 kWh / 0,751 €/kWh, 383,077 €/kWh) sind rechnerisch nachvollziehbar behoben.