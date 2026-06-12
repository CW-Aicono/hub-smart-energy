## Ziel

C-Level Dashboard live über `https://ems.aicono.org/board` bereitstellen — analog zu `/sales` und `/partner`. **Keine** eigene Subdomain `board.aicono.org`.

## Warum

- `sales.aicono.org` und `partner.aicono.org` sind aktuell **nicht aktiv** — die Live-Nutzung läuft über die Pfade `ems.aicono.org/sales` und `/partner`.
- Eine eigene Subdomain bringt damit keinen Mehrwert, kostet aber: DNS-Eintrag, Caddyfile-Block, Let's-Encrypt-Zertifikat, zusätzlicher Deploy-Workflow-Fix (`supabase-docker` wird über `CI_PATHS` aus `main` überschrieben).
- `/board` ist bereits als Route in der App vorhanden (`BoardHome.tsx`, `manifest-board.json`). Es muss nichts neu gebaut werden.

## Was zu tun ist

### 1. QR-Code-URL umstellen

**Datei:** `src/components/settings/BoardThemesSettings.tsx` (Zeile ~174)

```ts
const boardUrl = "https://ems.aicono.org/board";
```

(statt aktuell `https://board.aicono.org`)

### 2. Caddyfile-Block für `board.aicono.org` wieder entfernen

**Datei:** `supabase-docker/proxy/caddy/Caddyfile` (Zeilen ~28–32)

Den Block `board.aicono.org { … }` ersatzlos löschen. Spart unnötigen Konfig-Ballast und vermeidet einen toten Caddy-Eintrag.

### 3. `BoardHostGuard` & `isBoardHost()` — bleiben bestehen

Die beiden Helfer (`src/components/BoardHostGuard.tsx`, `src/lib/hostname.ts`) bleiben **unverändert drin**. Sie schaden nicht (`isBoardHost()` liefert auf `ems.aicono.org` einfach `false`) und halten die Option offen, später doch eine Subdomain zu aktivieren — ohne neuen Code.

### 4. Was du **nicht** tun musst

- Keine Cloudflare-DNS-Änderung.
- Keine Hetzner-Anpassung.
- Kein Eingriff in `.github/workflows/deploy-prod.yml`.

## Ergebnis nach Deploy

- `https://ems.aicono.org/board` öffnet das C-Level Dashboard (funktioniert sofort, da Pfad bereits geroutet ist).
- QR-Code in *Einstellungen → C-Level Dashboard* zeigt überall die korrekte Live-URL.
- `board.aicono.org` wird nicht weiterverfolgt.

## Frage zur Bestätigung

Soll ich die DNS-Eintragung `board` bei Cloudflare auch **wieder entfernen** lassen (Empfehlung: ja, sonst zeigt ein Eintrag ins Leere)? Das machst du selbst in Cloudflare — ich kann dir die exakten Klick-Schritte mitliefern, wenn du möchtest.  
  
Antwort: den DNS Eintrag entferne ich selber, brauche keine Anleitung dazu.