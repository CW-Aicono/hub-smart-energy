Ich habe die Datenbank geprüft. Ergebnis: Die Anzeige ab 02:00 kommt nicht aus einer Achsen-/Timezone-Panne, sondern weil der Detaildialog aktuell `meter_power_readings` liest — dort gibt es für den Speicher-Meter tatsächlich 48 Werte ab 02:00 Berlin. Der Speicher-Datensatz selbst wurde aber erst um ca. 10:05 Berlin angelegt; deshalb soll die Detailgrafik für diesen Speicher erst ab diesem Speicher-/Gateway-Kontext starten. Beim SOC ist der aktuelle Wert in `energy_storages.current_soc_pct = 100`, aber die bisher abgefragte Historie aus `bridge_raw_samples` ist für diese UUID Power/kW, nicht SOC-%. Außerdem werden echte SOC-Events derzeit nicht als Zeitreihe in `bridge_raw_samples` persistiert, sondern nur als aktueller SOC gespeichert.

Plan:

1. **Power-Chart für Speicher korrekt begrenzen**
   - Im Detaildialog zusätzlich `energy_storages.created_at`, `soc_updated_at`, `current_soc_pct`, `soc_sensor_uuid` und `power_meter_id` laden.
   - Für Batterie/Speicher die sichtbare Datenreihe auf `max(rangeStart, storage.created_at)` begrenzen.
   - Dadurch verschwindet die scheinbare Historie ab 02:00, wenn der Speicher erst seit ca. 10:00 in diesem Kontext Daten liefert.

2. **Datenquelle klarer verwenden**
   - Die Leistungswerte weiterhin aus `meter_power_readings` lesen, aber erst ab dem berechneten Cutoff.
   - Optional vorhandene Vorwerte vor `storage.created_at` nicht mehr in Statistik, Linie und Energie-Buckets einbeziehen.

3. **SOC-Historie nicht mehr falsch aus Power-Rohdaten zeichnen**
   - Die bisherige SOC-Abfrage aus `bridge_raw_samples` für `soc_sensor_uuid` entfernen bzw. nur noch verwenden, wenn eindeutig Prozentwerte vorliegen und nicht dieselbe UUID wie der Power-Meter ist.
   - Für den aktuellen Stand `current_soc_pct = 100` einen Punkt am rechten Rand anzeigen, aber nicht als historische Linie aus Powerdaten interpretieren.

4. **SOC-Zeitreihe sauber für die Zukunft persistieren**
   - Eine kleine Backend-Erweiterung vorsehen: SOC-Events mit `role='soc'` zusätzlich als eigene SOC-Zeitreihe speichern, statt nur `energy_storages.current_soc_pct` zu aktualisieren.
   - Neue Tabelle mit Tenant/RLS/Grants: `storage_soc_readings(storage_id, tenant_id, sensor_uuid, soc_pct, recorded_at)`.
   - Danach kann die UI echte SOC-Historie ab dem Zeitpunkt anzeigen, ab dem SOC-Events persistiert werden.

5. **Chart-Beschriftung vereinheitlichen**
   - Wenn der erste sichtbare Power-Datenpunkt später als der 24h-Start ist, Hinweis: `Daten ab HH:mm` statt `Keine Daten vor HH:mm`.
   - Beim SOC: wenn keine echte SOC-Zeitreihe vorhanden ist, Label `SOC aktuell: 100 %`, keine Linie.
   - Wenn künftig echte SOC-Historie vorhanden ist, wird sie als durchgezogene Linie erst ab dem ersten SOC-Datenpunkt gezeichnet.

6. **Validierung nach Umsetzung**
   - Per Datenbank prüfen: erster angezeigter Power-Punkt liegt bei ca. 10:00/10:05 Berlin, nicht 02:00.
   - SOC zeigt 100 % aktuell und keine falsche kW-basierte SOC-Kurve.
   - Energie-pro-Stunde nutzt denselben Cutoff wie der Leistungsverlauf, damit beide X-Achsen konsistent bleiben.