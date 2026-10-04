# Änderungsprotokoll (intern)

Format: neueste Einträge oben. Jede Änderung wird hier und – falls kundenrelevant – in `docs/RELEASE_NOTES.md` festgehalten.

## 2026-10-04
### Neu
- 3-Wege-Bereichsumschalter (Super-Admin / Kaufmännisch / Technisch): `AreaSwitcher` zeigt nur berechtigte Bereiche, auch in der Super-Admin-Seitenleiste; `Index.tsx` leitet Super-Admins mit Mandant/Partner nicht mehr zwangsweise um. Präferenz ist nur Navigation, Guards/RLS unverändert; während Remote-Sitzung ausgeblendet.
- Remote-Protokoll: Ladefehler statt endlosem „…“, Sitzungen > 24 h ohne Ende als „nicht beendet“ statt „läuft gerade“.
- App-Version sichtbar (Benutzermenü + Profil, klickbar zum Kopieren). Build erzeugt `version.json` (`build/vite-plugin-version.ts`, Commit via `APP_COMMIT`-Build-Arg). Update-Hinweis prüft `/version.json` alle 5 Min, bei Tab-Fokus und Menüwechsel; deaktiviert in der Lovable-Vorschau.
- nginx: kein Caching mehr für SPA-Unterseiten, `version.json`, SW- und Manifest-Dateien; `immutable` nur für `/assets/`. Chunk-Ladefehler (`vite:preloadError`) lösen einmaligen Reload aus (30-s-Sperre).
- Hinweis: `deploy-prod.yml` wird aus `main` geschützt – die Zeile `APP_COMMIT` muss einmal manuell in `main` übernommen werden, sonst greift der git-Fallback.
- Remote-Support ohne Zeitlimit: Sitzung läuft bis „Beenden“ (Rücksprung). Aufräum-Grenze 24 h (`close_stale_support_sessions`, stündlich), Sitzung endet automatisch, wenn der Mandant Remote-Support ausschaltet (Trigger auf `tenants`).
- Remote-Protokoll für Mandanten unter Hilfe → Remote-Support: Sitzungen mit Dauer und protokollierten Änderungen. `audit_logs.support_session_id` wird in `audit-log-write` automatisch gesetzt.
### Behoben
- Super-Admin → Partner → „Module“ öffnete kein Fenster (Dialog war nicht eingebunden).
- Modul-Kaskade Super-Admin → Partner → Mandant: Tabelle `partner_modules`, Super-Admin pflegt das Partner-Portfolio (Partner-Liste → „Module"), Partner schaltet Module für eigene Mandanten unter Kunde → „Module & Lizenzen". Server-Prüfung in der Edge Function `partner-set-tenant-module`. Bestehende Partner wurden mit den heute genutzten Mandanten-Modulen vorbefüllt.
- Multi-Rollen: Eine E-Mail kann gleichzeitig Mandanten-, Partner- und Super-Admin-Rollen haben; Einladung bestehender Nutzer verknüpft statt abzulehnen.
### Geändert
- Bereichs-Umschalter (Kaufmännisch/Technisch) kontrastreicher, beide Hälften gleich breit.
- Rotes Remote-Support-Banner liegt nicht mehr über dem Inhalt, sondern schiebt ihn nach unten.
- Einladungsfehler zeigen den konkreten Grund.
- Datenbankänderungen und gemeinsam genutzte Stammdaten werden ab sofort immer als offizielle, wiederholbar sichere Migration mitgeliefert. Der Hetzner-Deploy verarbeitet dafür nun auch die automatisch erzeugten Migrationen; Modul-Kaskade und Mennekes-AMTRON-Modell sind beim nächsten Live-Deploy enthalten.

## 2026-09 (Rückblick)
- Partner-Portal und EMS verbunden (AreaSwitcher), „Passwort vergessen?" unter den Anmelde-Button verschoben.
- Produktions-Deploy über GitHub Actions → GHCR → Hetzner eingerichtet.
- Mennekes AMTRON 4Business 760 (11/22 kW) als Ladepunkt-Vorlage.
- Roadmap-System, Super-Admin-Gesamtübersicht Ladepunkte, Impulszähler-Support, zentrale Einheitenformatierung.
- Datenbank-Entlastung: gestaffelte Cron-Tasks, Partitionierung, Delta-Guard, 48h-Rohdaten-Retention.
