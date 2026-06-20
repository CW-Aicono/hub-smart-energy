# Befund nach Log- und DB-Prüfung

Du hast recht: **Phase 6 läuft bereits**.

Im Log steht eindeutig:

```text
version=phase6.0-io-reduction
```

Die Phase-6-Änderungen wirken auch teilweise bereits:

- `bridge_event_log` ist stark gefallen: **457 Einträge davor 3 h → 123 Einträge letzte 3 h**
- `loxone_ws_session_log` ist stark gefallen: **94 Änderungen davor 3 h → 18 Änderungen letzte 3 h**
- neue Sitzungen: **94 davor 3 h → 15 letzte 3 h**

Das ist gut. Aber im Log ist ein anderer klarer Fehler sichtbar.

---

# Auffälligkeit im Log

Beim Start steht:

```text
BRIDGE_HEARTBEAT_MS=30000
```

Das ist **nicht** der neue Phase-6-Standard.

Phase 6 im Code hat als Standard:

```text
BRIDGE_HEARTBEAT_MS=300000
```

Also: **Der Docker-Start überschreibt den neuen Wert weiterhin mit 30000 ms.**

Das bedeutet:

- Der Worker sendet weiterhin alle **30 Sekunden** einen Bridge-Heartbeat.
- Dabei wird `bridge_workers` aktualisiert.
- Zusätzlich werden bei jedem Heartbeat auch die 3 Einträge in `bridge_miniserver_links` aktualisiert.
- Das sind ungefähr **4 Schreibvorgänge alle 30 Sekunden**.
- Erwartet wären mit Phase 6 nur **4 Schreibvorgänge alle 5 Minuten**.

Das erklärt nicht allein 100 % IO, ist aber ein unnötiger Rest-Fehler im Worker-Betrieb.

---

# Noch wichtiger: Watchdog erzeugt weiterhin Reconnects alle ca. 11 Minuten

Im Log sieht man dieses Muster mehrfach:

```text
[Watchdog] ... seit 656s ohne Event → forciere Reconnect
[WS] ... geschlossen (code=2003)
Reconnect ...
```

Das heißt:

- Die Verbindungen sind nicht mehr wild instabil.
- Aber der Worker betrachtet sie nach ca. **10–11 Minuten ohne Event** als „tot“.
- Dann trennt er **alle 3 Miniserver gleichzeitig** und verbindet sie neu.

Der Grund ist sehr wahrscheinlich: Bei diesen Miniservern kommen zeitweise keine echten Wert-Events. Der Watchdog prüft aber aktuell nur `lastEventAt` bzw. `lastConnectedAt`, nicht ob der Socket per Keepalive noch antwortet.

Wichtig: Das ist nicht unbedingt ein echter Verbindungsfehler. Es kann auch einfach heißen: „Es kam 10 Minuten lang kein Messwert-Event.“

---

# Aktuelle IO-Quellen letzte 3 Stunden vs. 3 Stunden davor

Gemessen über echte Zeitspalten, nicht nur kumulative Statistik:


| Quelle                                 | letzte 3 h | 3 h davor | Bewertung                                                            |
| -------------------------------------- | ---------- | --------- | -------------------------------------------------------------------- |
| `bridge_raw_samples` empfangen         | 2.426      | 4.349     | deutlich weniger                                                     |
| `bridge_raw_samples` verarbeitet       | 2.602      | 4.325     | deutlich weniger                                                     |
| `meter_power_readings`                 | 1.260      | 1.148     | etwa gleich                                                          |
| `meter_power_readings_5min`            | 748        | 1.408     | weniger                                                              |
| `meter_power_readings_5min_bridge`     | 748        | 1.408     | weniger                                                              |
| `charge_point_uptime_snapshots`        | 216        | 198       | etwa gleich                                                          |
| `meter_period_totals` Updates          | 188        | 0         | Cron-bedingt / zeitpunktabhängig                                     |
| `bridge_event_log`                     | 123        | 457       | deutlich weniger                                                     |
| `loxone_ws_session_log` Updates        | 18         | 94        | deutlich weniger                                                     |
| `loxone_ws_session_log` neue Sitzungen | 15         | 94        | deutlich weniger                                                     |
| `bridge_miniserver_links` Updates      | 3          | 0         | wegen aktuellem Heartbeat-Fenster niedrig, aber Startwert ist falsch |


Kurz gesagt: **Der Worker ist nicht mehr der Haupt-Hammer wie vorher. Die IO-Last ist gefallen, aber die Plattformanzeige bleibt noch bei 100 %.**

Das kann daran liegen, dass diese Anzeige verzögert/rollierend bewertet wird. Zusätzlich gibt es weiterhin andere Schreibquellen: OCPP-Log-Cleanup, Rohdaten-Retention, Aggregations-Crons.

---

# Geplanter nächster Fix

## Schritt 1: Docker-Startparameter korrigieren

Im Container muss `BRIDGE_HEARTBEAT_MS=30000` entfernt oder auf `300000` gesetzt werden.

Ziel:

```text
BRIDGE_HEARTBEAT_MS=300000
```

Das ist ein reiner Betriebsparameter, kein Code-Fix.

## Schritt 2: Watchdog entschärfen

Der Watchdog soll nicht mehr nach 10 Minuten ohne Wert-Event sofort reconnecten, wenn der Socket grundsätzlich noch lebt.

Geplante Änderung im Worker:

- Erfolgreiche Keepalive-Antwort als `lastEventAt`-ähnlichen Lebensnachweis speichern.
- Watchdog-Schwelle optional auf 30 Minuten erhöhen.
- Dadurch bleiben Verbindungen bei „keine neuen Werte, aber Socket lebt“ bestehen.

Erwartung:

- deutlich weniger Reconnects
- weniger `bridge_event_log` Warnungen
- weniger Session-Updates
- weniger gleichzeitige Reconnect-Spitzen

## Schritt 3: Danach 3 Stunden beobachten

Nach Schritt 1 und 2 prüfen wir erneut:

- Disk-IO-Anzeige
- `bridge_event_log` pro Stunde
- neue `loxone_ws_session_log` Sitzungen pro Stunde
- `bridge_raw_samples`
- `meter_power_readings`
- `meter_period_totals`

Erst wenn das IO-Budget dann weiter bei 100 % bleibt, gehen wir an die DB-Crons (`meter_period_totals`, Retention, OCPP-Logs). Nicht vorher, damit wir nicht mehrere Ursachen gleichzeitig vermischen.

---

# Wichtig

Das ist **kein dritter Blindversuch**. Die neue Ursache ist im Log konkret sichtbar:

1. Phase 6 läuft.
2. `BRIDGE_HEARTBEAT_MS` wird trotzdem falsch mit 30 Sekunden gestartet.
3. Der Watchdog trennt alle Verbindungen regelmäßig nach ca. 656–658 Sekunden ohne Event.

Nach deinem OK liefere ich als nächsten Schritt nur die genaue, laienfreundliche PuTTY-Anleitung für **Schritt 1**: Docker-Startparameter prüfen und `BRIDGE_HEARTBEAT_MS=300000` setzen.  
  
OK. Bitte die Datei hier im Code entsprechend anpassen, ich werde das Update manuell über Putty auf Hetzner deployen. Und bitte eine Anleitung für mich als Laie  
  
  
  
  