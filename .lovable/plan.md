

# Eingangsrechnungen von Energieversorgern – Umsetzungsplan

## Überblick

User sollen PDF-/Bilddateien von Energierechnungen hochladen können. Eine KI extrahiert automatisch Versorger, Liegenschaft, Zeitraum, Energieart, Verbrauch und Kosten. Der User prüft und korrigiert die Vorschläge in einer Übersichtstabelle und speichert sie. Korrekturrechnungen können nachträglich einer bestehenden Rechnung zugeordnet werden.

---

## Marktrecherche – Wie andere Lösungen das umsetzen

| Lösung | Ansatz |
|---|---|
| **Koncile / Klippa / Mindee** | Spezialisierte OCR-APIs für Energierechnungen. Extrahieren Zählernummer, Verbrauch, Zeitraum, Betrag, Tarif. Confidence-Score pro Feld. |
| **Algodocs** | Template-freie Extraktion, Multi-Page-PDFs, Export als CSV/JSON. Arrears/Credits-Handling für Korrekturen. |
| **EnergyCAP / Urjanet** | Branchenlösung: Rechnungsimport → automatische Zuordnung zu Gebäude/Zähler → Abweichungserkennung gegenüber historischen Werten → Freigabe-Workflow. Korrekturrechnungen als "Adjustment" mit Referenz zur Originalrechnung. |

**Best Practices für Korrekturrechnungen:**
- Korrekturrechnung referenziert die Original-Rechnungsnummer
- Delta-Berechnung (Differenz zur Originalrechnung) wird automatisch ermittelt
- Verbrauchs- und Kostendaten werden bei der Zuordnung netto angepasst

---

## Datenbankdesign

### Neue Tabelle: `energy_supplier_invoices`

```text
┌──────────────────────────────────────────┐
│ energy_supplier_invoices                 │
├──────────────────────────────────────────┤
│ id               UUID PK                │
│ tenant_id        UUID FK → tenants       │
│ location_id      UUID FK → locations     │
│ invoice_number   TEXT                    │
│ supplier_name    TEXT                    │
│ energy_type      TEXT (strom/gas/...)    │
│ period_start     DATE                   │
│ period_end       DATE                   │
│ consumption_kwh  NUMERIC                │
│ consumption_unit TEXT (kWh, m³)         │
│ total_gross      NUMERIC                │
│ total_net        NUMERIC (nullable)     │
│ tax_amount       NUMERIC (nullable)     │
│ currency         TEXT DEFAULT 'EUR'     │
│ status           TEXT (draft/confirmed) │
│ file_path        TEXT (Storage-Pfad)    │
│ ai_confidence    TEXT (high/medium/low) │
│ ai_raw_response  JSONB                  │
│ correction_of_id UUID FK → self (NULL)  │
│ notes            TEXT                   │
│ created_at       TIMESTAMPTZ           │
│ updated_at       TIMESTAMPTZ           │
└──────────────────────────────────────────┘
```

- `correction_of_id` verweist auf die Originalrechnung bei Korrekturrechnungen
- RLS: Zugriff nur für authentifizierte User des gleichen Tenants
- `file_path` speichert die Originaldatei im bestehenden Storage-Bucket

---

## Edge Function: `extract-invoice`

- Empfängt PDF/Bild als Base64 (max 20 MB)
- Nutzt **Lovable AI** (`google/gemini-2.5-pro` – bestes multimodales Modell) via Tool-Calling
- Extrahiert strukturiert: `supplier_name`, `invoice_number`, `energy_type`, `period_start`, `period_end`, `consumption_kwh`, `consumption_unit`, `total_gross`, `total_net`, `tax_amount`
- Liefert `confidence`-Score pro Feld
- Schlägt passende `location_id` vor durch Fuzzy-Matching von Adresse/Zähler gegen bestehende Liegenschaften
- JWT-Authentifizierung + Tenant-Isolation

---

## Frontend-Komponenten

### 1. Neuer Tab "Rechnungen" auf der Energiedaten-Seite

In `EnergyData.tsx` wird ein dritter Tab hinzugefügt:

```text
[Export] [Import] [Rechnungen]  ← NEU
```

### 2. `InvoiceImportDialog` (mehrstufiger Wizard)

```text
Schritt 1: Upload     → Datei hochladen (PDF, JPG, PNG)
Schritt 2: KI-Analyse → Spinner während Extraktion, dann Vorschau
Schritt 3: Prüfung    → Editierbare Felder mit Confidence-Badges
                         ├── Liegenschaft (Dropdown)
                         ├── Energieart (Dropdown)
                         ├── Zeitraum (von/bis Datepicker)
                         ├── Verbrauch + Einheit
                         ├── Brutto/Netto/Steuer
                         ├── Rechnungsnummer
                         ├── Versorger
                         └── Korrektur zu: (Dropdown, optional)
Schritt 4: Ergebnis   → Bestätigung + optional Verbrauch in
                         meter_period_totals übernehmen
```

### 3. `InvoicesList` – Rechnungsübersicht

- Tabelle aller importierten Rechnungen mit Filter (Liegenschaft, Zeitraum, Status)
- Status-Badges: Entwurf / Bestätigt / Korrektur
- Korrekturrechnungen werden visuell mit der Originalrechnung verknüpft (eingerückt oder Badge)
- Aktion: Rechnung anzeigen, bearbeiten, Originaldatei herunterladen

### 4. Hook: `useSupplierInvoices`

- CRUD-Operationen auf `energy_supplier_invoices`
- Berechnung der Netto-Verbrauchswerte (Original + Korrekturen)
- Integration mit `useEnergyPrices` für Plausibilitätsprüfungen

---

## Korrekturrechnungen – Workflow

1. User klickt "Korrekturrechnung erfassen" bei einer bestehenden Rechnung
2. Upload + KI-Extraktion wie bei Neuimport
3. `correction_of_id` wird automatisch auf die Originalrechnung gesetzt
4. In der Listenansicht wird das Delta (Differenz Original ↔ Korrektur) angezeigt
5. Bei Bestätigung werden die `meter_period_totals` angepasst (Delta-Verrechnung)

---

## Integration in bestehende Datenflüsse

- Bei Bestätigung einer Rechnung kann der Verbrauch optional als `meter_period_totals`-Eintrag mit `source: 'invoice'` geschrieben werden
- Der bestehende `useEnergyData`-Hook aggregiert diese Daten automatisch mit
- Energiepreise werden mit den Rechnungsdaten abgeglichen (Plausibilitäts-Badge wenn Rechnungspreis >10% vom hinterlegten Tarif abweicht)

---

## Umsetzungsreihenfolge

| # | Aufgabe | Geschätzt |
|---|---------|-----------|
| 1 | DB-Migration: `energy_supplier_invoices` + RLS | klein |
| 2 | Storage-Bucket `invoice-files` anlegen | klein |
| 3 | Edge Function `extract-invoice` (Lovable AI + Tool-Calling) | mittel |
| 4 | Hook `useSupplierInvoices` (CRUD + Korrektur-Logik) | mittel |
| 5 | `InvoiceImportDialog` (Upload → KI → Prüfung → Speichern) | groß |
| 6 | `InvoicesList` Tabellenansicht + Filter | mittel |
| 7 | Tab "Rechnungen" in `EnergyData.tsx` einbinden | klein |
| 8 | Korrekturrechnung-Workflow (Zuordnung + Delta) | mittel |
| 9 | Optional: Verbrauchsübernahme in `meter_period_totals` | klein |
| 10 | i18n-Schlüssel (DE/EN) | klein |

