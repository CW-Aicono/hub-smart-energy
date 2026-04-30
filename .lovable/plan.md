## Umsetzung Punkt 1 + 2 (ohne Hetzner-Patch)

### 1. Neuer Helper in `src/lib/formatCharging.ts`

```ts
export function normalizeConnectorStatus(
  raw: string | null | undefined,
  wsConnected: boolean = true,
): string {
  if (wsConnected === false) return "offline";
  return (raw ?? "").toLowerCase();
}
```

### 2. Helper an allen UI-Lookup-Stellen anwenden

| Datei | Zeile(n) | Was passiert |
|---|---|---|
| `src/components/charging/ConnectorStatusGrid.tsx` | 79 | `effectiveStatus = normalizeConnectorStatus(c.status, wsConnected)` |
| `src/components/charging/ChargePointDetailDialog.tsx` | 160 | `statusConfig[normalizeConnectorStatus(cp.status)]` |
| `src/components/charging/ChargePointsMap.tsx` | 216-223 | `const s = normalizeConnectorStatus(cp.status)` und alle Lookups (`statusKey`, `cfgVariant`, `statusColors`) auf `s` umstellen |
| `src/components/charging/ChargingOverviewStats.tsx` | 36, 71-73 | Vergleiche gegen normalisierten Status (`normalizeConnectorStatus(cp.status) === "available"` etc.) |
| `src/pages/ChargingPoints.tsx` | 143, 366, 427 | Filter & Lookups gegen `normalizeConnectorStatus(cp.status)` (Filter-Key bleibt lowercase wie in `statusConfig`) |

### Was sich **nicht** ändert
- `statusConfig`-Keys bleiben lowercase (sind sie bereits).
- `statusFilter`-State bleibt lowercase.
- DB wird nicht angefasst, kein Hetzner-Eingriff.
- Punkt 3 (Server-Patch) wird **nicht** umgesetzt.

### Erwartetes Ergebnis
Sobald die nächste Realtime-Update für „Compleo Rechts" reinkommt, springt der Status von „Offline" auf „Verfügbar" — und alle weiteren Wallboxen mit Großschreibung im DB-Status werden ebenfalls korrekt angezeigt.

Bitte freigeben, dann setze ich es direkt um.
