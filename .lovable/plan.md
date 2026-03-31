

# Fix: Shelly-Sensoren mit Cloud-Bezeichnungen statt Geräte-IDs

## Problem

Die Shelly-Sensoren werden mit der MAC-Adresse/Geräte-ID benannt (z. B. "3ce90e6f3b04 Leistung"), obwohl der Code bereits versucht, Namen aus `/device/all` zu laden. Wahrscheinliche Ursache: Die Device-IDs aus `/device/all_status` (Keys) stimmen formatmäßig nicht mit den IDs aus `/device/all` überein (z. B. unterschiedliche Groß-/Kleinschreibung, mit/ohne Doppelpunkte). Zusätzlich kann die `/device/all`-Anfrage durch Rate Limiting (HTTP 429) fehlschlagen.

## Lösung

### 1. Edge Function `shelly-api/index.ts` anpassen

**ID-Normalisierung**: Beide Seiten (deviceNameMap-Key und Lookup-Key) auf lowercase trimmen, um Format-Mismatches abzufangen.

```typescript
// Beim Aufbau der Map:
deviceNameMap.set(String(id).toLowerCase().trim(), String(name));

// Beim Lookup:
const deviceName = deviceNameMap.get(deviceId.toLowerCase().trim()) 
  || deviceStatus?._dev_info?.name 
  || deviceId;
```

**Debug-Logging**: Temporäres `console.log` für die IDs beider Endpoints, um den genauen Mismatch zu identifizieren.

**Fallback-Verbesserung**: Falls `/device/all` mit 429 fehlschlägt, den Fehler loggen statt still zu ignorieren.

### 2. Kanal-Bezeichnungen

Shelly Cloud vergibt pro Gerät einen Namen (z. B. "Kalander groß"), nicht pro Kanal. Bei Mehrkanalgeräten wird aktuell " Kanal 0" angehängt. Für Einzelkanalgeräte (Plug S etc.) wird der Suffix entfernt, sodass nur "Kalander groß" angezeigt wird. Bei Mehrkanal bleibt "Kalander groß Kanal 0".

### Betroffene Datei
- `supabase/functions/shelly-api/index.ts` (ID-Normalisierung + Logging + Einzelkanal-Suffix-Entfernung)

