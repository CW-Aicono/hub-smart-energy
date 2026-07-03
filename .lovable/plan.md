
## Ziel

Zwei separate Baustellen, beide **erst diagnostizieren, dann fixen**:

1. **Preview lädt im Lovable-Iframe nicht** — tritt laut dir nur in diesem Projekt auf, also liegt es *irgendwo* im App-Code oder in einer Init-Kette, nicht am Lovable-Editor. Ursache ist noch unbekannt und ich will nichts raten (Core-Regel).
2. **Erst-Load des Dashboards ist langsam**, besonders Live-Leistung/Gauges. Auch hier: erst messen, dann handeln.

Es werden in diesem Schritt **keine Optimierungen** an Widgets, Queries, Bundles oder Realtime vorgenommen — nur Diagnose-Instrumentierung, die nach Auswertung wieder rausgeht.

---

## Was ich schon weiß (ohne raten)

- Vite-Dev-Server läuft sauber, keine HMR-/Compile-Fehler in den letzten Stunden.
- Es gibt **keinen `serviceWorker.register(...)`** in `src/main.tsx` oder `index.html`. `useUpdateCheck.tsx` liest nur `navigator.serviceWorker.ready` und `.controller`, registriert selbst nichts. Ein Service Worker, der die Preview kapert, ist damit **unwahrscheinlich, aber nicht ausgeschlossen** (Manifeste unter `/public/manifest-*.json` und `icon-*.png` existieren — reine Metadaten, keine SW-Datei).
- Es gibt viele parallele Provider (`AuthProvider`, `DashboardFilterProvider`, `useDashboardPrefetch` mit `useMeters/useLocations/useEnergyData/useAlertRules/useEnergyPrices` + Realtime-Invalidation) — plausibler Kandidat für langen TTFB des Dashboards, aber ohne Messung nur Vermutung.

---

## Vorgehen

### Teil A — Preview-Loader-Diagnose

A1. **Repo-Scan (statisch, keine Codeänderung)**
- Prüfen, ob irgendein Provider im Render-Pfad synchron blockiert (Endlos-Loop, `while` in Effect, throw in Provider ohne Boundary).
- Prüfen, ob eine der `manifest-*.json` mit `display: standalone` + `start_url` einen SW impliziert und ob irgendwo doch `register(...)` steht (auch in Sub-Apps `ChargingApp`, `TenantEnergyApp`, Board/Sales/Sharing-Hosts).
- Prüfen, ob `ChunkErrorBoundary` / `UpdateBanner` beim ersten Load in eine Reload-Schleife läuft.

A2. **Iframe-Diagnose-Log (temporär)**
- In `src/main.tsx` einmalige, mit `console.info("[preview-probe] …")`-Marken versehene Zeitstempel für: `boot`, `providers-mounted`, `first-route-rendered`, `first-query-settled`. Nur Konsolen-Ausgabe, kein UI, kein Netzwerk.
- Zusätzlich einmaliger Check: läuft die App in einem Iframe, ist ein SW registriert, welche Origin? → nur Log, keine Aktion.
- Grund: Beim nächsten Auftreten sehen wir sofort in den Konsolen-Logs (die Lovable mir mit der nächsten Nachricht durchreicht), *wo genau* die Kette hängt.

A3. **Kill-Switch bereitlegen (nicht scharf)**
- Skill „pwa/existing-broken-PWA" beschreibt einen Kill-Switch-SW. Wird **nur** gebaut, falls A1/A2 einen SW oder cached HTML als Ursache identifiziert. Vorher nicht.

### Teil B — Performance-Messung Dashboard/Live

B1. **React-Query-Devtools-Panel** (nur Dev, nur wenn nicht schon aktiv) — zeigt Query-Anzahl, Zeitpunkte, Cache-Treffer/Miss. Read-only.

B2. **Perf-Marker in `useDashboardPrefetch`** — pro Sub-Hook (`useMeters`, `useLocations`, `useEnergyData`, `useAlertRules`, `useEnergyPrices`) Start/Ende + Dauer via `performance.mark/measure`, ausgegeben als kompakte Tabelle in der Konsole nach dem ersten Settle.

B3. **Perf-Marker im Live-Werte-Pfad** (`src/pages/LiveValues.tsx` + zugehörige Realtime-Subscriptions) — Zeit bis erste Anzeige, Zeit bis erste Reconcile-Iteration, Anzahl Rerenders pro Minute.

B4. **Netzwerk-Snapshot beim Erst-Load** — kein Code, sondern eine kurze Anleitung, wie ich beim nächsten Turn deine `network_requests` / `console_logs` auswerte (Wasserfall, Anzahl paralleler Supabase-Calls, langsamste Edge-Function).

### Teil C — Abschluss (späterer Turn, nicht jetzt)

Nach der Messung: kurzer Auswertungs-Report + gezielte Fix-Vorschläge (z. B. Prefetch-Reihenfolge, `staleTime`, Query-Bündelung, Realtime-Debounce). **Fix-Turn erst nach deiner Freigabe.** Alle in A2/B1–B3 hinzugefügten Diagnose-Zeilen werden nach Abschluss wieder entfernt.

---

## Was **nicht** passiert

- Kein Ändern von Widget-Komponenten, Recharts-Configs, Sankey-Daten, Karten-Init.
- Kein Anfassen von Realtime-Subscribes / Invalidation-Logik.
- Kein Instance-Upgrade-Vorschlag (verboten laut Core-Regel, bevor Playbook durch ist).
- Keine SW-Registrierung, kein Cache-Clearing im Blindflug.

---

## Technische Details

Hinzuzufügende Dateien (nur temporär, klar markiert `// PERF-PROBE – remove after diagnosis`):

- `src/lib/perfProbe.ts` — kleine Helferbibliothek (mark/measure/log-tabelle).
- Punktueller Import in `src/main.tsx`, `src/hooks/useDashboardPrefetch.tsx`, `src/pages/LiveValues.tsx`.
- React-Query-Devtools nur unter `import.meta.env.DEV`.

Keine Migrations, keine Edge-Function-Änderungen, keine Style-Änderungen.

---

## Ergebnis dieses Turns

Nach Umsetzung: du reloadest die Preview einmal (ggf. wieder mit Re-Login), machst danach einen weiteren Reload auf `/` und schickst mir kurz „gemessen" — ich lese Konsole + Netzwerk aus und schlage im nächsten Turn die tatsächlich zutreffenden Fixes vor.
