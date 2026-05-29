## Ziel

Eine versteckte Notfall-Funktion ("Break-Glass") implementieren, mit der per geheimem Header ein beliebiger User per E-Mail zum `super_admin` befördert werden kann — funktioniert sowohl in Lovable Cloud als auch nach Roll-Out auf dem Hetzner-Server.

## Umsetzungsschritte

### 1. Secret anlegen
- `MASTER_RECOVERY_KEY` als Secret in Lovable Cloud erzeugen (zufälliger 64-Zeichen-String)
- Derselbe Wert muss später auf Hetzner als Umgebungsvariable gesetzt werden

### 2. Edge Function `master-recovery` erstellen
Datei: `supabase/functions/master-recovery/index.ts`

Funktionsweise:
- Akzeptiert nur `POST`
- Prüft Header `x-master-key` gegen `MASTER_RECOVERY_KEY` (Constant-Time-Vergleich)
- Body: `{ email: string }`
- Sucht User per E-Mail in `auth.users` (via `SUPABASE_SERVICE_ROLE_KEY`)
- Wenn User existiert: `UPSERT` Rolle `super_admin` in `public.user_roles`
- Wenn nicht existiert: Klartext-Fehler `"User nicht gefunden — bitte zuerst registrieren"`
- Schreibt jeden Aufruf (erfolgreich + fehlgeschlagen) in eine neue Audit-Tabelle `master_recovery_log` (Timestamp, IP, Ziel-Email, Erfolg)
- `verify_jwt = false` (kein Login nötig)

### 3. Audit-Tabelle per Migration
```text
master_recovery_log
  - id, created_at
  - target_email
  - success (bool)
  - ip_address
  - error_message
```
RLS: nur `super_admin` darf lesen, niemand schreiben (nur Service Role aus Edge Function).

### 4. Rate-Limiting
In der Function: max. 5 Aufrufe pro IP pro Stunde (Abfrage über `master_recovery_log`). Verhindert Brute-Force des Keys.

### 5. Dokumentation
Eine kurze deutsche Anleitung als Markdown-Datei `docs/MASTER_RECOVERY.md`:
- Wofür ist die Funktion
- Wie ruft man sie auf (mit `curl`-Beispiel, Schritt für Schritt)
- Wo der Key gespeichert werden muss (1Password/Bitwarden)
- Wie man den Key rotiert
- Was beim Hetzner-Deployment zu beachten ist

## Technische Details

**Aufruf-Beispiel (curl):**
```bash
curl -X POST https://<projekt>.supabase.co/functions/v1/master-recovery \
  -H "x-master-key: <geheimer-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aicono.de"}'
```

**Sicherheitsmaßnahmen:**
- Constant-Time-Vergleich des Keys (verhindert Timing-Attacken)
- Key niemals in Logs ausgeben
- Audit-Log unveränderlich (nur INSERT erlaubt)
- Rate-Limiting auf IP-Ebene
- Key-Länge ≥ 64 Zeichen (praktisch nicht brute-forcebar)

**Hetzner-Kompatibilität:**
Da die Edge Function im Self-Hosted-Supabase auf Hetzner identisch läuft, muss dort nur derselbe `MASTER_RECOVERY_KEY` als ENV-Variable im Docker-Compose-File gesetzt werden — kein Code-Unterschied.

## Was nicht enthalten ist
- Keine UI in Lovable (bewusst — würde Angriffsfläche erhöhen)
- Keine Möglichkeit, Rolle wieder zu entziehen (nur Beförderung; Entzug erfolgt regulär durch Super-Admin im Backend)
- Keine Massenoperationen (immer nur ein User pro Aufruf)

## Nach Genehmigung
1. Secret-Dialog wird geöffnet → Du gibst einen zufälligen 64-Zeichen-Key ein (oder ich generiere einen Vorschlag)
2. Migration für `master_recovery_log` wird angelegt → Du genehmigst
3. Edge Function wird geschrieben und automatisch deployed
4. Dokumentation wird erstellt
5. Wir testen den Aufruf einmal mit deiner E-Mail
