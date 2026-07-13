## Ziel
Loxone-Live-Werte (sub-sekündlich) im Flow-Widget ankommen lassen, indem der Frontend-Live-Pfad dieselbe UUID→Meter-Auflösung nutzt wie der `bridge-aggregator`.

## Ursache (bestätigt)
- `meters.sensor_uuid` speichert die **Basis-Objekt-UUID** (Suffix = Miniserver-MAC, z. B. `…-ffffed57184a04d2`).
- Der Loxone-WS-Worker emittiert die **State-/Sub-Output-UUIDs** desselben Objekts (gleiche ersten beiden Segmente, andere 3./4./5. Gruppe).
- `EnergyFlowMonitor` mappt Broadcast/Seed derzeit per exaktem `sensor_uuid`-Match → schlägt fehl → Fallback auf die 5-min-Werte aus `meter_power_readings`.
- Der `bridge-aggregator` löst das serverseitig via *Family-Key* (erste 2 UUID-Segmente + tenant) + *Third-Segment-Nearest-Match* (Delta ≤ 32, Plausibilitätsfilter ≤ 500 kW, `energy_type = 'strom'`) auf. Genau diese Logik fehlt im Frontend.

## Umsetzung
Nur Frontend-Änderungen, keine Migration, kein Edge-Function-Deploy.

**1. Neuer Helper `src/lib/loxoneUuidResolver.ts`**
Portiert `loxoneFamilyKey`, `loxoneThirdSegment`, `isPlausibleElectricalPowerKw` und `resolveMeterForRawSample` aus `supabase/functions/bridge-aggregator/index.ts`. Exponiert:
- `buildLoxoneResolver(meters)` → liefert `{ exactByUuid, byTenantFamily, resolve(uuid, tenantId, value) }`.

**2. `src/components/dashboard/EnergyFlowMonitor.tsx`**
- Statt der aktuellen `uuidToMeterId`-Map einen `resolver = useMemo(() => buildLoxoneResolver(relevantMeters), [relevantMeters])` verwenden.
- Broadcast-Handler (`.on("broadcast", { event: "readings" })`): für jedes Event `resolver.resolve(ev.uuid, tenantIdOfChannel, ev.value)` aufrufen; nur bei Treffer `broadcastByMeter[meterId]` setzen. Für `role === "soc"` weiterhin exact-Match (SOC hat eigene UUID-Familie, kein Nearest-Match sinnvoll).
- `bridge_raw_samples`-Seed-Query: statt `.in("uuid", uuids)` per Family-Prefix laden (`or(family1.*, family2.*, …)` mittels `ilike` auf die ersten beiden UUID-Segmente) und die Rückgabe clientseitig durch `resolver.resolve` schicken. Dabei pro Meter nur den zeitlich neuesten Wert übernehmen.
- Der `uuids`-Ableitung nichts wegwerfen — nur die Auflösung ändert sich.

**3. Analoge Nachziehung (nur wenn simple Ersetzung reicht) in:**
- `src/pages/LiveValues.tsx` (gleicher Broadcast-Kanal)
- `src/components/charging/DynamicDlmCard.tsx` (gleicher Broadcast-Kanal)

Beide bekommen den `resolver` über denselben Helper. Kein Verhaltenswechsel für Nicht-Loxone-Meter (dort greift `exactByUuid` weiterhin sofort).

## Verifikation
- Nach Deploy in Browser-Devtools prüfen, dass im Broadcast-Handler `resolver.resolve` für die fünf Widget-Meter Treffer liefert (temporäres `console.debug`, danach wieder entfernen).
- Widget-Werte müssen sich bei sichtbaren Loxone-Änderungen im Sekundentakt bewegen (statt alle 5 min in Sprüngen).
- `meter_power_readings`-Seed bleibt als Fallback aktiv; keine Regression bei nicht-Loxone-Zählern (Shelly/HA/Gateway) — dort weiterhin exact-UUID-Match.

## Nicht Teil dieser Änderung
- Kein Schema-Change, keine Migration von `meters.sensor_uuid`.
- Kein Umbau des `bridge-aggregator` (Server-Seite bleibt unverändert – Frontend zieht nur nach).
- Keine neue RPC/Edge-Function.
