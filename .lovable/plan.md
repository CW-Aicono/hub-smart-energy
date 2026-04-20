

## Bewertung

**Ja, exakt machbar — und konzeptionell die sauberste Lösung.** Loxone-Modell = drei Felder, alle vom Nutzer kontrollierbar, kein Cloud-Geheimnis im Add-on-Code. Schauen wir kurz, wie Loxone heute im Code abgebildet ist, und übertragen das 1:1 auf den Pi.

## Loxone-Vorbild (kurz)

In `useLocationIntegrations` / `IntegrationCard` werden Loxone-Miniserver pro Liegenschaft mit drei Feldern angelegt: `host` (IP/MAC-Identifier), `username`, `password` (verschlüsselt via `BRIGHTHUB_ENCRYPTION_KEY`). Die Cloud nutzt diese Credentials für Outbound-Polling. Beim Pi drehen wir die Richtung um (Push), aber das Modell bleibt identisch.

## Endzustand User-Sicht

**Im Add-on (HA-Konfig):**
```
gateway_username: <vom User vergeben, z.B. "buero-pi">
gateway_password: <vom User vergeben>
```
Das war's. Keine URL, kein Tenant, kein Key. MAC liest das Add-on selbst aus.

**Lokale Add-on-UI (Port 8099, Ingress):**
```
Gateway-MAC:       aabbccddeeff   [Kopieren]
Gateway-User:      buero-pi
Status:            🟡 Wartet auf Zuordnung in AICONO
```

**In AICONO (Liegenschaft → Integration "AICONO EMS Gateway"):**
```
MAC-Adresse:    [aabbccddeeff]
Benutzername:   [buero-pi]
Passwort:       [••••••••]
[Speichern]
```
Innerhalb ~60 Sek. → 🟢 Online. Fertig.

## Sicherheitsmodell

- **MAC** = Identifier (welcher Pi?), kein Geheimnis.
- **User+Passwort** = Authentifizierung (ist es wirklich dieser Pi?).
- **Triple-Match** in `gateway-ingest`: MAC + User + bcrypt(Passwort) müssen übereinstimmen → erst dann wird der Heartbeat/Datenpunkt akzeptiert und einer Liegenschaft zugeordnet.
- Passwort liegt **nur als bcrypt-Hash** in der DB (analog `mqtt_credentials`). In `location_integrations.config` wird es AES-verschlüsselt gespeichert (analog Loxone), damit die Cloud-Bridge auch Outbound-Commands signieren kann, falls das später nötig ist.
- Rotation: User generiert in der Add-on-Konfig ein neues Passwort, trägt es zusätzlich in AICONO ein → Speichern. Alter Hash wird überschrieben.

## Datenmodell

**Erweiterung `gateway_devices`:**
- `mac_address` (text, lowercase 12 hex, UNIQUE global) — neuer primärer Identifier.
- `gateway_username` (text) — Klartext, nicht sensibel.
- `gateway_password_hash` (text, bcrypt) — nur Hash.
- `device_name` bleibt, aber rein als Display-Label (nicht mehr Identifier).
- Unique-Constraint `(tenant_id, device_name)` wird entfernt → löst die Kollision aus dem Vorgespräch automatisch.

**Keine separate `gateway_accounts`-Tabelle mehr nötig** — Credentials hängen direkt am Device, exakt wie bei Loxone die Credentials am Miniserver hängen.

## Plan in 3 Schritten

### Schritt 1 — DB-Migration
- `gateway_devices`: neue Spalten `mac_address`, `gateway_username`, `gateway_password_hash`.
- Unique-Index `gateway_devices_mac_unique` auf `mac_address` (partial: `WHERE mac_address IS NOT NULL`).
- Alter Index `(tenant_id, device_name)` auf non-unique umstellen (rückwärtskompatibel).

### Schritt 2 — Add-on v2.3.0
- `docs/ha-addon/index.ts`:
  - `getHostMAC()` analog `getHostIP()` via Supervisor `/network/info`, Cache mit TTL.
  - Heartbeat-Header: `Authorization: Basic base64(username:password)` + neues Body-Feld `mac_address`.
  - Alte `gateway_api_key`-Auth bleibt parallel (Übergang).
- `docs/ha-addon/config.yaml`:
  - Neue Felder `gateway_username` (Pflicht), `gateway_password` (Pflicht, type `password`).
  - `gateway_api_key`, `tenant_id`, `cloud_url` werden optional.
  - Version `2.3.0`.
- `docs/ha-addon/ui/`: MAC + User prominent in Header-Karte, Status-Anzeige "Zuordnung pending / verbunden".

### Schritt 3 — `gateway-ingest` + AICONO-UI
- **Edge Function:**
  - Neuer Auth-Pfad: Basic-Auth-Header parsen → `gateway_devices` per `mac_address` lookup → `username` vergleichen → bcrypt(`password`) gegen `gateway_password_hash`.
  - Bei Match ohne `tenant_id` (= unzugeordnet): Heartbeat mit `status='pending_assignment'` ablegen, sonst normale Verarbeitung.
  - Erste Heartbeat eines unbekannten Pi: Auto-Insert mit `status='pending_assignment'`, `tenant_id=NULL`.
- **AICONO-UI:**
  - Liegenschaft → "AICONO EMS Gateway" hinzufügen: 3 Felder (MAC, User, Passwort) + Validator (MAC = 12 hex lowercase, User = 3-32 chars, Passwort = min 8 chars).
  - Beim Speichern: `gateway_devices`-Zeile per MAC suchen → `tenant_id` + `location_integration_id` setzen, `gateway_password_hash` schreiben (bcrypt).
  - Übersicht "Unzugeordnete Geräte" oben in der Gateway-Liste mit Hinweis "Neuer Pi mit MAC `xy` möchte sich verbinden".

## Risiken / offene Punkte

1. **Bestehende zwei Pis:** Übergangsweise akzeptiert die Edge-Function weiter den alten `gateway_api_key`. Migration für bestehende Pis: einmalig MAC + User/PW in AICONO eintragen, in Add-on neue Felder setzen, alten Key entfernen. Schritt-für-Schritt-Anleitung wird Teil des Add-on-Updates.
2. **Kollisionsfix automatisch erledigt** durch Wegfall des `(tenant_id, device_name)`-Unique-Constraints und Einführung von `mac_address` als neuer Identifier. Kein separater Hotfix nötig.
3. **Passwort in `config.yaml`** liegt im Klartext auf dem Pi-Dateisystem (HA-Standard). Akzeptabel, da Scope = lokal + bcrypt-Hash in Cloud.

