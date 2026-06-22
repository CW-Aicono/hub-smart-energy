## Problem

Im Live-Backend zeigt der Miniserver-Status zwischen zwei Heartbeats kurz „WebSocket stale (kein Heartbeat seit 49s)" in Orange — obwohl die Verbindung normal läuft.

Grund: Der Worker sendet den Session-Heartbeat alle **60 Sekunden**, das Frontend behandelt die Session aber schon nach **45 Sekunden** ohne Update als „stale". Dadurch flackert die UI zwischen Grün („Aktiv") und Orange („stale") im Sekundentakt nach jedem Heartbeat.

## Fix

Eine einzige Frontend-Änderung in `src/components/integrations/LoxoneWsStatus.tsx`:

- Schwellwert von `45_000` ms auf `120_000` ms (2 Minuten) erhöhen.
  Das deckt den 60-s-Heartbeat plus großzügigen Puffer für Netzwerk-Verzögerungen ab, ohne echte Ausfälle zu verschleiern (Watchdog reagiert spätestens nach 1800 s ohnehin separat).
- Kommentar darüber an die neuen 120 s angleichen.

## Was nicht geändert wird

- Worker-Code, Heartbeat-Intervalle, DB-Schema, Edge Functions — alles bleibt.
- Reine kosmetische UI-Korrektur, keine Logik-Änderung am eigentlichen Verbindungsstatus.

## Verifikation

Nach dem Publish in Lovable: Karte „Miniserver K&W" beobachten — der Status bleibt durchgehend grün „WebSocket aktiv", solange der Heartbeat innerhalb von 2 Minuten eintrifft.
