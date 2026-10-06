# Modulpreise vereinfachen und Rechnungen bereinigen

## Ziel
- Ein Preis pro Modul für alle Kunden. Es gibt keinen „AICONO e. V.“-Preis und keine Trennung mehr zwischen Kommunen und Industrie.
- Jeder Kunde zahlt grundsätzlich den Modulpreis. Nachlässe laufen nur noch über die vorhandenen Rabatte und Promotionen, auch bis 100 %.
- Rechnungen über 0 € gibt es nicht mehr. Stattdessen entsteht ein **Abo-Beleg** als Hinweis.

## 1. Preismaske (Super-Admin → Modulpreise)
- Der Umschalter „Kommunen / Industrie“ entfällt.
- Die Spalte „AICONO e. V.“ entfällt.
- Es bleiben zwei Spalten: **Partner-Einkauf** und **Standardpreis**, der Preis für den Kunden. Beim Ladepunktpreis unter Ladeinfrastruktur ist es genauso.
- Die neuen Preise trägst du selbst ein. Die Preise auf Live und Staging bleiben zunächst stehen, bis du sie überschreibst.
- In den Kundeneinstellungen fallen die Schalter „AICONO-Mitglied“ und „Kommune/Industrie“ weg, soweit sie nur für den Preis da waren.

## 2. Monatsrechnung
- Berechnet wird immer der Standardpreis, oder ein kundenspezifischer Sonderpreis, wo einer hinterlegt ist. Danach werden die Rabatte abgezogen, wie bisher.
- Module ohne Preis erscheinen nicht mehr als 0-€-Zeile.
- **Endbetrag größer als 0 €:** Es entsteht ein normaler Rechnungsentwurf, der an die Buchhaltung (Lexware) übergeben werden kann.
- **Endbetrag 0 €**, zum Beispiel bei 100 % Rabatt oder bei Abdeckung durch eine Vorkasse:
  - Es entsteht **keine Rechnung**, sondern ein **Abo-Beleg**.
  - Er zeigt das Abo, den regulären Betrag, den Rabatt und den Hinweis „Kein Zahlbetrag – keine Rechnung“.
  - Abo-Belege bekommen keine Rechnungsnummer und werden nie an die Buchhaltung übertragen. Sie lassen sich als PDF anzeigen und an den Kunden senden.
- Hat ein Kunde weder Module mit Preis noch Support-Einsätze, entsteht gar nichts.

## 3. Bereinigung bestehender Daten
- Vorhandene Rechnungsentwürfe über 0 € werden zu Abo-Belegen umgewandelt, auf Staging und mit dem nächsten Deploy auch auf Live.
- Bereits an die Buchhaltung übertragene Rechnungen bleiben unangetastet.
- In der Rechnungsliste gibt es einen Filter „Rechnungen / Abo-Belege“ und eine eigene Kennzeichnung.

## 4. AICONO Portal (Umbau Super-Admin)
Das ist nicht Teil dieses Plans. Ich lege dir danach einen eigenen Plan zur neuen Struktur vor, aufgeteilt in kaufmännisch und technisch, mit eigenen Admins und Benutzern.

## Auswirkungsprüfung
- Laut deiner Aussage gibt es auf Live noch keine zahlenden Kunden. Bestehende Rechnungen mit Betrag bleiben trotzdem unverändert.
- Die alten Preisfelder bleiben in der Datenbank erhalten, werden aber nicht mehr verwendet. Nichts wird gelöscht, ein Zurück ist also möglich.
- Partner-Kundenansicht, Kostenvorschau und Rabattvorschau rechnen danach nur noch mit dem Einheitspreis.
- Danach prüfe ich die Typen und starte einen Testlauf der Monatsrechnung auf Staging. Dabei kontrolliere ich drei Fälle: Kunde mit Betrag (Rechnung), Kunde mit 100 % Rabatt (Abo-Beleg) und Kunde ohne Kosten (nichts).

## Dokumentation
Version **1.5.0**, weil sich die Abrechnung sichtbar ändert. Dazu Versionsverlauf, Änderungsprotokoll, Versionshinweise und Handbuch (4 Sprachen) zu Preisen, Rabatten und Abo-Belegen.

## Technische Details
- Migration (idempotent): `tenant_invoices.document_type text not null default 'invoice'` mit den Werten `invoice` und `subscription_notice`. Backfill: Entwürfe mit `amount = 0` und ohne `lexware_invoice_id` werden zu `subscription_notice`. Zusätzlich `COMMENT ... DEPRECATED` auf `price_monthly`, `industry_*` und `partner_industry_*` sowie auf `tenants.is_aicono_member` und `is_kommune`, soweit nur für die Preisberechnung genutzt.
- `generate-monthly-invoices`: Die Kommune-/Mitglied-Verzweigung entfällt, es gelten `standard_price` und `standard_charge_point_price_monthly`. 0-€-Modulzeilen entfallen (Vorkasse-Hinweiszeile bleibt). Bei `amount <= 0` und vorhandenen Abo-Zeilen wird `document_type = 'subscription_notice'` gesetzt, ohne Rechnungsnummer.
- `lexware-api` und Versand: `subscription_notice` wird abgewiesen bzw. übersprungen.
- UI: `SuperAdminModulePricing.tsx` (2 Spalten, ohne Umschalter), `useModulePrices.tsx`, Kostenvorschau (Tenant-Detail, Partner-Kunde, `TenantBillingExtras`), Rechnungsliste und PDF mit Kennzeichnung „Abo-Beleg“.
