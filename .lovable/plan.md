## Ziel

Währung soll **einmal am Ladetarif** festgelegt werden und automatisch für alle daraus abgeleiteten Ad-hoc-Zahlungsregeln, Beträge und Anzeigen gelten. Doppelte/inkonsistente Währungswahl an mehreren Stellen entfällt. Standard bleibt **EUR (€)**.

## Warum diese Lösung

- `charging_tariffs.currency` existiert bereits in der DB und wird beim Anlegen mit `EUR` befüllt.
- Im Tarif-Dialog (`ChargingBilling.tsx`) fehlt aktuell nur das UI-Feld — der Wert wird nie sichtbar/änderbar.
- Im Ad-hoc-Regel-Dialog wird die Währung dagegen ein zweites Mal separat gewählt, was zu Inkonsistenz führt (Regel = GBP, verknüpfter Tarif = EUR → falsche Anzeige, falsche Preauth-Beträge).
- Die Ad-hoc-Regel ist immer an genau einen Tarif gebunden (`tariff_id`), daher ist die Währung eindeutig aus dem Tarif ableitbar.

## Umfang der Änderungen (nur UI/Frontend, keine DB-Migration nötig)

### 1. Tarif-Dialog erweitern (`src/pages/ChargingBilling.tsx`)
- Im „Tarif anlegen / bearbeiten"-Dialog ein Dropdown **„Währung"** ergänzen (EUR, CHF, GBP, USD), Default `EUR`.
- Alle Preis-Labels im Dialog dynamisch mit dem Symbol der gewählten Währung versehen („Preis pro kWh (€/CHF/£/$)", „Grundgebühr", „Blockiergebühr pro Minute").
- `handleEditTariff` um `currency: tariffForm.currency` ergänzen (fehlt aktuell im Update-Payload).
- Tarif-Übersichts-Tabelle: Preis-Spalte mit korrektem Währungssymbol pro Zeile anzeigen (`toLocaleString` mit `t.currency`).

### 2. Ad-hoc-Regel-Dialog vereinfachen (`src/components/charging/adhoc/PaymentRulesPanel.tsx`)
- Das separate Währungs-Select aus dem Regel-Editor entfernen.
- Die effektive Währung wird beim Öffnen und bei Tarifwechsel automatisch aus dem gewählten Tarif übernommen (`editing.currency = selectedTariff.currency`).
- Labels („Preauth-Betrag", „Min-Betrag") und die Anzeige in der Regel-Tabelle nutzen weiter die `currencySymbol`-Hilfsfunktion — jetzt aber immer mit der Tarif-Währung.
- Falls (noch) kein Tarif gewählt wurde, Fallback = `EUR`.

### 3. Neue Ad-hoc-Regel: Default aus Tarif
- Beim „Neue Regel"-Klick keinen Hardcode `currency: "EUR"` mehr setzen — Wert leer lassen und beim Tarif-Select füllen.

### 4. Bestehende Daten
- Kein Backfill nötig: alle Bestands-Tarife haben bereits `EUR`; Bestands-Regeln behalten ihren Wert bis zum nächsten Speichern und werden dann automatisch auf die Tarif-Währung normalisiert.

## Nicht Teil dieses Plans
- Keine Änderungen an DB-Schema, RLS, Edge Functions oder Rechnungs-PDF-Erzeugung.
- Keine Multi-Currency-Umrechnung — pro Tarif gilt exakt eine Währung.

## Ergebnis
Nach Umsetzung wird die Währung ausschließlich am Tarif gepflegt. Der Ad-hoc-Regel-Editor zeigt automatisch das passende Symbol in allen Labels und Beträgen, ohne dass der Nutzer die Währung ein zweites Mal wählen muss.
