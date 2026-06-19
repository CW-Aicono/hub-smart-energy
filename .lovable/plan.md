## Problem
Im OCPP-Nachrichtenlog werden neu eintreffende Nachrichten in der Reihenfolge ihres Eintreffens oben angehängt, nicht nach ihrem tatsächlichen Zeitstempel einsortiert. Dadurch erscheint z. B. ein `RemoteStartTransaction` (22:02:25) optisch oberhalb von `StatusNotification` (22:02:28), obwohl es zeitlich davor liegt. Nach Neuladen der Seite ist die Reihenfolge korrekt, weil dann nach `created_at` sortiert wird.

## Ursache
In `src/hooks/useOcppLogs.tsx` (Zeile 106) wird ein per Realtime eintreffender Log einfach vorne angehängt:
```
setLogs((prev) => [entry, ...prev].slice(0, 500));
```
Es fehlt die Sortierung nach `created_at`.

## Änderung
Nur eine Stelle, rein im Frontend-Hook:

1. Realtime-Insert in `useOcppLogs.tsx`:
   - Neue Einträge in die Liste einfügen und anschließend **absteigend nach `created_at` sortieren**, dann auf 500 begrenzen.
   - Duplikate per `id` vermeiden (falls Initial-Fetch und Realtime-Event denselben Eintrag liefern).

Pseudocode:
```
setLogs((prev) => {
  if (prev.some((l) => l.id === entry.id)) return prev;
  return [entry, ...prev]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 500);
});
```

Keine Backend-, RLS- oder UI-Änderungen nötig.

## Verifikation
- Ladevorgang per Fernbefehl starten → `RemoteStartTransaction`, `Authorize`, `StatusNotification`, `MeterValues` müssen sofort in korrekter Zeitstempel-Reihenfolge erscheinen, ohne dass das Log-Fenster neu geöffnet werden muss.
