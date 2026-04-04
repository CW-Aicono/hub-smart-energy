

## Analyse

**Ursache der 2-Stunden-Abweichung:**
Das Gateway sendet seine lokale Zeit als `new Date().toISOString()` (in `docs/ha-addon/index.ts`, Zeile 921). Die JavaScript-Methode `.toISOString()` gibt **immer UTC** zurück – erkennbar am Suffix **"Z"** (= "Zulu" = UTC+0). Da Deutschland aktuell in MESZ (Mitteleuropäische Sommerzeit = UTC+2) ist, ergibt sich exakt die beobachtete 2-Stunden-Differenz.

**Was bedeutet "835Z"?**
- `.835` = Millisekunden (835 ms)
- `Z` = "Zulu Time" = UTC-Zeitzone (ISO 8601 Standard)

## Fix-Plan

### 1. Frontend: Gateway-Zeit korrekt formatieren (IntegrationCard.tsx)

Die rohe ISO-UTC-Zeichenkette wird aktuell direkt angezeigt. Stattdessen wird sie als `Date`-Objekt geparst und in der lokalen Zeitzone (Europe/Berlin) formatiert:

```typescript
// Statt: Gateway-Zeit: {gatewayLocalTime}
// Neu:   Gateway-Zeit: 04.04.2026, 17:01:15
const formattedTime = new Date(gatewayLocalTime).toLocaleString("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
```

### 2. Optional – Gateway-Seite (docs/ha-addon/index.ts)

Alternativ oder zusätzlich könnte das Gateway bereits die lokale Zeit senden (z.B. mit `Intl.DateTimeFormat`). Da aber das Gateway auf einem Raspberry Pi die Systemzeitzone nicht zuverlässig konfiguriert haben muss, ist die **Frontend-Konvertierung der sicherere Ansatz** – das Gateway sendet weiterhin UTC (korrekt und eindeutig), und das Frontend zeigt es in der gewünschten Zeitzone an.

### Betroffene Dateien
- `src/components/integrations/IntegrationCard.tsx` – Formatierung der `gatewayLocalTime`-Anzeige von roh-ISO auf `de-DE`-Format in Zeitzone Europe/Berlin

