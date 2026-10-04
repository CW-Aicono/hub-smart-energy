# Sichtbare App-Version und zuverlässige Aktualisierung

## Ziel
- Jeder sieht, welche Version gerade im Browser läuft.
- Nach einem Deploy bleibt niemand auf einem alten Stand hängen, auch nicht beim Menüwechsel.
- Gibt es eine neue Version, erscheint ein Hinweis mit „Jetzt neu laden“.

## Was der Nutzer sieht
1. **Versionsanzeige** unten im Benutzermenü der Seitenleiste und auf der Profilseite, z. B. `v2026.10.04 · 1c8ec07 · 04.10.2026 18:30`. Ein Klick kopiert die Angabe, damit sie in Support-Anfragen genannt werden kann.
2. **Hinweis-Banner** oben: „Neue Version verfügbar – Jetzt neu laden“. Erscheint, wenn der Server eine neuere Version hat. Geprüft wird alle 5 Minuten, wenn der Tab wieder sichtbar wird und bei jedem Menüwechsel (höchstens einmal pro Minute).
3. **Automatischer Schutz beim Menüwechsel:** Fehlt eine Seite, weil sie nach einem Deploy umbenannt wurde, lädt die App einmalig selbst neu statt hängen zu bleiben. Eine Sperre verhindert Endlos-Neuladen.

## Ursachen, die behoben werden
- Der Webserver schickt den Schutz „nicht zwischenspeichern“ nur für `/index.html`. Direkte Aufrufe wie `/` oder `/super-admin` bekommen dieselbe Seite **ohne** diesen Schutz und können vom Browser alt gehalten werden.
- Die Regel „1 Jahr zwischenspeichern“ greift auch für Dateien ohne festen Namens-Fingerabdruck (z. B. `sw.js`, `manifest*.json`-nahe Dateien, Icons).
- Die bestehende Update-Prüfung stützt sich nur auf den Service Worker, der aktuell bewusst abgeschaltet ist. Dadurch wird ein neues Deploy nie erkannt.

## Technische Details
- **Build:** kleines Vite-Plugin erzeugt `dist/version.json` (`version`, `commit`, `builtAt`) und stellt dieselben Werte als `import.meta.env.VITE_APP_VERSION/COMMIT/BUILT_AT` bereit. Commit kommt aus `GITHUB_SHA` (Workflow-Build-Arg im `Dockerfile` und `deploy-prod.yml` ergänzen), Fallback `git rev-parse --short HEAD`, sonst `dev`.
- **nginx.conf:**
  - `location /` mit `try_files` bekommt `Cache-Control: no-cache, no-store, must-revalidate` (gilt damit für jeden SPA-Fallback).
  - Eigene Regeln mit `no-store` für `/version.json`, `/sw.js`, `/registerSW.js`, `/manifest*.json`.
  - `immutable` nur noch für `/assets/` (Vite-Dateien mit Hash); übrige Bilder/Icons kurz (1 Tag).
- **useUpdateCheck:** zusätzlich `fetch('/version.json', { cache: 'no-store' })` und Vergleich mit eingebauter Commit-ID; Auslöser Intervall, `visibilitychange`, Routenwechsel (gedrosselt). `applyUpdate` leert Caches und lädt neu. Service-Worker-Pfad bleibt erhalten.
- **UpdateBanner:** global eingebunden (falls noch nicht), Platzierung so, dass es Remote-Banner und Knöpfe nicht überdeckt.
- **Chunk-Fehler:** `ChunkErrorBoundary` plus `vite:preloadError`-Listener; Reload höchstens einmal pro 30 s per `sessionStorage`-Sperre.
- **Lovable-Vorschau:** Versionsprüfung im Editor-Vorschaufenster und im Dev-Modus deaktiviert, damit dort keine falschen Hinweise kommen.
- **Übersetzungen** DE/EN/ES/NL für Banner und Versionsanzeige; Datum im deutschen Format.
- **Dokumentation:** `CHANGELOG.md`, `docs/RELEASE_NOTES.md`, kurzer Abschnitt in `docs/DEPLOYMENT.md`.

## Auswirkungsprüfung
- Vorher: Prüfen, dass Login, Partner-Portal, PWAs (Meter Mate, SmartCharge, Mein Strom) und Kartenkacheln nicht von der geänderten Cache-Regel betroffen sind.
- Nachher: Build-Log prüfen, `version.json` im Build vorhanden, Versionsanzeige sichtbar, Banner erscheint bei manipulierter Commit-ID, kein Reload-Loop.
- Live: wirkt erst nach dem nächsten Deploy über GitHub Actions, da `nginx.conf` im Container-Image steckt. Keine Datenbankänderung nötig.
