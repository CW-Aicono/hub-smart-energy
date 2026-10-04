# Abrechnung: Ladepunkt-Gebühr und Modul-Rabatte

## Ziel
1. Ladepunkte können pro **aktivem Ladepunkt und Monat** abgerechnet werden.
2. Für jedes Modul eines Mandanten lassen sich **Rabatte** hinterlegen: **absolut (€)** oder **prozentual (%)**, **dauerhaft** oder **befristet** (z. B. 3 Monate Startpreis).

## 1. Monatliche Gebühr pro aktivem Ladepunkt
- In der Modul-Preisliste (Super-Admin → Modulpreise) erhält jedes Modul zwei unabhängige Preisbestandteile, frei kombinierbar:
  - **Pauschale pro Monat** (heutiges Verhalten, Standard)
  - **Preis pro aktivem Ladepunkt und Monat**
  - Möglich sind: nur Pauschale, nur Ladepunktpreis, oder beides zusammen (z. B. 49 € Grundgebühr + 9 € je Ladepunkt). Ein leeres Feld bzw. 0 € bedeutet „nicht berechnet“.
- Für die Ladeinfrastruktur wird „pro Ladepunkt“ wählbar; der eingetragene Preis gilt dann je Ladepunkt.
- **Aktiv** = Ladepunkt ist angelegt, nicht archiviert/deaktiviert und war im Abrechnungsmonat mindestens einmal verbunden. Neu angelegte, noch nie verbundene Ladepunkte werden nicht berechnet.
- Rechnungsposition zeigt nachvollziehbar: „Ladeinfrastruktur – 12 Ladepunkte × 9,00 € = 108,00 €“.
- Mandantenspezifischer Sonderpreis (bestehend) gilt dann ebenfalls pro Ladepunkt.
- **Kostenvorschau:** Neben dem Ladepunktpreis steht, wie viele Ladepunkte aktuell aktiv sind, und was das monatlich kosten würde (z. B. „12 aktive Ladepunkte → 49 € + 12 × 9 € = 157 €/Monat“, inkl. aktuell gültigem Rabatt).
  - In der Mandanten-Detailseite (Super-Admin) und beim Partner unter „Module & Lizenzen“ je Kunde.
  - In der globalen Modulpreisliste als Summe über alle Mandanten (Anzahl aktiver Ladepunkte gesamt).

## 2. Rabatte für alle Module
- Neuer Bereich in der Mandanten-Detailseite (Super-Admin) und für Partner bei ihren Kunden unter „Module & Lizenzen“:
  - Modul wählen (oder „alle Module“)
  - Art: Prozent oder Betrag in €
  - Wert
  - Gültig ab, optional gültig bis (leer = dauerhaft); Schnellwahl „1 / 3 / 6 / 12 Monate“
  - Notiz (z. B. „Startangebot“)
- Liste mit Status: aktiv / geplant / abgelaufen; beenden und löschen möglich, Änderungen werden protokolliert.
- Bei der Monatsrechnung wird der im Monat gültige Rabatt angewendet und als eigene Zeile ausgewiesen („Startrabatt 50 % bis 31.12.2026: −45,00 €“). Ein Betrag kann nie unter 0 € fallen. Mehrere Rabatte auf dasselbe Modul: es gilt der für den Kunden günstigste (keine Addition).
- Nach Ablauf gilt automatisch wieder der normale Preis – ohne manuelles Zutun.
- Partner dürfen Rabatte nur für eigene Kunden und nur auf Module ihres Portfolios vergeben (serverseitig geprüft).

## Dokumentation
- Benutzerhandbuch (4 Sprachen): neuer Abschnitt „Abrechnung, Ladepunkt-Gebühr und Rabatte“.
- CHANGELOG, Release Notes, Version auf **v1.2.0** (neue Funktionen = Minor).

## Technische Details
- Migration (idempotent, via Migrationstool, läuft auch auf Hetzner):
  - `module_prices.billing_unit text default 'flat'` mit Check `('flat','per_charge_point')`.
  - Neue Tabelle `tenant_module_discounts` (tenant_id, module_code nullable = alle, discount_type `percent|absolute`, value numeric > 0, percent ≤ 100, valid_from date, valid_until date null, note, created_by, timestamps). GRANTs, RLS: Super-Admin alles; Partner-Mitglieder mit Abrechnungsrecht für Mandanten ihres Partners (via `get_user_partner_id` + Portfolio-Check in `partner_modules`); Tenant-Admin nur lesen.
- `generate-monthly-invoices`: aktive Ladepunkte pro Mandant zählen (nicht archiviert, `last_heartbeat` im Monat), Menge × Preis bei `per_charge_point`; danach gültigen Rabatt je Modul anwenden (Überlappung mit Abrechnungsmonat), Zeile `type: 'discount'` in `line_items`, `module_total` netto.
- UI: `SuperAdminModulePricing.tsx` (Abrechnungsart), neue Komponente `TenantDiscountsCard` in `SuperAdminTenantDetail.tsx` und im Partner-Kundenbereich; Partner-Schreibzugriff über Edge Function analog `partner-set-tenant-module`.
- Bestehende Rechnungen bleiben unverändert; Standard `flat` hält heutiges Verhalten.
- Prüfung danach: Typcheck, Test-Lauf der Rechnungsfunktion für einen Mandanten mit Ladepunkten und befristetem Rabatt.
