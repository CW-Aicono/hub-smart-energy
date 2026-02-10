
## Fix: Loxone Meter-Werte korrekt abrufen

### Problem
Alle Werte des Zählers "Außenbereich" kommen als `null` zurück, obwohl die Loxone Config eindeutig Werte zeigt (Pf=10,200kW, Mr=13051,8kWh, Rd=43,1kWh etc.).

### Ursache
Die Funktion `fetchStateValue` in der Edge Function nutzt den falschen REST-API-Endpunkt:
- **Aktuell (falsch):** `/jdev/sps/io/{uuid}/state`
- **Korrekt:** `/jdev/sps/io/{uuid}`

Die Loxone REST API kennt keinen `/state`-Suffix. Zudem werden HTTP-Fehler und Parse-Fehler komplett verschluckt, was das Debugging unmöglich macht.

### Loesung

**Datei: `supabase/functions/loxone-api/index.ts`**

1. **Endpunkt korrigieren:** `/jdev/sps/io/{stateUuid}/state` aendern zu `/jdev/sps/io/${stateUuid}`
2. **Fehler-Logging hinzufuegen:** Bei fehlgeschlagenen Requests den HTTP-Status und die Antwort loggen, statt still `null` zurueckzugeben
3. **Response-Parsing erweitern:** Neben `data.LL.value` auch alternative Antwortformate beruecksichtigen (z.B. numerische Werte direkt)

### Technische Details

Aenderung in `fetchStateValue` (Zeilen 117-137):

```typescript
async function fetchStateValue(
  baseUrl: string,
  authHeader: string,
  stateUuid: string
): Promise<number | string | null> {
  try {
    const url = `${baseUrl}/jdev/sps/io/${stateUuid}`;  // ohne /state
    const response = await fetch(url, { method: "GET", headers: { Authorization: authHeader } });
    if (!response.ok) {
      console.warn(`State fetch failed for ${stateUuid}: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (data?.LL?.value !== undefined) {
      const val = data.LL.value;
      const numVal = parseFloat(val);
      return isNaN(numVal) ? val : numVal;
    }
    console.warn(`No LL.value in response for ${stateUuid}:`, JSON.stringify(data));
    return null;
  } catch (err) {
    console.error(`Error fetching state ${stateUuid}:`, err);
    return null;
  }
}
```

### Erwartetes Ergebnis
Nach dem Fix sollten die Werte des "Außenbereich"-Zählers korrekt zurueckkommen:
- actual (Pf): 10,200 kW
- total (Mr): 13051,8 kWh  
- totalDay (Rd): 43,1 kWh
- totalMonth (Rm): 718,5 kWh
- totalYear (Ry): 2723,7 kWh
