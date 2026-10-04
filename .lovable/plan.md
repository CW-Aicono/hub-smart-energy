# Ladepunkt-Gebühr als Unterpunkt von „Ladeinfrastruktur“ und sichtbare Rabatte

## 1. Modulpreise (Super-Admin → Modulpreise)
- Die Spalte „je aktivem Ladepunkt“ wird bei allen Modulen entfernt.
- Direkt unter „Ladeinfrastruktur“ kommt eine eingerückte Unterzeile **„└ je aktivem Ladepunkt / Monat“**, mit denselben drei Preisspalten wie jedes andere Modul: Partner-Einkauf, AICONO e. V. und Standardpreis, jeweils für Kommunen und Industrie.
- Abgerechnet werden dann die Pauschale für „Ladeinfrastruktur“ und zusätzlich die Ladepunkte × Preis je Ladepunkt. Steht ein Wert auf 0 €, wird dieser Teil nicht berechnet.
- Unter der Unterzeile steht die Vorschau: „aktuell X aktive Ladepunkte → Y €/Monat“.
- Unter der Tabelle steht ein Hinweis: „Rabatte stellen Sie pro Kunde ein: Mandanten → Kunde → Module“, mit Link dorthin.

## 2. Kundenseite (Super-Admin und Partner)
- In der Modultabelle bekommt „Ladeinfrastruktur“ ebenfalls eine eingerückte Unterzeile „je aktivem Ladepunkt“. Sie zeigt die aktuelle Anzahl, den Preis (Sonderpreis möglich) und die Summe. Die eigene Karte „Ladepunkt-Abrechnung“ fällt dafür weg.
- **Rabatte sichtbar machen:** Neue Spalte „Rabatt“ in der Modultabelle mit einem Knopf „+ Rabatt“ je Modul. Ist ein Rabatt aktiv, steht dort ein Hinweis wie „−50 % bis 31.12.“. Die Rabattliste zieht direkt unter die Tabelle, oberhalb der Monatssumme, statt ganz unten auf der Seite.
- Die Monatssumme zeigt nachvollziehbar: Pauschalen + Ladepunkte − Rabatt = Summe.

## 3. Rabatte auch für Bundles, mit Laufzeit und Zahlungsart
- Im Rabatt-Dialog können Sie neben Modulen und „alle Module“ auch ein **Bundle** auswählen, das dem Kunden zugeordnet ist.
- Art des Rabatts: Prozent oder Betrag in €, wie bei den Modulen.
- **Laufzeit:** Sie geben eine Anzahl ein und wählen **Monate** oder **Jahre**, z. B. 3 Monate oder 1 Jahr. Ohne Laufzeit gilt der Rabatt dauerhaft. Das Enddatum wird automatisch berechnet und angezeigt.
- **Zahlungsart** je Rabatt:
  - **Monatlich**: Der Rabatt wird jeden Monat verrechnet.
  - **Vorkasse**: Der Kunde zahlt die ganze Laufzeit im Voraus. Es gibt eine Rechnung über Laufzeit × Monatspreis abzüglich Rabatt. Für die bezahlten Monate entstehen danach keine weiteren Rechnungszeilen.
  - **Einmalzahlung**: Ein fester Gesamtbetrag für die Laufzeit, einmalig in Rechnung gestellt; danach ebenfalls keine Monatszeilen.
- Nach Ablauf der Laufzeit gilt automatisch wieder der normale monatliche Preis.
- Partner dürfen Bundle-Rabatte nur für eigene Kunden vergeben und nur, wenn alle Module des Bundles in ihrem Portfolio sind. Das wird auf dem Server geprüft.

## 4. Rechnung
- Die Ladepunkt-Zeile wird nur noch für „Ladeinfrastruktur“ erzeugt. Sie verwendet den Preis, der zum Kunden passt (Partner-Einkauf, Mitglied oder Standard, jeweils Kommune oder Industrie).
- Bundle-Rabatte erscheinen als eigene Zeile. Vorkasse und Einmalzahlung erscheinen als eigene Zeile mit Angabe der Laufzeit; in den abgedeckten Monaten wird das Modul bzw. Bundle nicht nochmal berechnet.

## 4. Dokumentation
- Benutzerhandbuch in allen 4 Sprachen angepasst (Abschnitt Abrechnung).
- Änderungsprotokoll, Versionshinweise und Versionsverlauf ergänzt. Version **v1.2.2**, weil es eine Korrektur der Bedienung ist.

## Technische Details
- Eine Migration (unschädlich bei Mehrfachausführung) legt zusätzliche Spalten in `module_prices` an: `partner_charge_point_price_monthly`, `partner_industry_charge_point_price_monthly`, `standard_charge_point_price_monthly`, `industry_standard_charge_point_price_monthly` (numeric, Standardwert 0). Die vorhandenen `charge_point_price_monthly`/`industry_charge_point_price_monthly` gelten als Mitgliedspreis. Ladepunktpreise anderer Module werden auf 0 gesetzt.
- `SuperAdminModulePricing.tsx`: Spalte entfernen, Unterzeile nach `ev_charging`. `useModulePrices` erhält zusätzliche Felder und Auswahl nach Preisstufe.
- `SuperAdminTenantDetail.tsx` / `PartnerTenantDetail.tsx`: Unterzeile, Rabattspalte, Rabattliste weiter oben; `TenantBillingExtras` wird entsprechend aufgeteilt.
- `generate-monthly-invoices`: Ladepunktpreis nur für `ev_charging`, nach Preisstufe; danach die Funktion neu ausliefern.
- Prüfung: Typprüfung, Klicktest in der Vorschau (Modulpreise, Kundenseite, Rabatt anlegen).
