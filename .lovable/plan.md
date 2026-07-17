## Faktenlage (verifiziert)

- Cloud-DB `location_integrations` (Rathaus, Serial `504F94A2BAA2`, ID `284a957b-…`): `config.username = "admin"` — passt zum Miniserver. Für alle 5 aktiven Loxone-Integrationen steht der korrekte Username in der DB (nur eine hat noch bewusst `AICONO` als User).
- Worker-Code (`docs/loxone-ws-worker/index.ts` Zeilen 804–903) hat bereits die Reload-Diff-Logik: bei geändertem Username/Passwort wird die WS-Session hart geschlossen und mit neuen Credentials neu aufgebaut, mit Log `ws_config_changed`.
- Trotzdem meldet der Worker-Container auf Hetzner weiterhin `password based authentication for user "AICONO_admin"` → der laufende Container nutzt entweder ein Image **vor** der Diff-Reload-Logik oder er wurde nach dem DB-Update nicht durch einen erfolgreichen `reloadMeters()` erneuert.
- Keine Audit-Log-Einträge für die Rathaus-Integration → wir wissen nicht, wann/wodurch die Config auf `AICONO_admin` gesetzt wurde. Es gibt keinen automatischen Backfill im Code; die Config wird ausschließlich manuell via Integrations-Dialog geschrieben (`useIntegrations.updateIntegration`).

## Diagnose

Das Problem hat **zwei Ursachen**, die getrennt behoben werden müssen. Ich will beide **zuerst verifizieren, dann fixen** — kein Blindflug.

**A) Akut — der Container zieht die neue Config nicht.**
Hypothese: Der laufende Docker-Container auf Hetzner ist das alte Image (`v1.1` oder früher) ohne Diff-Reload. Verifiziert werden muss:

1. Image-Digest & Startzeit des Containers.
2. Ob `ws_config_changed` jemals im `bridge_event_log` für Serial `504F94A2BAA2` erscheint.
3. Ob `reloadMeters()` überhaupt läuft (Log-Zeilen `[Reload]`).

Erst wenn eindeutig ist, dass der Container die neue Logik **nicht** enthält, ist Rebuild + Neustart der Fix. Falls die Logik enthalten ist und trotzdem nicht triggert, weiter forschen (Cache in `connections`-Map, Endpoint-Response prüfen).

**B) Strukturell — es gibt keinen Schutz gegen fehlerhafte Credentials.**
Die Ursache, dass `AICONO_admin` je in die DB gelangte, ist eine reine Nutzereingabe (Integrations-Dialog). Das lässt sich nicht rückwirkend klären, aber wir können verhindern, dass so ein Zustand jemals wieder unbemerkt bleibt:

1. **Test-Connect vor Speichern** (`AddIntegrationDialog`/Loxone-Config-Dialog): Ein echter Auth-Handshake gegen den Miniserver (nicht nur `hasValues`, wie aktuell in `testConnection`). Speichern nur bei Erfolg — oder mit explizitem „Trotzdem speichern"-Bestätigung.
2. **Auth-Fehler-Alarm im Worker**: Bei WS-401 ein `integration_errors`-Eintrag + `location_integrations.sync_status = 'auth_failed'` setzen. Dann sieht der Nutzer im UI sofort „Anmeldung fehlgeschlagen", statt es nur im Container-Log zu finden.
3. **Audit auf `location_integrations`-Update** aktivieren (Trigger nach `audit_logs`-Muster) — damit künftige Änderungen an Username/Passwort nachvollziehbar sind, ohne das Passwort selbst zu loggen.

## Umsetzungsschritte

```text
Phase 1 — Diagnose (kein Code, nur Reads)
  1.1  bridge_event_log für Serial 504F94A2BAA2 der letzten 24h auswerten
       → gibt es reload/ws_config_changed/auth_failed?
  1.2  Worker-Version im Container prüfen (SHA im Image, docker inspect)
       → Anleitung an User: `docker inspect loxone-ws-worker-live | grep -i image`
  1.3  Response von list-loxone-ws-meters manuell simulieren
       → sieht der Worker jetzt "admin" oder noch "AICONO_admin"?

Phase 2 — Akut-Fix (nur wenn 1.2 alte Version zeigt)
  2.1  User führt Rebuild + Restart nach bestehender UPDATE-ANLEITUNG.md aus
  2.2  Nach Restart: bridge_event_log muss "ws_config_changed" ODER
       erfolgreiche Auth für 504F94A2BAA2 zeigen

Phase 3 — Strukturelle Absicherung (Code)
  3.1  supabase/functions/loxone-api: neuer Action "verify-auth"
       → macht echten WS-Login-Test gegen Miniserver
  3.2  src/components/integrations/…LoxoneDialog: verify-auth vor Save
       → bei Fehler blockieren + Fehlermeldung anzeigen
  3.3  docs/loxone-ws-worker/index.ts: bei WS-401
       → integration_errors + location_integrations.sync_status='auth_failed'
  3.4  Migration: Trigger auf location_integrations für audit_logs
       (Passwort-Feld beim Loggen maskieren, nur "***" speichern)
  3.5  UI-Badge in Integrations-Kachel: sync_status='auth_failed' rot
       "Zugangsdaten prüfen"
```

## Was ich als nächstes tun werde

Nach deiner Freigabe starte ich mit **Phase 1** (nur Reads, keine Änderung), poste dir die Ergebnisse und leite daraus die exakte Ursache ab. Erst dann fasse ich Code an. Damit ist ausgeschlossen, dass ich blind einen Rebuild empfehle oder eine Struktur-Änderung baue, die den falschen Fehler jagt.

## Nicht-Ziele

- Keine Änderung an bereits gesetzten DB-Werten (die sind korrekt).
- Keine Passwort-Verschlüsselung in dieser Runde (separates Thema).
- Keine Änderung am Worker-Docker-Setup — nur Code-Fixes im Worker-Script.  
  
Zusätzliche Info: In der Live-Umgebung bei Hetzner ist der Miniserver noch nicht über WS verbunden. Vermutlich, weil dort noch der alte Username AICONO_admin weiterhin hinterlegt ist. Du hast ja nur hier in Lovable auf admin geändert.