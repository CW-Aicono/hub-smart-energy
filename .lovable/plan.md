## Hintergrund: Was bedeutet "Failed to fetch"?

Das ist die Standard-Browsermeldung, wenn ein `fetch()`-Aufruf die Gegenstelle gar nicht erreicht — die Antwort kommt also nie an. Typische Ursachen in diesem Projekt:

1. **Kurzer Netzwerkabriss / WLAN-Wechsel / Laptop aus dem Standby** (häufigste Ursache, harmlos)
2. **Backend kurzzeitig überlastet oder im Neustart** (Verbindungslimit erreicht → Anfrage wird abgewiesen, bevor eine HTTP-Antwort entsteht)
3. **Edge Function schlägt beim Start fehl** (Boot-Error → kein CORS-Header → Browser meldet nur "Failed to fetch")
4. **Neues Deployment während der Sitzung**: alte Chunk-Dateien existieren nicht mehr (dafür gibt es bereits die `ChunkErrorBoundary` mit Auto-Reload)
5. **Browser-Tab lange im Hintergrund**: abgelaufenes Auth-Token, Refresh-Request läuft ins Leere

Wichtig: Es ist **kein** Programmfehler in einer bestimmten Seite — es ist ein Transportproblem. Deshalb ist ein Retry sinnvoll: derselbe Aufruf funktioniert meist beim zweiten Versuch.

## Macht ein Reload-Button Sinn?

Ja, aber gestuft — ein voller Seiten-Reload ist die Holzhammer-Methode und wirft ungespeicherte Eingaben weg:

- **Primär: „Erneut versuchen"** — lädt nur die fehlgeschlagene Abfrage neu (kein Seitenwechsel, kein Datenverlust).
- **Sekundär: „Seite neu laden"** — nur anbieten, wenn der Retry ebenfalls scheitert.

## Umsetzung

### 1. Fehler-Übersetzer (neu: `src/lib/errorMessages.ts`)
Eine Funktion `describeError(error)`, die technische Fehler auf verständliche Kategorien mappt:

| Erkennungsmuster | Anzeige (DE) |
|---|---|
| `Failed to fetch`, `NetworkError`, `Load failed` | „Keine Verbindung zum Server. Bitte Internetverbindung prüfen." |
| `408`, `timeout`, `IDLE_TIMEOUT` | „Die Anfrage hat zu lange gedauert." |
| `503`, `BOOT_ERROR`, `temporarily unavailable` | „Der Dienst ist gerade kurzzeitig nicht erreichbar." |
| `401`, `JWT expired` | „Die Sitzung ist abgelaufen. Bitte neu anmelden." |
| `permission denied`, `RLS` | „Keine Berechtigung für diese Daten." |
| Sonst | „Ein unerwarteter Fehler ist aufgetreten." |

Zurückgegeben werden Titel, Beschreibung, ein Fehler-Kürzel (z. B. `NET-01`) für den Support und ein Flag `retryable`.

### 2. Übersetzungen
Neue Schlüssel `error.network.*`, `error.timeout.*`, `error.unavailable.*`, `error.session.*`, `error.permission.*`, `error.unknown.*` in `src/i18n/translations.ts` für DE, EN, ES, NL. `describeError` nutzt `getT()`, funktioniert also auch außerhalb von React-Komponenten und respektiert die eingestellte Sprache.

### 3. `QueryErrorState` erweitern
Die bestehende Komponente (`src/components/common/QueryErrorState.tsx`) bekommt:
- optionales `error`-Prop → Titel/Text kommen automatisch aus `describeError`
- Button „Erneut versuchen" (bestehend) plus, nach dem zweiten Fehlschlag, „Seite neu laden"
- kleines Fehler-Kürzel in grauer Schrift unten (für Support-Anfragen)
- Offline-Hinweis, wenn `navigator.onLine === false`

### 4. Globaler Netzwerk-Hinweis
Ein schlanker Listener auf `online`/`offline` zeigt einen dezenten Banner „Keine Internetverbindung" und blendet ihn bei Rückkehr automatisch aus; bei Rückkehr werden aktive Abfragen automatisch erneut geladen.

### 5. Toasts vereinheitlichen
`toast({ variant: "destructive", ... })`-Aufrufe, die heute rohe Fehlertexte zeigen, werden auf `describeError` umgestellt — beginnend mit den häufigsten Stellen (Dashboard-Hooks, Edge-Function-Aufrufe über `invokeWithRetry`).

### Technische Details
- `src/lib/errorMessages.ts` — Mapping + `getT()`-Anbindung, keine React-Abhängigkeit
- `src/components/common/QueryErrorState.tsx` — Props `error`, `attemptCount`, Reload-Fallback
- `src/i18n/translations.ts` — ~18 neue Schlüssel in 4 Sprachen
- Optional: `invokeWithRetry` gibt bereits bei transienten Fehlern automatisch drei Versuche ab — das bleibt unverändert und greift vor der Anzeige
