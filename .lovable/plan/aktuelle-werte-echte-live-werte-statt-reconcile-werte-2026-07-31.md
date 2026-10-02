# Aktuelle Werte: echte Live-Werte statt Reconcile-Werte

## Befund (im Code verifiziert)

Der Dashboard-Energiemonitor und die Seite „Aktuelle Werte" hören auf denselben Broadcast-Kanal `loxone-live-<tenant>`, verarbeiten die Events aber unterschiedlich:

- `src/components/dashboard/EnergyFlowMonitor.tsx` (Zeile 577) löst die UUID über `buildLoxoneResolver` auf (`src/lib/loxoneUuidResolver.ts`): Exact-Match, sonst Family-Key + nächstes 3. UUID-Segment. Der Worker sendet **State-UUIDs**, `meters.sensor_uuid` enthält die **Block-UUID** — genau diese Lücke schließt der Resolver. Deshalb funktionieren dort die Live-Werte.
- `src/pages/LiveValues.tsx` (Zeile 491–494, 537) nutzt ausschließlich eine exakte `sensor_uuid`-Map. Jede State-UUID fällt durch und wird als „unmatched" verworfen; angezeigt wird dann nur der Wert aus dem 60-Sekunden-DB-Reconcile.
- Zusätzlich meldet die Konsole für den Kanal auf `/live-values` `status: TIMED_OUT` und danach `CLOSED`. Der Effekt hängt an `[meters.length]` und baut die Subscription bei jeder Änderung neu auf; nach einem `TIMED_OUT` gibt es keinen erneuten Verbindungsversuch — der Kanal bleibt dann dauerhaft tot.

## Umsetzung

### 1. Gemeinsamer Live-Broadcast-Hook
Neuer Hook `src/hooks/useLoxoneLiveBroadcast.ts`, der die heute doppelt vorhandene Logik bündelt:
- Aufbau des Resolvers aus den übergebenen Zählern (`buildLoxoneResolver`).
- Abo je Tenant auf `loxone-live-<tenant>`, Coalescing der Events (1,5 s), kein Rendern im Hintergrund-Tab.
- **Resubscribe-Logik:** bei `TIMED_OUT`/`CHANNEL_ERROR`/`CLOSED` (ohne Unmount) automatischer Neuaufbau mit Backoff (2 s, 4 s, 8 s, max. 30 s).
- Stabile Abhängigkeiten (Tenant-Liste + UUID-Signatur), damit ein Re-Render der Zählerliste die Subscription nicht mehr abreißen lässt.
- Rückgabe: Werte je Meter-ID inkl. Rolle (`pwr`, `today`, `month`, `year`, `total`, `soc`) und Zeitstempel des letzten Events.

### 2. LiveValues auf den Hook umstellen
- Exakte UUID-Map in `LiveValues.tsx` durch den Hook ersetzen; die Broadcast-Werte überschreiben die DB-Werte pro Zähler.
- Der DB-Reconcile bleibt als Sicherheitsnetz (60 s, nur bei sichtbarem Tab) und wird von neueren Broadcast-Werten nicht mehr überschrieben (Vergleich über Zeitstempel).

### 3. EnergyFlowMonitor auf denselben Hook umstellen
Gleiches Verhalten wie heute, nur ohne Duplikat — damit beide Ansichten künftig garantiert dieselbe Quelle nutzen.

### 4. Ehrliches Live-Badge (sekundär, aber Teil des Fixes)
Das Badge in der Zählerkachel richtet sich nach dem Alter des jüngsten Wertes:
- < 60 s → grünes „Live"
- 1–15 Min → neutrales Badge „vor X Min"
- älter → graues Badge mit Uhrzeit

Damit ist auch bei Zählern, die weiterhin nur über den 15-Minuten-Pull kommen, sofort sichtbar, wie alt der Wert ist.

## Verifikation

- Auf `/live-values` prüfen, dass der Kanal `SUBSCRIBED` meldet und die „Erzeugung" sich alle paar Sekunden ändert.
- Vergleich des Wertes mit dem Energiemonitor-Widget: beide müssen identisch sein.
- Zähler ohne WS-Mapping zeigen ein Alters-Badge statt „Live".

## Technische Details

Geänderte Dateien: neu `src/hooks/useLoxoneLiveBroadcast.ts`; angepasst `src/pages/LiveValues.tsx`, `src/components/dashboard/EnergyFlowMonitor.tsx` und die Zählerkachel-Badge-Logik. Keine Datenbank-, Worker- oder Edge-Function-Änderung; keine zusätzliche Schreiblast.
