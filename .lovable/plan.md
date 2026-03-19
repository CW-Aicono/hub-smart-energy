
Ziel

Für die PV-Prognose künftig echte stündliche Ist-Erzeugung dauerhaft speichern, damit historische Stundenwerte nicht mehr verloren gehen, wenn Rohdaten später verdichtet oder gelöscht werden.

Was ich im aktuellen Stand gefunden habe

- Die Tagesansicht der PV-Prognose baut Ist-Stundenwerte aktuell aus `meter_power_readings`.
- Historische Fallbacks nutzen nur Tagessummen aus `get_meter_daily_totals`, daher müssen Stundenwerte derzeit geschätzt werden.
- Es gibt bereits eine stabile 5-Minuten-Historie:
  - Rohdaten werden in `meter_power_readings_5min` verdichtet
  - Rohdaten können anschließend gelöscht werden
  - `get_power_readings_5min` liefert 5-Minuten-Buckets aus 5min-Tabelle plus Raw-Fallback
- Es gibt aber noch keinen persistenten Speicher für echte PV-Istwerte auf Stundenebene.
- `pv_forecast_hourly` speichert nur Prognosedaten; fachlich sollte man echte Istwerte nicht dort “hineinmischen”.

Empfohlener Ansatz

1. Eigene Tabelle für PV-Ist-Stundenwerte einführen
- Neue Tabelle z. B. `pv_actual_hourly`
- Inhalte:
  - `tenant_id`
  - `location_id`
  - `meter_id`
  - `hour_start`
  - `actual_kwh`
  - optional `source`, `sample_count`, `coverage_minutes`
  - `created_at`, `updated_at`
- Unique Key auf `(meter_id, hour_start)`
- Vorteil: saubere Trennung zwischen Prognose und Realität, einfache Abfragen für Tages-/Wochenansicht

2. Stündliche Aggregationslogik auf vorhandener 5-Minuten-Basis aufbauen
- Für abgeschlossene Stunden die Energie aus 5-Minuten-Werten berechnen:
  - `actual_kwh = Summe(power_avg * 5 / 60)`
- Dafür nicht direkt auf Rohdaten setzen, sondern auf `get_power_readings_5min` bzw. `meter_power_readings_5min`
- Das ist robuster, weil die 5-Minuten-Daten historisch erhalten bleiben und Raw-Daten nicht

3. Backend-Job für laufende Persistierung ergänzen
- Ein stündlicher Backend-Job schreibt jeweils die zuletzt abgeschlossene Stunde weg
- Beispiel:
  - um 13:05 wird die Stunde 12:00–12:59 aggregiert und gespeichert
- Der Job sollte zusätzlich kleine Nachholung unterstützen:
  - falls eine Stunde fehlte, die letzten z. B. 24–48 Stunden erneut prüfen und per Upsert vervollständigen

4. PV-Meter automatisch aus den aktiven PV-Einstellungen ableiten
- Scope: nur aktive PV-Konfigurationen aus `pv_forecast_settings` mit gesetztem `pv_meter_id`
- So bleibt die Funktion exakt auf die PV-Prognose beschränkt und aggregiert nicht unnötig andere Zähler

5. Frontend schrittweise auf echte Stundenhistorie umstellen
- Tagesansicht:
  - heute / laufender Tag weiterhin live aus Rohdaten bzw. aktueller Integrationslogik
  - vergangene Tage zuerst aus `pv_actual_hourly`
  - nur wenn dort nichts vorhanden ist: bestehender Fallback über Tagessumme + Schätzung
- Wochen-/Monatsansicht:
  - Tagessummen bevorzugt aus aufsummierten `pv_actual_hourly`
  - Live-Override für heute beibehalten
- `PvForecastSection` sollte dieselbe Logik bekommen, damit Widget und Detailansicht konsistent sind

6. Optionaler Initial-Backfill
- Da du “für die Zukunft” schreibst, ist ein historischer Voll-Backfill nicht zwingend
- Sinnvoll wäre aber ein optionaler Start-Backfill aus vorhandenen 5-Minuten-Daten, soweit diese noch vorhanden sind
- Für ältere Zeiträume ohne 5-Minuten-Daten bleibt die aktuelle Schätzlogik aus Tagessummen bestehen

Technische Umsetzung

```text
Datenfluss künftig

meter_power_readings
   -> meter_power_readings_5min
   -> stündlicher PV-Aggregator
   -> pv_actual_hourly
   -> PV-Widget / PV-Detailansicht
```

```text
Abfrage-Priorität Tagesansicht

1. Live heute: Rohdaten / aktuelle Integrationslogik
2. Historisch: pv_actual_hourly
3. Wenn leer: get_meter_daily_totals
4. Wenn nur Tagessumme vorhanden: Stunden schätzen
```

Betroffene Bereiche

- Datenbank
  - neue Tabelle für stündliche PV-Istwerte
  - RLS-Policies
  - ggf. RPC für Stunden-/Tagesabfragen
- Backend
  - Aggregationsfunktion / geplanter Job
  - Upsert-Logik und Catch-up
- Frontend
  - `src/components/dashboard/PvForecastWidget.tsx`
  - `src/components/locations/PvForecastSection.tsx`
  - `src/lib/pvActuals.ts` als gemeinsame Lade-/Summenlogik

Wichtige Designentscheidung

- Ich würde dafür eine neue Tabelle bauen statt `pv_forecast_hourly` zu erweitern.
- Grund:
  - Forecast und Actuals haben unterschiedliche Lebenszyklen
  - Forecast wird pro Modelllauf neu geschrieben
  - Actuals sind Messhistorie und sollten unabhängig, stabil und dauerhaft sein

Annahmen

- “Nach voller Stunde aggregieren” bedeutet: nur abgeschlossene Stunden persistent speichern; die aktuelle angebrochene Stunde bleibt live berechnet.
- Der relevante PV-Zähler ist der in `pv_forecast_settings.pv_meter_id`.
- Die Leistungswerte in den 5-Minuten-Daten sind weiterhin in kW, sodass `kW * 5/60 = kWh` korrekt ist.

Ergebnis nach Umsetzung

- Historische PV-Tagesansichten können echte Stundenwerte anzeigen, statt sie nur zu schätzen.
- Wochen- und Monatsansichten bleiben konsistent mit denselben echten Ist-Daten.
- Der Verlust von Rohdaten ist für die PV-Historie künftig kein Problem mehr.
- Die bisherige Schätzung aus Tagessummen bleibt nur noch als Notfall-Fallback erhalten.
