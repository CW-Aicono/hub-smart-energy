## Ziel

Eindeutig herausfinden, warum nach dem initialen Subscribe **keine Live-Push-Events** vom Loxone Miniserver mehr im Worker ankommen.

## Was geändert wird

**Nur eine Datei:** `docs/loxone-ws-worker/index.ts`

**Konkret zwei kleine Patches in `connect()`:**

1. **In `config.delegate` (aktuell Zeile ~336–360):** Den bestehenden `socketOnEventReceived` so erweitern, dass die **ersten 20 Events pro Miniserver** komplett als JSON ins Log gehen — inkl. der bisher gefilterten (egal ob `typeof value !== "number"` oder isSpike). Zusätzlich weitere lxcommunicator-Callback-Stubs einbauen (`socketOnTextMessage`, `socketOnBinaryMessage`, `socketOnEventTableValuesUpdate`, `socketOnEventTableTextUpdate`, `socketOnKeepAlive`) — jeder loggt einmalig „CALLBACK XY feuert" bei erstem Aufruf, damit wir sehen, über WELCHEN Kanal Loxone überhaupt sendet.

2. **Version-Stamp** (Zeile ~3 und Log-Zeile mit `version=`): von `phase6.1-watchdog-relax` → `phase6.2-diagnose` umbenennen, damit du im Log siehst, dass der richtige Build läuft.

## Was NICHT geändert wird

- Killswitch, Heartbeat, Watchdog, Reload, Flush, Spike-Filter — alles bleibt identisch.
- Keine Logikänderungen, keine neuen Subscribe-Befehle, keine API-Änderungen.
- Cloud-Code (Edge Functions, DB) wird nicht angefasst.

## Ablauf (nach Plan-Approval)

1. Ich schreibe den Patch in `docs/loxone-ws-worker/index.ts`.
2. Du kopierst die geänderte Datei manuell auf den Hetzner-Server nach `/opt/loxone-ws-worker/index.ts` (exakte Putty-Anleitung gebe ich dir mit).
3. Du rebuildest das Docker-Image mit einem Copy-Paste-Block (gebe ich dir).
4. 2 Minuten warten, ein Log-Befehl, Output an mich schicken.
5. Aus dem Log lese ich definitiv ab, wo der Bug liegt → finaler Fix-Patch (1 weiterer Rebuild).

## Aufwand

- **1 Diagnose-Rebuild jetzt** + **1 finaler Fix-Rebuild danach** = maximal 2 Putty-Zyklen.
- Code-Patch ist klein (~30 Zeilen).
- Kein Risiko für Produktivdaten — der Patch loggt nur zusätzlich, ändert keine Schreibpfade.
