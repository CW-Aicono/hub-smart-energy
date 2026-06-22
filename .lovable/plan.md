## Ziel
Loxone-Websocket-Events pro UUID auf **maximal 1 Sample alle 5 Sekunden** drosseln, damit die DB-Schreiblast (IO-Budget) stark sinkt. Live-Werte und Tagesverbrauch bleiben gefühlt "live" (5s-Updates sind für Menschen nicht von Echtzeit unterscheidbar).

## Hintergrund
- Loxone pusht `pwr`-Werte teils mehrfach pro Sekunde (bis ~100 ms).
- Aktuell schreibt der Worker **jeden** Event 1:1 in `bridge_raw_samples` → ~1.000 Events/min (~17/s, ~1,4 Mio Zeilen/Tag).
- Davon ist nur ein Bruchteil für die spätere 5-Min-Aggregation nötig.
- Das eigentliche aktuelle IO-Problem (74 % Budget) hat **andere** Ursachen (siehe Hinweis unten) — diese Drosselung ist die Vorsorge, damit der Worker das Problem nicht zusätzlich anheizt.

## Vorgehen (1 kleine Änderung im Worker, keine Cloud-Migration)

### Änderung in `docs/loxone-ws-worker/index.ts`
Ein **Throttle-Map pro `(miniserverSerial, stateUuid)`** ergänzen:

```text
lastWrittenAt: Map<key, timestampMs>
lastValueBuffer: Map<key, { value, ts, eventMeta }>  // letzter "verworfener" Wert
```

Logik beim eingehenden WS-Event:
1. `key = serial + ":" + uuid`
2. `dt = now - lastWrittenAt.get(key)`
3. Wenn `dt >= 5000 ms` (oder noch nie geschrieben) → **direkt in `bridge_raw_samples` schreiben**, `lastWrittenAt = now`, Buffer leeren.
4. Sonst → nur `lastValueBuffer.set(key, …)` (kein DB-Write).
5. Alle 5 s ein Sweep-Timer: für alle Keys mit Buffer-Eintrag, deren `dt >= 5000`, den **zuletzt gepufferten Wert** schreiben → garantiert, dass auch der letzte Wert einer Burst-Serie ankommt.

### Konfigurierbarkeit
- Neue Env-Variable `WS_MIN_INTERVAL_MS` (Default `5000`).
- Kann pro Deployment auf z. B. `2000` oder `10000` justiert werden, ohne Code-Änderung.

### Bewusst NICHT geändert
- 15-Min-HTTP-Pull bleibt unverändert (liefert die "Wahrheit" für Zähler).
- 5-Min-Aggregation (`meter_power_readings_5min`) bleibt unverändert — bekommt ab jetzt sauberere, dünnere Quelldaten.
- UI-Pfade, Heartbeat, Snapshot-Logik bleiben unangetastet.

## Erwartete Wirkung
- Schreibvolumen in `bridge_raw_samples`: **~17/s → maximal ~0,2/s pro aktivem UUID-Stream**.
- Bei ~85 State-UUIDs (3 Miniserver): theoretisches Maximum ~17/s, real durch Inaktivität deutlich darunter — typisch **80–95 % weniger Inserts**.
- Live-Wert im Dashboard aktualisiert sich weiterhin alle 5 s (für den Nutzer "live").
- Tagesverbrauch unverändert genau (basiert auf 15-Min-HTTP-Pull + 5-Min-Aggregation).

## Risiken / Edge Cases
- **Kurzpeaks** (z. B. 8 kW für 1 s) können verloren gehen → akzeptabel, da Peak-Analyse ohnehin auf 5-Min-Aggregat basiert.
- **Letzter Wert vor Ruhephase** wird durch den Sweep-Timer garantiert geschrieben → keine "hängenden" alten Anzeigen.
- **Worker-Restart**: Maps sind in-memory → nach Restart wird der erste Wert sofort geschrieben (gewollt).

## Wichtiger Hinweis zum aktuellen IO-Budget (74 %)
Diese Änderung adressiert **nicht** das bestehende IO-Problem, da WS erst seit ~1 h läuft. Empfehlung: parallel das IO-Playbook abarbeiten (`supabase--slow_queries` + `pg_stat_statements`), um den eigentlichen Treiber zu finden. Das ist eine separate, reine Lese-Analyse ohne Code-Änderung.

## Deployment-Schritte (nach Build-Mode-Freigabe)
1. `docs/loxone-ws-worker/index.ts` anpassen (Throttle + Sweep-Timer + Env).
2. `WORKER_VERSION` auf `phase7.3-throttle5s` setzen.
3. Auf dem Hetzner-Server: `git pull` (bzw. Datei kopieren) → `docker build -t loxone-ws-worker:phase7.3 .` → `docker compose up -d`.
4. Nach 10 min in `bridge_raw_samples` per `count(*)` über die letzten 5 min vs. vorher vergleichen → Reduktion bestätigen.

## Frage an dich vor Implementierung
Soll ich das Intervall **fix auf 5 s** setzen, oder lieber direkt **per Env konfigurierbar** (Default 5 s) machen, damit wir später ohne Re-Build justieren können?
