## Befund

- In der Datenbank existiert aktuell **1 Gain-Sharing-Vertrag** für den Tenant **Stadt Steinfurt**.
- Das Modul `gain_sharing` ist für diesen Tenant aktiv.
- In `tenant_savings_baselines` stehen aktuell **0 Baseline-Zeilen**. Deshalb zeigt die UI korrekt weiter: „Noch keine Baseline berechnet.“
- Der Vertrag nutzt derzeit **Baseline-Jahr 2026**. Für den Tenant liegen 2026 zwar aggregierte Zählerwerte vor, aber die Baseline-Funktion schreibt offenbar keine Zeilen oder liefert ein leeres Ergebnis ohne erkennbare Diagnose in der Oberfläche.
- Die Edge-Function-Logs enthalten nur Boot/Shutdown, aber keine fachlichen Logs. Dadurch ist für Admins und Tenant nicht nachvollziehbar, ob keine Zähler gefunden wurden, keine Werte vorhanden sind, falsche Energiearten verwendet werden oder der Upsert fehlschlägt.

## Ziel

Das Gain-Sharing-Modul soll nicht nur rechnen, sondern für Super-Admin und Tenant nachvollziehbar zeigen:

- welche Datenbasis verwendet wurde,
- welche Zähler/Energiearten einbezogen wurden,
- warum ggf. keine Baseline erzeugt wurde,
- welche Werte berechnet wurden,
- ob die Baseline vollständig genug für eine spätere Abrechnung ist.

## Umsetzungsplan

### 1. Baseline-Berechnung robust machen

- Die Baseline-Funktion soll nicht mehr still mit `success: true` enden, wenn keine Baseline-Zeilen geschrieben wurden.
- Wenn keine geeigneten Zähler gefunden werden, soll sie eine klare Meldung zurückgeben, z. B.:
  - „Keine Verbrauchszähler für diesen Tenant gefunden.“
  - „Zähler vorhanden, aber keine Periodenwerte im Baseline-Jahr.“
  - „Nur Erzeugungs-/Exportzähler gefunden, diese werden nicht berücksichtigt.“
- Energiearten wie `none` sollen ausgeschlossen werden, damit technische Sensoren nicht in Gain-Sharing einfließen.
- Archivierte Zähler sollen standardmäßig ausgeschlossen werden.
- Die Funktion soll pro Energieart auf Monats- oder Tageswerte zurückfallen, je nachdem welche Daten verfügbar sind.
- Fehler aus `get_meter_period_sums` und Upserts sollen explizit behandelt und in der UI angezeigt werden.

### 2. Diagnose-/Audit-Daten in der Antwort zurückgeben

Die Baseline-Funktion soll zusätzlich zu den berechneten Ergebnissen eine nachvollziehbare Diagnose zurückgeben:

- Anzahl aller Tenant-Zähler
- Anzahl berücksichtigter Verbrauchszähler
- ausgeschlossene Zähler nach Grund
- Datenabdeckung je Energieart
- Zeitraum der verwendeten Werte
- Anzahl geschriebener Baseline-Zeilen
- Warnungen, z. B. „Baseline-Jahr ist laufendes Jahr“ oder „nur Teildaten vorhanden“

### 3. Oberfläche erweitern: Baseline-Status statt leerer Meldung

Im Gain-Sharing-Tab soll die Baseline-Karte erweitert werden:

- Nach einer Berechnung werden Warnungen/Diagnosen sichtbar angezeigt.
- Wenn keine Baseline geschrieben wurde, erscheint nicht nur „Noch keine Baseline berechnet“, sondern der konkrete Grund.
- Neben der Tabelle sollen KPI-Zusammenfassungen erscheinen:
  - Anzahl Energiearten
  - Gesamtverbrauch kWh
  - Datenabdeckung
  - letzte Berechnung
- Pro Energieart soll sichtbar sein:
  - Verbrauch roh
  - normalisierter Verbrauch
  - Quelle
  - verwendeter Zeitraum
  - Datenqualität / Warnung

### 4. Tenant-Nachvollziehbarkeit ergänzen

Für Tenant-Admins und Partner soll die Einsparbeteiligung lesbar, aber nicht administrativ veränderbar sein:

- Vertrag anzeigen: Baseline-Jahr, Startjahr, Anteil AICONO, Partneranteil, Witterungsbereinigung, Preisbasis.
- Baseline anzeigen: Energiearten, Werte, Quelle, letzte Berechnung, manuelle Overrides inkl. Begründung.
- Abrechnungen anzeigen: nur freigegebene/abgerechnete/bezahlte Abrechnungen gemäß bestehender Rechte.
- Keine Bearbeiten-/Berechnen-Buttons außerhalb Super-Admin.

### 5. Fehlende fachliche Funktionen für ein vollständiges Modell ergänzen

- Manuelle Baseline-Anlage, falls keine verwertbaren Messwerte existieren.
- Pflicht-Begründung für manuelle Overrides.
- Festpreise pro Energieart editierbar machen, wenn `contract_fixed` gewählt ist.
- Datenqualitätsstatus einführen:
  - `vollständig`
  - `teilweise`
  - `keine Daten`
  - `manuell`
- Warnung, wenn Baseline-Jahr noch nicht abgeschlossen ist.
- Abrechnung erst zulassen, wenn mindestens eine gültige Baseline existiert.
- Details zur Abrechnung tenantverständlich anzeigen: Baseline, Ist-Verbrauch, Preis, Einsparung, AICONO-Anteil, verbleibende Tenant-Einsparung.

### 6. Technische Absicherung

- Edge Functions mit fachlichen Logs versehen, ohne sensible Daten auszugeben.
- Baseline- und Calculate-Funktion konsistent machen: gleiche Zählerfilter, gleiche Energiearten, gleiche Datenquellen.
- Frontend-Invalidierung nach Berechnung härten, damit die Baseline-Liste sicher neu geladen wird.
- Optional: kleine Datenbank-Erweiterung für Baseline-Metadaten wie `coverage_months`, `data_quality`, `calculation_details`, damit die Nachvollziehbarkeit dauerhaft gespeichert wird.

## Erwartetes Ergebnis

Nach Umsetzung sieht der Super-Admin direkt, ob die Baseline erfolgreich erzeugt wurde oder warum nicht. Der Tenant kann später transparent nachvollziehen, auf welcher Datenbasis die Einsparbeteiligung basiert, ohne administrative Rechte zu erhalten.