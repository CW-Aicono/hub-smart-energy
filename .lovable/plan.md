

# Plan: Ladeabrechnung nach deutschem Recht korrekt umsetzen

## Ist-Zustand (Probleme)

1. **Keine Tarif-Zuordnung zu Nutzern/Gruppen**: Es gibt nur einen globalen "aktiven Tarif" pro Mandant. Unterschiedliche Preise pro Nutzergruppe (z. B. Mitarbeiter, Gäste, Mieter) sind nicht möglich.
2. **Keine Rechnungserstellung im UI**: Kein Button zum manuellen oder automatischen Erzeugen von Rechnungen für einen Zeitraum.
3. **Rechnungsnummern nicht aufsteigend**: Die bestehenden Daten zeigen EV-2026-0001 (14.02.) vor EV-2026-0004 (15.01.) — Rechnungsnummern werden nicht chronologisch vergeben, sondern pro Edge-Function-Aufruf neu gezählt.
4. **1:1-Verknüpfung Invoice→Session**: `charging_invoices.session_id` verknüpft eine Rechnung mit nur einer Session, obwohl eine Monatsrechnung mehrere Sessions umfasst.
5. **Fehlende Pflichtangaben nach deutschem Recht** (§14 UStG): Kein Rechnungsdatum, keine Steuernummer/USt-IdNr, kein Netto/Brutto/MwSt-Ausweis, keine Adresse des Leistungsempfängers.

## Geplante Umsetzung

### Schritt 1: DB-Schema erweitern

**Tabelle `charging_tariffs`** — neue Spalte:
- `tax_rate_percent` (numeric, default 19) — MwSt-Satz

**Tabelle `charging_user_groups`** — neue Spalte:
- `tariff_id` (uuid, FK → charging_tariffs, nullable) — Tarif-Zuordnung pro Gruppe

**Tabelle `charging_users`** — neue Spalte:
- `tariff_id` (uuid, FK → charging_tariffs, nullable) — individueller Tarif-Override (Priorität: User > Gruppe > aktiver Standard-Tarif)

**Tabelle `charging_invoices`** — Umbau:
- `session_id` → nullable machen (nicht mehr Pflicht, da Sammelrechnungen)
- Neue Spalten: `user_id` (uuid, FK → charging_users), `period_start` (date), `period_end` (date), `net_amount` (numeric), `tax_amount` (numeric), `tax_rate_percent` (numeric), `invoice_date` (date)
- Neue Verknüpfungstabelle `charging_invoice_sessions` (invoice_id, session_id) für n:m

**Tabelle `charging_invoice_counter`** — neue Tabelle:
- `tenant_id` (uuid, PK), `year` (int), `last_number` (int)
- Garantiert lückenlose, aufsteigende Nummern pro Mandant und Jahr via DB-Funktion

**DB-Funktion `next_charging_invoice_number(p_tenant_id, p_year)`**:
- Atomares INCREMENT + INSERT/UPDATE auf `charging_invoice_counter`
- Gibt formatierte Nummer zurück: `EV-{YYYY}-{NNNN}`

### Schritt 2: Tarif-Zuordnung im UI

**Tariffs-Tab erweitern:**
- In der Tarif-Tabelle anzeigen: MwSt-Satz (editierbar)
- Im Tarif-Formular: MwSt-Satz-Feld hinzufügen

**Users-Tab erweitern:**
- Dropdown "Tarif" bei Nutzergruppe (Gruppen-Bearbeitung)
- Dropdown "Individueller Tarif" bei Nutzer-Bearbeitung
- Anzeige des effektiven Tarifs in der Nutzerliste

### Schritt 3: Rechnungserstellung im UI

**Invoices-Tab erweitern:**
- Button "Rechnungen erstellen" → Dialog:
  - Zeitraum wählen (Monat/Quartal, Standard: letzter Monat)
  - Vorschau: Liste der Nutzer mit Sessions, zugeordnetem Tarif, berechnetem Betrag (Netto + MwSt)
  - "Erstellen"-Button → ruft Edge Function auf
- Button "Alle Rechnungen per E-Mail senden" für erstellte Rechnungen

### Schritt 4: Edge Function `send-charging-invoices` überarbeiten

- Tarif-Auflösung: User-Tarif > Gruppen-Tarif > aktiver Standard-Tarif
- Rechnungsnummer via `next_charging_invoice_number()` — garantiert aufsteigend
- Netto/Brutto/MwSt korrekt berechnen und speichern
- Sessions über `charging_invoice_sessions` verknüpfen (n:m)
- HTML-Template erweitern: MwSt-Ausweis, Netto/Brutto-Zeilen, Steuernummer des Mandanten

### Schritt 5: Bestehende Testdaten bereinigen

- Die 5 bestehenden Demo-Rechnungen mit inkonsistenten Nummern werden via INSERT-Tool korrigiert (Nummern chronologisch neu vergeben)

## Technische Details

```text
Tarif-Auflösung (Priorität):
  1. charging_users.tariff_id       (individuell)
  2. charging_user_groups.tariff_id (Gruppe)
  3. charging_tariffs.is_active     (Standard-Tarif)
```

```text
Rechnungsnummer-Vergabe (atomar):
  charging_invoice_counter:
    tenant_id | year | last_number
    ──────────┼──────┼────────────
    abc...    | 2026 |          7

  → next_charging_invoice_number('abc...', 2026)
  → UPDATE ... SET last_number = last_number + 1 RETURNING ...
  → 'EV-2026-0008'
```

Betroffene Dateien:
- 2 Migrationen (Schema + DB-Funktion)
- `src/hooks/useChargingTariffs.tsx` — `tax_rate_percent`
- `src/hooks/useChargingUsers.tsx` — `tariff_id`
- `src/hooks/useChargingInvoices.tsx` — neue Felder, Batch-Erstellung
- `src/pages/ChargingBilling.tsx` — Tarif-Zuordnung, Rechnungs-Button, MwSt-Anzeige
- `supabase/functions/send-charging-invoices/index.ts` — kompletter Umbau

