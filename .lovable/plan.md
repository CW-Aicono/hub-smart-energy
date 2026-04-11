

# Unnötiges Neuladen beim Tab-Wechsel unterbinden

## Ursache

Der `QueryClient` in `App.tsx` wird ohne Konfiguration erstellt (`new QueryClient()`). Die Standard-Einstellung von React Query ist `refetchOnWindowFocus: true` — das bedeutet, **jede aktive Query wird automatisch neu geladen**, sobald der Browser-Tab wieder fokussiert wird.

Da die Anwendung dutzende aktive Queries hat (Meter, Locations, Energiedaten, Alerts, Preise, Tenant-Daten, etc.), werden beim Tab-Wechsel gleichzeitig viele API-Aufrufe ausgelöst. Das erzeugt unnötigen Traffic und führt zu sichtbaren Re-Renders, die wie ein komplettes Neuladen wirken.

## Lösung

In `src/App.tsx` den `QueryClient` mit `refetchOnWindowFocus: false` konfigurieren und stattdessen eine sinnvolle `staleTime` setzen, damit Daten nicht bei jedem Mount sofort als veraltet gelten:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 Minuten
    },
  },
});
```

### Betroffene Datei
- `src/App.tsx` (eine Zeile ändern)

### Ergebnis
- Kein automatisches Neuladen aller Daten beim Tab-Wechsel
- Daten werden erst nach 5 Minuten als veraltet betrachtet
- Gezielte Refetches (z. B. nach Mutationen via `invalidateQueries`) funktionieren weiterhin normal
- Deutlich weniger Traffic und schnelleres Gefühl beim Zurückwechseln

