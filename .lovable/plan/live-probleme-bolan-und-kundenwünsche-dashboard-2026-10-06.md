# Live-Probleme (Bolan) und Kundenwünsche Dashboard

Die Live-Datenbank kann ich nicht direkt einsehen. Deshalb gibt es zuerst einen Prüfschritt mit fertigen Befehlen. Danach folgen die Korrekturen. Was im Code bereits bestätigt ist, ist markiert.

## A. Fehler

### 1. Widget zeigt keine Werte
**Module sind nicht die Ursache (im Code geprüft).** Module sperren nur Menüseiten. Weder das Abholen der Shelly-Werte noch die Dashboard-Widgets prüfen ein Modul.

**Wahrscheinlichste Ursache:** Die Shelly-Abholung speichert nur Werte für Zähler, die mit **genau der aktuellen** Integration verknüpft sind. In der Verwaltung gibt es je Standort zwei Shelly-Integrationen, eine alte und eine neue. Hängt der Zähler noch an der alten, gelöschten Integration, wird nichts gespeichert. Die Live-Anzeige von 20.226 W kommt direkt vom Gerät und wird nicht gespeichert, deshalb zeigt das Widget nichts.

**Prüfung (fertiger Befehl für Live):** An welcher Integration hängt der Zähler „Strom Hausanschluss“, gibt es diese Integration noch, und wann kam der letzte gespeicherte Wert?

**Lösung:**
- Zähler mit der aktuellen Integration neu verknüpfen. Auf Live als einmaliger Befehl, in der App über „Gerät bearbeiten → Speichern“.
- Beim Löschen einer Integration werden zugehörige Zähler künftig auf eine Ersatz-Integration umgehängt, oder es kommt eine deutliche Warnung.
- Widget: Hinweis „Zähler liefert seit … keine Daten“ statt einer stillen 0.

**Ergänzung nach deinem Hinweis (sehr wahrscheinlich die eigentliche Ursache):** Der Zähler „Strom Hausanschluss“ merkt sich die Kennung des Sensors aus der **alten** Integration. Die neue Integration liefert denselben Messwert unter einer anderen Kennung („a4f00fcc7950 Leistung“). Die Abholung findet deshalb keinen passenden Sensor und speichert nichts. Gleiche Namen verdecken das in der Oberfläche.
- Im Dialog „Gerät bearbeiten“ wird der Sensor wieder auswählbar (Liste der aktuellen Sensoren der gewählten Integration). Eine ungültige Kennung wird rot markiert: „Sensor nicht mehr vorhanden – bitte neu wählen“.
- Gateway-Geräte bekommen im Menü „…“ die Aktionen „Archivieren“ und „Löschen“. Messwerte bleiben beim Archivieren erhalten.
- Löschen einer Integration im Standort entfernt künftig auch deren Reste (verwaiste Integration, Geräteliste). Zähler, die daran hängen, werden vorher angezeigt und können auf die neue Integration umgehängt werden. Dabei wird die Sensor-Kennung über den Messwert-Typ (z. B. `total_act_power`) automatisch zugeordnet.
- Sofortlösung für Bolan auf Live: ein fertiger Befehl, der den Zähler auf die neue Integration und den Sensor „a4f00fcc7950 Leistung“ umstellt. Danach kommen innerhalb weniger Minuten Werte. Für die Vergangenheit gibt es keine Werte.

### 2. Module beim Partner speichern: Fehler „row-level security“
**Bestätigt im Code:** Die Regel erlaubt Speichern nur Super-Admins. Auf Live wird dein Konto dabei offenbar nicht als Super-Admin erkannt, oder die Regel ist dort anders angelegt.

**Prüfung:** Live-Abfrage der Regeln auf der Modultabelle und deiner Rollen.

**Lösung:**
- Speichern läuft künftig über eine abgesicherte Server-Funktion. Sie prüft die Super-Admin-Rolle selbst und zeigt eine klare Meldung.
- Eine Migration legt die Regel auf Live garantiert korrekt an.

### 3. Nach Remote-Ende im Super-Admin ohne Umschalter
**Bestätigt im Code:** „Beenden“ springt immer in den Super-Admin, auch wenn die Sitzung aus dem Partner-Portal gestartet wurde. Warum der Umschalter fehlt, muss ich noch prüfen. Vermutlich werden die Rollen nach dem Zurückwechseln zu früh gelesen, solange noch die alte Anmeldung gilt.

**Lösung:**
- Rücksprung dorthin, wo die Remote-Sitzung gestartet wurde (Super-Admin oder Partner-Portal).
- Nach dem Zurückwechseln werden die Rollen neu geladen, damit der Umschalter wieder erscheint.

### 4. Gelöschte Integrationen bleiben in Verwaltung → Integrationen
**Bestätigt im Code:** Beim Löschen im Standort wird nur die Verknüpfung entfernt. Der Integrations-Eintrag selbst bleibt und erscheint mit „Nicht verbunden, Liegenschaft —“.

**Lösung:**
- Die Übersicht zeigt nur Integrationen, die an einer Liegenschaft hängen.
- Verwaiste Einträge bekommen einen eigenen, eingeklappten Bereich mit „Endgültig löschen“.
- Löschen im Standort entfernt künftig auch den verwaisten Eintrag. Das gilt nur, wenn er an keinem anderen Standort mehr hängt.

## B. Kundenwünsche – was gibt es schon, was geht schnell

### 1. Ist-Leistung NVP Prozessionsweg und Keplerweg, Liniendiagramm, Jahresexport

| Wunsch | Stand | Aufwand |
|---|---|---|
| Aktueller Wert in W | Gibt es schon (Gauge-/Kennzahl-Widget) | Funktioniert, sobald Zähler zugeordnet (A1) |
| Liniendiagramm | Gibt es schon (Widget-Designer, Typ Linie) | wie oben |
| Export Jahreslastgang ≥ 15 min | Teilweise: Energieanalyse exportiert CSV/Excel | Neu: Knopf „Lastgang exportieren“ mit festen 15-min-Werten für ein Kalenderjahr, schnell umsetzbar |

Einschränkung: Für die Monate vor der Zuordnung des Zählers gibt es keine Werte. Der Jahreslastgang füllt sich ab dem Zuordnungstag.

### 2. Ladeleistung je Ladepunkt auf dem Dashboard
Empfehlung: **ein fertiges Dashboard-Widget „Ladeleistung je Ladepunkt“**, das man wie andere Widgets einblendet. Dazu kommt ein Knopf „Im Dashboard anzeigen“ in der Ladeinfrastruktur, der genau dieses Widget einschaltet.
- Warum kein Widget-Designer: Ladepunkte sind dort keine Zähler. Das wäre aufwendig und fehleranfällig.
- Das Widget zeigt pro Ladepunkt die aktuelle Leistung in kW mit Status. Die Live-Werte gibt es bereits, sie stammen aus den OCPP-Messwerten.

## Technische Details
- Live-Diagnose-SQL (du führst es im DB-Container aus): `custom_widget_definitions` → meter_ids → `meters` (existiert, location, is_archived) → letzte `meter_power_readings`; `pg_policies` für `partner_modules`; `user_roles` des eingeloggten Kontos.
- A2: Edge Function `super-admin-set-partner-modules` (has_role-Prüfung, service role write), Dialog darauf umstellen; idempotente Migration, die die Policy neu anlegt.
- A3: `startImpersonation` merkt sich die Herkunft (`origin_area`); `endImpersonation` springt dorthin; nach `setSession` `queryClient.clear()` vor dem Reload.
- A4: Integrations.tsx filtert auf Einträge mit `location_integrations`, Abschnitt „Verwaist“; Löschpfad im Standort entfernt `integrations`-Zeile ohne weitere Verknüpfung.
- B1: `exportLoadProfile(meterId, year)` mit `get_power_series_auto` in 15-min-Auflösung → CSV/XLSX, Werte in W, deutsches Zahlenformat, Zeit Europe/Berlin.
- B2: Neues Widget `charge_point_power` (useOcppLiveData), Eintrag in `useWidgetAvailability` an `ev_charging` gebunden, Knopf in ChargingPoints.
- Changelog, Release Notes, Handbuch (4 Sprachen), Version v1.4.0 (neue Funktionen).
