

## Ziel
Preview und Live (`staging.aicono.org`) wieder mit Inhalten ausliefern und sicherstellen, dass dieser Zustand nicht erneut entsteht.

## Was ist die echte Ursache
1. Die aktuell veröffentlichte `index.html` auf `hub-smart-energy.lovable.app` und `staging.aicono.org` enthält nur noch `<body><div id="root"></div></body>` — kein `<head>`, kein `<script type="module" src="/src/main.tsx">`. Damit lädt der Browser keinerlei JavaScript, also bleibt die Seite leer. Das ist kein Runtime-, sondern ein Auslieferungsproblem.
2. Der Quellcode in `index.html` ist mittlerweile korrekt (Script-Tag, Meta-Tags, kein CSP-Platzhalter mehr). Das wurde aber nie nach Live deployed, weil
3. der aktuelle Publish-Vorgang im Lovable-Dialog mit „Publishing failed“ (Cloudflare R2 `StatusCode 429 – Reduce your concurrent request rate for the same object`) abbricht. Solange dieser Fehler besteht, bleibt der alte, kaputte Build live.
4. Zusätzlich ist die App nicht „fail-loud“: Wenn Supabase-Env-Variablen oder das Script fehlen, sieht der Nutzer nur eine weiße Seite statt eines klaren Fehlerhinweises.

## Plan zum Fix

### Schritt 1 – Deployment durchbringen (Hauptproblem)
- Den R2-429-Fehler abwarten/umgehen, indem wir bewusst nicht in schneller Folge erneut publishen, sondern
  - eine kleine, garantiert build-relevante Änderung an `index.html` machen (Cache-Buster), damit ein neuer eindeutiger Build erzwungen wird,
  - dann genau einen einzigen Publish-Vorgang anstoßen,
  - das Ergebnis via Live-URL verifizieren (`curl` auf `https://hub-smart-energy.lovable.app` und `https://staging.aicono.org`).
- Falls R2 weiterhin 429 zurückgibt, sauber 5–10 Minuten warten und nur einen einzigen weiteren Publish anstoßen, statt mehrfach hintereinander zu klicken (jeder Klick verschärft den 429-Status auf demselben Objektschlüssel).

### Schritt 2 – `index.html` „blank-safe“ machen
- Das `<script type="module" src="/src/main.tsx">` bleibt zwingend.
- Zusätzlich ein Fallback-Markup im `<div id="root">` einfügen, das einen klaren Hinweis zeigt, falls der Bundler/JS nicht lädt:
  - Mini-Loader plus Text „Anwendung lädt … bitte aktualisieren, falls dies länger als ein paar Sekunden dauert.“
  - Zusätzlich `<noscript>`-Block mit Hinweis, dass JavaScript erforderlich ist.
- Damit sieht der Nutzer in zukünftigen Fehlerfällen nie wieder eine komplett weiße Seite.

### Schritt 3 – App-Initialisierung absichern
- `src/main.tsx` so umbauen, dass:
  - vor `createRoot(...)` geprüft wird, ob `import.meta.env.VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` gesetzt sind,
  - bei fehlenden Variablen statt einer Fehler-Exception eine sichtbare Fehlerseite gerendert wird (klar formulierter deutscher Hinweis, kein Stacktrace),
  - alle `createRoot`/`App`-Aufrufe in einen `try/catch` liegen, der in einen einfachen DOM-Fallback rendert.
- `src/integrations/supabase/client.ts` bleibt unverändert (auto-generated). Die zusätzliche Validierung passiert ausschließlich in `main.tsx`, damit die generierte Datei nicht angefasst werden muss.

### Schritt 4 – Verifikation nach Deployment
- Erst per `curl` prüfen, dass der gelieferte HTML-Body wieder das `<script type="module" ...>` enthält (Beweis, dass der neue Build live ist).
- Danach Preview-URL `https://preview--hub-smart-energy.lovable.app` und Live-URL `https://staging.aicono.org` jeweils einmal frisch im Browser aufrufen.
- Erwartung:
  - Sichtbares Login bzw. Dashboard, kein Blank,
  - in der Konsole keine `supabaseUrl is required`-Meldung mehr.

## Technische Details
- Betroffene Dateien:
  - `index.html` (Cache-Buster-Kommentar, `<noscript>`-Fallback, Pre-Boot-Loader im `#root`)
  - `src/main.tsx` (Env-Variablen-Check, sichtbarer Fehler statt weißer Seite)
- Nicht angefasst:
  - `src/integrations/supabase/client.ts` (auto-generated)
  - `vite.config.ts` (kein Build-Pipeline-Eingriff nötig)
  - Edge Functions (deren letzter Deploy-Versuch hat zwar Type-Bereinigungen mitgebracht, ist für das Blank-Page-Problem aber nicht ursächlich)
- Cloudflare-R2-429 ist ein temporärer Hosting-Effekt; der Fix wirkt durch genau einen sauberen, neuen Publish-Vorgang nach den Code-Änderungen. Weitere parallele Publish-Klicks würden den 429 nur verlängern.

## Erwartetes Ergebnis
- Live und Staging zeigen wieder Inhalte.
- Falls in Zukunft Build- oder Env-Probleme auftreten, sieht der Nutzer eine deutsche Fehlermeldung statt einer weißen Seite.
- Der Fix ist klein, gezielt und ohne Architekturänderung.

