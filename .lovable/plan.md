## Problem

Der OCPP-Log-Bereich rendert sich alle paar Sekunden komplett neu (Liste verschwindet kurz, "Lade Logs…" blitzt auf, dann ist sie wieder da). Das wirkt unruhig.

## Ursache

Zwei Punkte im Code arbeiten gegeneinander:

1. **`useOcppLogs.tsx`** ruft bei jeder Änderung der `ids`-Array-Referenz einen kompletten Reload aus und setzt dabei `loading = true`. Solange `loading = true` ist, ersetzt der Viewer die ganze Tabelle durch den Text „Lade Logs…".
2. **`OcppLogViewer.tsx`** baut `logIds` über `useMemo` mit der Abhängigkeit `[chargePointId, chargePoints]`. `chargePoints` kommt aus `useChargePoints` und wird durch Realtime-Updates (WS-Status, Heartbeat usw.) regelmäßig **als neues Array-Objekt** zurückgegeben — auch wenn sich an unserem konkreten Ladepunkt inhaltlich nichts ändert. Dadurch entsteht alle paar Sekunden eine neue `logIds`-Referenz → neue `ids` → neuer `fetchLogs` → kompletter Reload + Blinken.

Die Realtime-Subscription für neue Log-Zeilen funktioniert dabei tadellos — das Blinken kommt also nicht von neuen Logs, sondern von einem unnötigen Voll-Reload der Historie.

## Lösung (minimal, nur UI/Hook)

Zwei kleine, gezielte Änderungen — keine neuen Features, keine Backend-Änderungen.

### 1. `src/hooks/useOcppLogs.tsx`
- `loading` nur beim **allerersten** Laden (oder wenn die `idsKey` wirklich wechselt) auf `true` setzen. Bei Folge-Refetches im Hintergrund still nachladen, ohne `loading` zu togglen.
- `fetchLogs` von `[ids, activeType]` auf `[idsKey, activeType]` umstellen (`idsKey` ist der stabile String-Join), damit identische ID-Listen keinen neuen Refetch auslösen.

### 2. `src/components/charging/OcppLogViewer.tsx`
- `logIds` so memoisieren, dass nur der **String** der zusammengesetzten IDs in die Dependency geht (z. B. via `useMemo` mit `[chargePointId, cp?.id, cp?.ocpp_id]` statt dem gesamten `chargePoints`-Array). Dann triggert ein neues `chargePoints`-Array keinen unnötigen Reload mehr.
- Den `loading`-Zweig so anpassen, dass nur beim allerersten Laden (also wenn `logs.length === 0`) „Lade Logs…" gezeigt wird. Sobald einmal Daten da sind, bleibt die Tabelle stehen, auch wenn im Hintergrund nachgeladen wird.

### Was sich NICHT ändert
- Filter, Realtime-Subscription, Pause-Button, Layout, Farben, Polling-Verhalten des OCPP-Servers, Backend.
- Neue Log-Einträge erscheinen wie bisher live über die bestehende Realtime-Subscription.

## Erwartetes Ergebnis
Die Log-Tabelle bleibt ruhig stehen. Neue Zeilen erscheinen oben weich eingeschoben, ohne dass die ganze Liste verschwindet und neu aufgebaut wird.
