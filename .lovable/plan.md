# Fix: Gateway-Zuordnung schlägt auf Live-Version (Hetzner) fehl

## Was der Fehler im Screenshot wirklich bedeutet

Beim Klick auf **„Gateway zuordnen"** auf `ems.aicono.org` erscheint:

> Fehler bei Zuordnung – Edge Function returned a non-2xx status code

Das Frontend ruft die Edge Function `gateway-credentials` auf. Auf der **Lovable-Cloud-Version** funktioniert die Funktion einwandfrei (getestet, antwortet mit `200 OK`).

Auf der **Hetzner-Live-Version** zeigt derselbe Aufruf:

```
POST https://api-ems.aicono.org/functions/v1/gateway-credentials
→ {"error":"Datenbankfehler"}
```

Sogar die einfache „pending devices"-Abfrage scheitert – also lange bevor die eigentliche Zuordnung läuft.

## Ursache

Die Live-Version `ems.aicono.org` spricht **nicht** mit der Lovable Cloud, sondern mit dem **selbst gehosteten Supabase-Stack auf Hetzner** (`api-ems.aicono.org`).

Lovable deployt Edge Functions und Datenbank-Migrationen **ausschließlich in die Lovable Cloud**. Für den Hetzner-Stack ist das ein getrennter, manueller Prozess.

Auf dem Hetzner-Backend fehlt **mindestens eines** davon:

1. Die Tabelle `gateway_devices` (oder Spalten wie `mac_address`, `gateway_username`, `gateway_password_hash`, `location_integration_id`, `tenant_id`, `last_heartbeat_at`, `local_ip`)
2. Oder die Edge Function `gateway-credentials` läuft mit veraltetem Code
3. Oder der `SUPABASE_SERVICE_ROLE_KEY` in der Edge-Function-Umgebung passt nicht zur lokalen Postgres-Instanz

Beweis: Die identische Funktion mit identischem Code antwortet in Lovable Cloud sauber mit `{"devices":[],"success":true}` und in Hetzner mit `{"error":"Datenbankfehler"}`.

## Lösungsweg (in dieser Reihenfolge)

### Schritt 1 – Hetzner-Datenbank-Schema angleichen

Alle Migrationen, die auf Lovable Cloud bereits laufen, müssen auf dem Hetzner-Postgres ebenfalls angewendet werden. Im Repo gibt es dafür bereits:

- `scripts/apply-migrations.sh`
- `supabase-docker/volumes/db/zz-migrations.sh`

Konkret muss der gesamte Migrationsstand aus `supabase/migrations/` auf Hetzner eingespielt werden. Besonders relevant: alle Migrationen, die `gateway_devices` und verwandte Tabellen anlegen oder erweitern.

### Schritt 2 – Edge Functions auf Hetzner aktualisieren

Die Functions im Hetzner-Stack (`supabase-docker/functions/`) müssen mit dem aktuellen Stand aus `supabase/functions/` synchronisiert werden – zumindest `gateway-credentials`, `gateway-ingest`, `gateway-ws`, `gateway-periodic-sync`.

Falls noch kein automatischer Sync existiert, ist eine `rsync`/`docker cp`-basierte Deployment-Routine zu definieren und in `scripts/deploy.sh` zu ergänzen.

### Schritt 3 – Verifikation

Nach Deployment direkt gegen `api-ems.aicono.org` testen:

```bash
curl -X POST https://api-ems.aicono.org/functions/v1/gateway-credentials \
  -H "Content-Type: application/json" \
  -d '{"action":"pending"}'
```

Erwartet: `{"devices":[],"success":true}` (statt aktuell `{"error":"Datenbankfehler"}`).

Dann den Live-Test im Browser wiederholen.

## Wichtig – ehrliche Einschätzung

- **Was ich JA garantieren kann:** Diagnose ist eindeutig. Der Fehler liegt **nicht** im Frontend- oder Edge-Function-Code, sondern in einer **fehlenden Synchronisation** zwischen Lovable Cloud und Hetzner.
- **Was ich NICHT blind ausführen kann:** Ich habe keinen direkten SSH-Zugriff auf den Hetzner-Server. Die Migration und das Function-Deployment müssen entweder von dir auf dem Server ausgeführt werden, oder wir bauen einen CI-Job, der das übernimmt (analog zu `.github/workflows/deploy-prod.yml`, falls dieser noch nicht alle Migrationen anwendet).

## Entscheidungspunkt für dich

Bitte wähle, wie wir weitermachen:

1. **Manuell auf Hetzner**: Du gibst mir grünes Licht und ich schreibe dir eine exakte, Schritt-für-Schritt-Anleitung (mit allen Kommandos zum Kopieren), die du auf dem Hetzner-Server ausführst, um Schema + Functions anzugleichen.
2. **CI/CD ausbauen**: Wir prüfen `deploy-prod.yml` und ergänzen, was zur automatischen Migration + Function-Sync auf Hetzner fehlt – damit dieser Fehler bei künftigen Änderungen nicht wieder auftritt.

Empfehlung: **erst 1, dann 2** – so kommst du heute zur Inbetriebnahme, und die Automatisierung folgt sauber danach.
