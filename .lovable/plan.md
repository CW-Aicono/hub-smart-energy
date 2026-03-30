

## Fix: Eigenständigen Leistungssensor auch bei vorhandenem Relay erzeugen

### Problem
Zeile 146 in `shelly-api/index.ts`:
```typescript
if (Array.isArray(deviceStatus.meters) && !Array.isArray(deviceStatus.relays)) {
```
Diese Bedingung verhindert, dass ein separater Leistungssensor erstellt wird, wenn das Gerät auch Relays hat (wie der Plug S). Die Leistung wird nur als Sekundärwert am Schalter-Sensor angezeigt, kann aber nicht als eigenständige Messstelle zugeordnet werden.

### Lösung

**Datei: `supabase/functions/shelly-api/index.ts`**

Die Bedingung in Zeile 146 ändern: `meters[]` **immer** als eigenständige Leistungssensoren anlegen, auch wenn `relays[]` vorhanden ist. Die Leistung bleibt zusätzlich als Sekundärwert am Schalter erhalten.

```typescript
// Vorher:
if (Array.isArray(deviceStatus.meters) && !Array.isArray(deviceStatus.relays)) {

// Nachher:
if (Array.isArray(deviceStatus.meters)) {
```

Das erzeugt für den Plug S (5a86e3) einen zusätzlichen Sensor "Plug S Office Leistung 0" mit Typ `power` und Einheit `W`.

