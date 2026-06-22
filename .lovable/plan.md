# Problem 1: Endlos-Fehler im API-Tab (ems.aicono.org/integrations → API)

## Ursache (im Code gefunden)

In `src/components/settings/ApiSettings.tsx` stecken **zwei Fehler**, die zusammen den Endlos-Toast erzeugen:

**Fehler A — Endlosschleife durch Render-Seiteneffekt (Zeile 84–86):**
```ts
if (!apiKey && !loading) {
  fetchApiInfo(false);
}
```
Das steht direkt im Render-Body, nicht in einem `useEffect`. Wenn der Fetch fehlschlägt, bleibt `apiKey = null` und `loading = false` → React rendert neu → fetch wird erneut ausgelöst → Toast wieder → Re-Render → endlos.

**Fehler B — Falsche Backend-URL in der Live-Umgebung (Zeile 33–34):**
```ts
const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const baseUrl = `https://${projectId}.supabase.co`;
```
Das funktioniert nur für Lovable-Cloud-Projekte (`*.supabase.co`). Auf Hetzner läuft ein **selbst gehostetes** Supabase unter einer eigenen Domain (z. B. `https://supabase.aicono.org`). Die zusammengebaute `*.supabase.co`-URL existiert dort gar nicht → `fetch` wirft Netzwerkfehler → Fehler A schießt den Toast endlos.

## Fix

Beide Bugs in derselben Datei korrigieren — ohne weitere Änderungen am System:

1. `fetchApiInfo` in einen `useEffect(() => { fetchApiInfo(false); }, [])` verlagern, statt im Render-Body aufzurufen. Damit läuft der Fetch genau einmal beim Mounten, und ein Fehler erzeugt **einen** Toast statt unendlich vielen.
2. Statt aus `VITE_SUPABASE_PROJECT_ID` zusammenzubauen, direkt `import.meta.env.VITE_SUPABASE_URL` verwenden. Diese Variable wird sowohl in Lovable-Cloud als auch in der selbst gehosteten Hetzner-Variante korrekt gesetzt.

Keine weiteren Dateien betroffen. Keine Edge-Function-Änderung. Keine DB-Migration.

---

# Problem 2: Supabase-URL der Live-Umgebung via Putty herausfinden

Ja, das geht — und zwar ohne Raterei. Vorgehen über Putty (du brauchst nur Copy/Paste):

**Schritt P1 — Mit Putty am Hetzner-Server anmelden** (wie gewohnt).

**Schritt P2 — Diesen Befehl ausführen:**
```
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -Ei "kong|supabase"
```
Erwartetes Ergebnis: Eine Zeile mit einem Container namens `supabase-kong` (oder ähnlich) und einer Port-Angabe wie `0.0.0.0:8000->8000/tcp`. Kong ist das API-Gateway von Supabase — das ist der Eingang, den der Worker ansprechen muss.

**Schritt P3 — Reverse-Proxy-Konfiguration prüfen** (damit wir die *öffentliche* Domain bekommen, nicht nur die interne IP). Je nachdem, welcher Reverse-Proxy auf dem Server läuft:
```
docker ps --format "table {{.Names}}\t{{.Image}}" | grep -Ei "caddy|traefik|nginx"
```
Sag mir, welcher Proxy erscheint — dann gebe ich dir den exakten nächsten Befehl, um die Domain auszulesen (bei Caddy z. B. `docker exec <caddy-container> cat /etc/caddy/Caddyfile`, bei Traefik die Labels, bei Nginx die Config).

**Schritt P4 — Ergebnis prüfen:** Das, was im Reverse-Proxy als Domain auf den `supabase-kong:8000`-Container zeigt, ist deine `SUPABASE_URL` (Format: `https://supabase.deine-domain.de`, **ohne** abschließenden Slash).

Sobald wir die URL haben, trage ich sie als verbindlichen Wert in Schritt L1 des README ein, statt der jetzigen „View Backend"-Anleitung (die nur für Lovable-Cloud gilt).

---

# Abarbeitungs-Reihenfolge

1. Code-Fix für den Endlos-Fehler (Problem 1) sofort umsetzen — dann verschwindet der nervige Toast und du kannst den API-Key wieder lesen.
2. Danach Putty-Schritte P1–P3 ausführen und mir die Ausgaben zeigen — dann passe ich Schritt L1 im README an die echte Live-Supabase-URL an.

---

# Technische Details (für später, kannst du überspringen)

- Datei: `src/components/settings/ApiSettings.tsx`
- Zeilen 23–61 (`fetchApiInfo`): Behalten, nur Zeile 33–34 (`projectId`/`baseUrl`) ersetzen durch `const baseUrl = import.meta.env.VITE_SUPABASE_URL;`
- Zeilen 83–86: Ersetzen durch `useEffect(() => { fetchApiInfo(false); }, []);` (Import `useEffect` aus `react`).
- Edge-Function `api-key-info` bleibt unverändert.
