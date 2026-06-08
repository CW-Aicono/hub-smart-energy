# OCPP-Firmware-Update für Ladepunkte

## 1. Recherche-Ergebnis (Kurzfassung)

**Machbarkeit: Ja, gut machbar mit OCPP 1.6J** über das optionale `FirmwareManagement`-Profil. Alle für uns relevanten Wallboxen (ABB Terra, KEBA P30, Alfen Eve, Webasto, Mennekes AMTRON, Wallbox Pulsar/Commander, ABL eMH/eM4, Compleo) unterstützen es.

### OCPP 1.6J Mechanismus

- 1 Befehl Cloud → Wallbox: `UpdateFirmware` mit Feldern `location` (HTTPS-URL zur Firmware-Datei), `retrieveDate` (ISO-Zeitstempel, frühestens herunterladen), optional `retries`, `retryInterval`
- `UpdateFirmware.conf` ist immer leer — **kein Reject möglich**, Fehler kommen rein asynchron
- Status-Rückmeldungen Wallbox → Cloud via `FirmwareStatusNotification`: `Downloading → Downloaded → Installing → Installed` (Happy Path) bzw. `DownloadFailed` / `InstallationFailed`
- Wallbox triggert nach Installation i.d.R. eigenständig Reboot → neue `BootNotification` mit neuer `firmwareVersion`
- Bei Stillstand: `TriggerMessage(FirmwareStatusNotification)` zum Nachfragen

### Wichtigste Stolperfallen

- **Dateiformat** ist herstellerspezifisch (`.bin` / `.zip` / `.fwu` / Container) — Datei muss exakt passen, sonst `InstallationFailed`
- **TLS**: Manche älteren CPs scheitern an Let's-Encrypt-Chain oder TLS 1.2 → ggf. CA-Bundle/Cert prüfen
- **Lange Downloads** über Mobilfunk → `retrieveDate` in die Nacht legen, idealerweise FTPS mit Resume bei großen Dateien
- **Auth in URL**: Basic Auth in URL landet in OCPP-Logs → besser **Signed URLs** mit kurzer Gültigkeit
- **Reboot-Verhalten**: `Installed` kommt oft erst nach Reconnect → Backend braucht Timeouts + `TriggerMessage`-Fallback
- **Laufende Ladesessions**: Spec empfiehlt zu warten — nicht alle Wallboxen tun das → Update-Fenster in Niedriglast-Zeiten planen

### Eichrecht (kritisch!)

- **§ 40 MessEV**: FW-Update an eichrechtkonformen Messgeräten ist **genehmigungspflichtig** und braucht Konformitätsbescheinigung des Herstellers
- **Meter-Eichrecht** (OCMF-Zähler signiert selbst, z. B. Eastron, EMH, Iskra): Zähler-FW i. d. R. **nicht** updatebar; Controller-FW unproblematisch, solange Messmodul unberührt
- **Controller-Eichrecht** (z. B. Bender, Alfen, ABB): nur signierte, vorab genehmigte FW-Pakete des Herstellers verwenden; "Lock" entspricht Software-Siegel
- OCMF-Records enthalten `FV` (Firmware Version) → Versionssprung in jedem Ladevorgang sichtbar (Audit-Spur)
- **Konsequenz für uns**: Update-Funktion muss zwischen "Eichrecht-relevant" (gesperrt für Self-Service, nur freigegebene Hersteller-Firmware) und "unkritisch" (z. B. nur Kommunikations-FW) unterscheiden

### Quellen

- OCPP 1.6 FW-Spec: [https://tzi.app/developers/ocpp/1.6/firmware-and-diagnostics-file-transfer](https://tzi.app/developers/ocpp/1.6/firmware-and-diagnostics-file-transfer)
- OCPP 1.6 JSON-Schemas: [https://ocpp-spec.org/schemas/v1.6/](https://ocpp-spec.org/schemas/v1.6/)
- OCA Test Plans 1.6: [https://openchargealliance.org/wp-content/uploads/2024/06/02.-Test-Procedure-Test-Plans_v1.2.1.pdf](https://openchargealliance.org/wp-content/uploads/2024/06/02.-Test-Procedure-Test-Plans_v1.2.1.pdf)
- ABB Terra OCPP 1.6 Impl. Overview (FirmwareManagement) — siehe ABB Library
- § 40 MessEV: [https://www.buzer.de/40_MessEV.htm](https://www.buzer.de/40_MessEV.htm)
- Bender Eichrecht-Doku: [https://www.bender.de/docs/charge-controller/Eichrecht/](https://www.bender.de/docs/charge-controller/Eichrecht/)

→ Fazit: **Empfehlung umsetzen**, OCPP 1.6J-only (2.0.1 später optional als Erweiterung).

---

## 2. Status quo im Projekt

- Persistenter OCPP-Server unter `docs/ocpp-persistent-server/` läuft auf Hetzner, dispatcht Commands via DB-Poll (`charge_point_commands` o. ä., siehe `commandDispatcher.ts`)
- `ocppHandler.ts` Zeile 263 nimmt `FirmwareStatusNotification` heute **stillschweigend an** und antwortet mit `{}` — keinerlei Persistenz
- `commandDispatcher.ts` hat aktuell **keinen** `UpdateFirmware`-Case
- Es existiert bereits eine Super-Admin-Seite `SuperAdminOcppControl.tsx` und ein Tenant-Bereich für Ladepunkte (`/charging/points/:id`)
- Storage für FW-Files ist noch nicht angelegt

---

## 3. Umsetzungsplan

Ich schlage einen **vierstufigen Aufbau** vor, in dem die ersten beiden Schritte das MVP bilden und 3 + 4 als zweite Iteration folgen können.

### Schritt 1 — Datenmodell & Storage

Neue Tabellen:

- `cp_firmware_artifacts` — vom Super-Admin hochgeladene FW-Dateien
  - `vendor`, `model`, `version`, `storage_path` (Bucket), `file_size`, `sha256`, `file_format` (`bin`/`zip`/`fwu`/…), `is_eichrecht_certified` (bool), `eichrecht_approval_ref` (Text/Link), `release_notes`, `uploaded_by`
- `cp_firmware_jobs` — pro Wallbox ein Job
  - `charge_point_id`, `artifact_id`, `status` (`queued`, `dispatched`, `downloading`, `downloaded`, `installing`, `installed`, `failed`, `cancelled`), `retrieve_date`, `retries`, `retry_interval`, `download_url` (signed, mit `url_expires_at`), `last_status_at`, `error_code`, `error_message`, `triggered_by` (user_id), `created_at`, `finished_at`
- `cp_firmware_status_events` — vollständiges Protokoll aller `FirmwareStatusNotification` (Pflicht für §40 MessEV-Konformität: 6 Mon. nach Eichfrist aufheben)
  - `job_id`, `charge_point_id`, `status`, `received_at`, `raw_payload`

Storage:

- Neuer **privater** Bucket `cp-firmware/` mit RLS (nur `super_admin` schreibt, nur Backend signed URLs erzeugt)
- Multi-Tenancy: Artefakte sind **global** (super_admin-only), Jobs strikt tenant-scoped via `charge_point_id → tenant_id`

RLS gemäß `mem://technical/architecture/multi-tenancy-core`, GRANTs zwingend (siehe Core-Regel).

### Schritt 2 — Cloud → OCPP-Server: Command-Dispatch

In `docs/ocpp-persistent-server/src/commandDispatcher.ts`:

- Neuer Case `UpdateFirmware`:
  ```ts
  case "UpdateFirmware":
    return [2, uniqueId, "UpdateFirmware", {
      location: p.location as string,
      retrieveDate: p.retrieveDate as string,
      ...(p.retries !== undefined ? { retries: p.retries as number } : {}),
      ...(p.retryInterval !== undefined ? { retryInterval: p.retryInterval as number } : {}),
    }];
  case "TriggerMessage":
    return [2, uniqueId, "TriggerMessage", {
      requestedMessage: p.requestedMessage as string, // "FirmwareStatusNotification"
      ...(p.connectorId !== undefined ? { connectorId: p.connectorId as number } : {}),
    }];
  ```
- Beim Verarbeiten von `cp_firmware_jobs` (neuer Edge-Function oder direkter Insert in `charge_point_commands` mit `command_type=UpdateFirmware`): Backend erzeugt **kurz vor Dispatch** eine Signed URL (5–15 Min Gültigkeit) via Supabase Storage `createSignedUrl`, schreibt sie in `payload.location` + setzt `job.download_url`/`url_expires_at`

In `docs/ocpp-persistent-server/src/ocppHandler.ts` Zeile 263:

- `FirmwareStatusNotification` echt persistieren:
  - Insert in `cp_firmware_status_events`
  - Aktuellen offenen Job für diese `charge_point_id` finden und `status`/`last_status_at` aktualisieren
  - Bei `Installed`: Job-Abschluss + `charge_points.firmware_version` aktualisieren beim nächsten `BootNotification`
  - Bei `DownloadFailed`/`InstallationFailed`: `status=failed`, `error_message` setzen

### Schritt 3 — UI: Super-Admin (Firmware-Katalog)

Neue Seite `SuperAdminOcppFirmware.tsx`:

- Liste aller `cp_firmware_artifacts` mit Vendor/Model/Version-Filter
- Upload-Dialog: Datei + Metadaten + **Pflicht-Checkbox** "Eichrecht-Freigabe vorhanden (Konformitätsbescheinigung verlinken)" mit Pflicht-URL/Text-Feld
- SHA-256 wird beim Upload client-seitig berechnet und mitgespeichert
- Bulk-Rollout-Dialog: Modell wählen → alle passenden Wallboxen anzeigen → Auswahl → `retrieveDate` (default: kommende Nacht 02:00 Europe/Berlin) → Bestätigung mit Eichrecht-Warnhinweis falls eichrechtrelevant

### Schritt 4 — UI: Tenant (pro Ladepunkt)

Auf `/charging/points/:id` neue Karte **„Firmware“**:

- Aktuelle FW-Version (aus `BootNotification`)
- Verfügbares Update (passender Artefakt für Vendor+Model mit höherer Version)
- Button **„Update planen“** → Dialog mit Zeitpunkt-Auswahl + Eichrecht-Hinweis
- Live-Statusverlauf des aktuellen Jobs (Realtime-Subscribe auf `cp_firmware_status_events`)
- Job-Historie + Möglichkeit, einen `queued`/`dispatched`-Job zu **canceln**
- Watchdog: Falls 10 Min nach erwartetem `Downloading` keine Notification → automatisch `TriggerMessage(FirmwareStatusNotification)` senden

### Schritt 5 — Edge-Function & Watchdog (pg_cron)

- Edge-Function `ocpp-firmware-control` mit Actions `enqueue_job`, `cancel_job`, `request_status`, `bulk_enqueue`, geschützt per `super_admin`/`admin`-Rolle (für Tenant nur eigene CPs)
- `pg_cron`-Job alle 5 Min: für alle Jobs mit `status in (dispatched, downloading, installing)` und letzte Statusmeldung > 15 Min → `TriggerMessage` senden; nach 6 h ohne Fortschritt → `status=failed` mit `error_code=timeout`

---

## 4. Out of Scope (für später, separat zu beauftragen)

- OCPP 2.0.1 `SignedUpdateFirmware` / `PublishFirmware` (Local-Controller-Mode)
- Automatisches "Suche nach Update beim Hersteller"-Crawling
- `GetDiagnostics`-Flow (eigene, kleinere Story)
- Eichrechtkonforme Genehmigungs-Workflow-Engine (nur Hinweis-/Dokumentationsfeld vorgesehen)

---

## 5. Risiken & Nebenwirkungen


| Risiko                                                       | Gegenmaßnahme                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Falsches FW-Format → Wallbox bricht ab                       | Pro Vendor+Model nur freigegebene `file_format` zulassen, im Upload-Dialog dropdown                     |
| Wallbox lädt während aktivem Ladevorgang neu                 | Default `retrieveDate` nachts; zusätzlich Check „aktive Session?“ vor Dispatch                          |
| Signed URL läuft ab, bevor CP downloadet                     | URL-Gültigkeit ≥ `retrieveDate + 6 h`; Re-Sign bei Bedarf                                               |
| Eichrecht-Verletzung durch versehentlichen Upload            | Pflicht-Checkbox + sichtbarer Banner + Audit-Log via `auditLog.ts`                                      |
| Großer FW-Download über Mobilfunk-Backhaul → OCPP-Disconnect | Akzeptiert (Wallbox läuft Download eigenständig zu Ende), Watchdog fragt Status via TriggerMessage nach |


---

## 6. Geschätzter Aufwand

- Schritt 1+2 (Backend + OCPP-Server-Anbindung): ~½ Tag
- Schritt 3 (Super-Admin-UI): ~½ Tag
- Schritt 4 (Tenant-UI): ~½ Tag
- Schritt 5 (Watchdog/Edge-Function): ~¼ Tag

Soll ich loslegen — und falls ja, **alles auf einmal** oder erst **MVP (Schritte 1+2+4)** und Super-Admin-Katalog nachziehen?  
Antwort: Umsetzung gerne in zwei Schritten, wir fangen mit MVP (Schritte 1+2+4) an.