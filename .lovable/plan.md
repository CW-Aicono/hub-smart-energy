## Was ich gefunden habe (Diagnose, keine Spekulation)

### Problem 1 – PV-Prognose „Ist 0,0 kWh"

- Der Live-Zähler **Erzeugung** (UUID `1d48d32d-…`) liefert über die WS-Bridge aktuelle 5‑Min‑Werte in die Tabelle `meter_power_readings_5min_bridge` (letzter Wert heute 07:35 Uhr ✓).
- Der Cron-Job `aggregate-pv-actual-hourly` läuft jede Stunde erfolgreich, schreibt aber **nichts Neues** in `pv_actual_hourly` (letzter Eintrag: **6. April 2026**).
- Ursache: Die SQL-Funktion `aggregate_pv_actual_hourly` ruft `public.get_power_readings_5min(...)` auf. Diese Hilfsfunktion liest nur aus den **alten** Tabellen `meter_power_readings_5min` und `meter_power_readings` – **nicht** aus `meter_power_readings_5min_bridge`. Seit der Umstellung auf WS-Bridge bekommt die PV-Aggregation also keine Daten mehr.

### Problem 2 – Live-Daten erscheinen erst nach Minuten

- Beim Öffnen von `/live-values` werden zunächst nur die letzten DB-Polling-Werte angezeigt (z. B. 11,05 kW). Die echten Live-Updates kommen ausschließlich, wenn die WS-Bridge ein neues Sample broadcastet.
- Da Loxone bei vielen UUIDs nur dann sendet, wenn der Wert um mehr als die interne Hysterese kippt, vergehen je nach Zähler 1–3 Minuten zwischen Broadcasts. Das erklärt das Warten.
- Zusätzlich: Es gibt **keine initiale „letzter bekannter Wert aus Bridge"-Anzeige** – beim ersten Laden wird nur DB-Polling-Wert benutzt, obwohl in `bridge_raw_samples` oft ein sehr frischer Wert vorliegt.

### Problem 3 – Disk I/O Budget bei 92 %

- WS-Bridge ist **nicht** der Hauptverursacher: `bridge_raw_samples` = 4 MB, `meter_power_readings_5min_bridge` = 1,2 MB, nur 1.463 Samples/Stunde.
- Die echten Top-Verursacher laut `pg_stat_statements`:
  1. **5,1 Mio INSERTs** in die alte Tabelle `meter_power_readings` (≈ 23.000 s CPU). Wird weiterhin von vielen Pfaden geschrieben (gateway-ingest, loxone-api Reste, Shelly, Schneider, etc.) – pro relevantem Zähler ~60 Inserts/Stunde = 1/Minute.
  2. **2,3 Mio UPDATEs** auf `location_integrations.last_sync_at` / `sync_status` (≈ 22.000 s CPU). Jeder Polling-/Sync-Tick schreibt diese Zeile – extrem chatty.
  3. ~165 K Selects auf `meter_power_readings` für Charts (mit `ORDER BY recorded_at`).
- → I/O-Problem ist **Polling + Status-Updates**, nicht WebSocket.

### Problem 4 – Rathaus: 977 Sitzungen / 24 h

- Das sind ~1 Reconnect alle 90 Sek. AICONO Zentrale hat 11 Sessions (alle 2 h), Jugendzentrum 12. Rathaus fällt aus dem Rahmen.
- Wahrscheinlichste Ursachen: (a) der Loxone Miniserver im Rathaus killt die Verbindung selbst (Token-Ablauf, weil ein anderer Tab/User dieselben Credentials nutzt – jeder neue Login invalidiert die alten Sessions), (b) der HA-Addon-Worker verliert die Verbindung wegen Netzwerk/MTU oder (c) doppelter Worker greift parallel auf denselben Miniserver zu.
- Muss in den Disconnect-Reasons (`loxone_ws_session_log`) verifiziert werden – mache ich vor jeder Code-Änderung.

---

## Ist WebSocket der falsche Weg?

**Nein.** Die WS-Bridge selbst macht kaum I/O (4 MB Daten, < 0,1 % der Last). Sie löst genau das ursprüngliche Problem – kostenlose Live-Werte ohne Polling. Das I/O-Budget brennt komplett auf der **alten Polling/Schreibe**-Schiene.

Richtig ist: WS-Bridge **konsequent** zu Ende führen → dann die alten Polling-Schreibwege für Loxone deaktivieren → I/O sinkt drastisch.

---

## Plan (in dieser Reihenfolge, jedes Teil einzeln verifizierbar)

### Schritt A – PV-Ist sofort reparieren (Problem 1)

1. `get_power_readings_5min` per Migration erweitern: zusätzlich `UNION ALL` auf `meter_power_readings_5min_bridge` (gleiche Spalten `meter_id`, `power_avg`, `bucket`, `sample_count`).
2. `aggregate-pv-actual-hourly` einmal manuell für die letzten 48 h triggern (Backfill).
3. Verifikation: `SELECT * FROM pv_actual_hourly WHERE meter_id='d8baaf1e-…' AND hour_start>=today` muss Werte > 0 enthalten, „Ist" auf der PV-Seite zeigt heute kWh.

### Schritt B – Live-Werte schneller anzeigen (Problem 2)

1. Beim Mount von `LiveValues.tsx` zusätzlich aus `bridge_raw_samples` den letzten Wert pro UUID lesen (ein einziger Bulk-Query). Wenn dort frischer als das DB-Polling-Resultat → diesen verwenden.
2. Loading-Skeleton anzeigen statt veraltetem 11,05-kW-Wert, solange weder DB- noch Bridge-Wert verfügbar.
3. Keine Änderung am Broadcast/Realtime-Pfad nötig (funktioniert).

### Schritt C – I/O-Budget entlasten (Problem 3, größter Hebel)

1. `**location_integrations`-Update drosseln**: `last_sync_at`/`sync_status` nur noch alle 5 Min oder bei Statuswechsel schreiben (statt bei jedem Polling-Tick). Erwarteter Effekt: −80 % der 2,3 Mio UPDATEs.
2. **Loxone-Polling-Schreibwege in `meter_power_readings` deaktivieren**, sobald die WS-Bridge für die jeweilige Liegenschaft aktiv ist (Flag auf `bridge_miniserver_links`). Andere Integrationen (Shelly/Schneider/HM) bleiben unverändert.
3. Erwarteter Effekt: −60 bis −80 % I/O ohne Instanz-Upgrade.

### Schritt D – Rathaus-Reconnects analysieren (Problem 4)

1. `loxone_ws_session_log` der letzten 24 h für Rathaus auswerten: Disconnect-Reason, Dauer, gleichzeitige Worker.
2. Erst danach Maßnahme entscheiden (z. B. eigenen WS-Token pro Worker erzwingen, Heartbeat-Intervall anheben, doppelten Worker stoppen). **Hier wird vor jeder Änderung ein Befund geliefert** – kein Blindfix.

### Schritt E – Zählerstand-Backfill (vom User auf später vertagt)

- Ausgesetzt bis Schritt A–D verifiziert.

---

## Was bewusst NICHT Teil des Plans ist

- Kein WebSocket-Rollback (Daten zeigen klar: WS ist nicht das Problem).
- Kein Instanz-Upgrade als erste Maßnahme – erst nach Schritt C bewerten.
- Keine spekulativen Refactors.

## Reihenfolge der Umsetzung

A → B → C → D, jeder Schritt einzeln implementiert + verifiziert, bevor der nächste startet. Bestätigst Du diese Reihenfolge, oder soll ich einen Schritt vorziehen (z. B. C zuerst wegen 92 % I/O)?  
  
Atwort: Vorgehen so bestätigt, bitte umsetzen

&nbsp;