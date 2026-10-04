# Remote-Support ohne Zeitlimit, Protokoll für Kunden, Module-Knopf reparieren

## 1. Module-Knopf im Super-Admin (Fehlerursache gefunden)
Es liegt nicht an der Datenbank. Der Knopf „Module“ merkt sich zwar den gewählten Partner, das Fenster dazu wurde aber nie in die Seite eingebaut. Deshalb passiert beim Klick nichts – auf Staging genauso wie live.
- Fenster in der Partner-Liste einbauen, damit es beim Klick aufgeht.
- Zusätzlich: Falls die Modulliste live noch fehlt (Deploy noch nicht gelaufen), zeigt das Fenster eine klare Meldung statt still zu bleiben.

## 2. Remote-Sitzung ohne Zeitlimit
- Kein Countdown mehr, kein automatisches Ablaufen, kein „Verlängern“-Knopf.
- Die Sitzung läuft, bis der Support oben auf „Remote-Sitzung beenden“ klickt. Dann wird sie beendet und es geht zurück zum Kunden im Super-Admin bzw. Partner-Portal.
- Die Leiste mit dem Beenden-Knopf ist während der Sitzung immer sichtbar und verschwindet nie von selbst.
- Sicherheitsnetz: Schaltet der Kunde Remote-Support aus, wird eine laufende Sitzung sofort beendet. Nach 24 Stunden ohne Beenden wird eine vergessene Sitzung im Hintergrund geschlossen (nur Aufräumen, nicht während der Arbeit spürbar).

## 3. Remote-Protokoll für den Kunden
Im Menü „Hilfe“, dort wo der Kunde Remote-Support erlaubt, kommt darunter eine Liste „Bisherige Remote-Sitzungen“:
- Datum, Beginn, Ende, Dauer, wer den Support geleistet hat (AICONO oder Partnername), Grund.
- Pro Sitzung aufklappbar: Was wurde geändert (z. B. „Modul aktiviert“, „Zähler angelegt“, „Standort bearbeitet“), mit Uhrzeit.
- Laufende Sitzung wird oben als „läuft gerade“ markiert.
- Nur Administratoren des Kunden sehen das; jeder Kunde sieht ausschließlich seine eigenen Sitzungen.

## Auswirkungen (was kann kaputtgehen)
- Bestehende laufende Sitzungen: werden beim Umstellen nicht abgebrochen.
- Kunden-Banner (rot) und Super-Admin-Leiste: werden zu einer einheitlichen Leiste zusammengeführt, damit nichts doppelt über Knöpfen hängt.
- Nach dem Bau prüfe ich: Partner-Liste → „Module“ öffnet sich, Remote starten/beenden springt zurück, Protokoll zeigt die Sitzung mit Änderungen.

## Technische Details
- `SuperAdminPartners.tsx`: `<PartnerModulesDialog partnerId={modulesPartner?.id} open={!!modulesPartner} onOpenChange={o=>!o&&setModulesPartner(null)} />` rendern; Query-Fehler (42P01) als Hinweis im Dialog anzeigen.
- `useSupportSession`: Filter `expires_at > now()` und Countdown/extend entfernen; aktiv = `ended_at IS NULL`. `SupportSessionBanner` ohne Timer, Beenden-Knopf immer sichtbar; `SuperAdminImpersonationBar` sticky statt fixed.
- `support-session-impersonate`: `expires_at` = now()+24h (Aufräum-Grenze). Cron/Trigger: Sitzungen mit `expires_at < now()` bzw. bei `tenants.remote_support_enabled = false` auf `ended_at = now()` setzen.
- Änderungen pro Sitzung: `audit_logs`-Einträge des Support-Users (`impersonated_user_id`) im Zeitraum `started_at`–`ended_at`, plus Spalte `support_session_id` in `audit_logs` (nullable, über `audit-log-write` befüllt, wenn der Aufrufer ein Support-User mit offener Sitzung ist).
- RLS: Tenant-Admins dürfen `support_sessions` und zugehörige `audit_logs` ihres Tenants lesen (prüfen, ob Policy existiert; sonst ergänzen).
- Alle Schemaänderungen als Migration in `drizzle/migrations/` (idempotent), damit Hetzner sie beim Deploy erhält.
- Neue Texte in DE/EN/ES/NL; CHANGELOG.md und docs/RELEASE_NOTES.md fortschreiben.
