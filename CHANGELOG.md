# Änderungsprotokoll (intern)

Format: neueste Einträge oben. Jede Änderung wird hier und – falls kundenrelevant – in `docs/RELEASE_NOTES.md` festgehalten.

## 2026-10-04
### Sicherheit
- Paket 2c: ocpp-persistent-api prüft Header `x-ocpp-secret` gegen `OCPP_BACKEND_SECRET` (aktiv, sobald gesetzt); OCPP-Server sendet ihn aus `.env`. Anleitung: docs/ocpp-persistent-server/UPDATE-OCPP-BACKEND-SECRET.md.
- Paket 2b: Einladungen (invite-tenant-admin, activate-invited-user) erlauben Tenant-Admins nur noch die eigene Organisation. 27 bisher ungeschützte Server-Funktionen verlangen jetzt internen Schlüssel oder Anmeldung; Rechnungs-/Lexware-Funktionen zusätzlich Admin-, Partner-Admin- oder Super-Admin-Rolle (`requireInternalOrUser`).
- Paket 2a: QR-Druckansichten (Ladepunkt, Scanner) escapen HTML; OCPP-Tag-Prüfung escaped ILIKE-Platzhalter (%/_); Ad-hoc-Testzahlungen nur mit Modul `adhoc_payment`; Gemeinschafts-Tarife nur noch durch Tenant-Admins/Super-Admins änderbar (Migration 0010).
- Paket 1: 16 reine Cron-Funktionen (u. a. peak-shaving-scheduler, dlm-, power-limit-, cheap-/solar-charging-scheduler, automation-scheduler, charge-point-auto-reboot, gateway-/loxone-/brighthub-periodic-sync, send-scheduled-report) prüfen jetzt den internen Service-Schlüssel (`_shared/internalAuth.ts`); anonyme Aufrufe → 401. Cron-Läufe nach Deploy verifiziert.
### Neu
- v1.3.0 – Ladepunktpreis nur noch als Unterpunkt von `ev_charging` (neue Spalten partner_/standard_/industry_standard_charge_point_price_monthly; bisheriger Wert als Standard übernommen, andere Module auf 0). Kundenseite: Unterzeile + Rabattspalte („+ Rabatt“), Karte „Ladepunkt-Abrechnung“ entfernt. `tenant_module_discounts`: bundle_id, duration_value/unit, payment_mode (monthly/prepaid/one_time), one_time_amount, invoiced_at; Leserecht auf gebuchte Bundles für Partner/Tenant. `generate-monthly-invoices`: Bundle-Rabatt auf Bundle-Summe, Vorkasse/Einmalzahlung einmalig berechnet und Laufzeit-Monate übersprungen. `partner-set-tenant-discount`: Bundle-Portfolio-Prüfung. Migration `0009_cp_sub_prices_and_bundle_discounts.sql`.
### Fix
- v1.2.1 – Einladungen: `findAuthUserByEmail` (invite-conflict.ts, auch check-email-availability) nutzt neue RPC `get_auth_user_by_email` (SECURITY DEFINER, nur service_role) statt `listUsers(perPage:1000)`, das der Auth-Dienst ablehnte → „Benutzer-Lookup fehlgeschlagen“. Fallback paginiert mit 50. Migration `0008_get_auth_user_by_email.sql`.
### Neu
- v1.2.0 – Abrechnung: `module_prices.charge_point_price_monthly`/`industry_charge_point_price_monthly` und `tenant_modules.charge_point_price_override` (Pauschale + Preis je aktivem Ladepunkt frei kombinierbar). Neue Tabelle `tenant_module_discounts` (percent/absolute, valid_from/valid_until, RLS: Super-Admin alles, Partner/Tenant-Admin lesen) und RPC `get_active_charge_point_counts` (Heartbeat ≤ 30 Tage, berechtigungsgeprüft). `generate-monthly-invoices`: Zeilen `module_charge_points` (Menge × Preis, aktiv = Heartbeat im Abrechnungsmonat) und `discount` (günstigster überlappender Rabatt, gedeckelt). Edge Function `partner-set-tenant-discount` (Partner-Admin, eigener Mandant, Portfolio-Check). UI: Modulpreise-Spalte „je aktivem Ladepunkt“ mit Gesamtvorschau, Mandanten-Detail (Super-Admin/Partner) mit Ladepunkt-Abrechnung + Vorschau und Rabattverwaltung; Monatssumme inkl. Ladepunkte/Rabatt. Migration `0007_billing_charge_point_price_and_discounts.sql`. Handbuch ergänzt.
- Semantische Versionierung: sichtbare Version = `package.json` `version` (MAJOR.MINOR.PATCH, aktuell 1.1.0), Anzeige „v1.1.0“; Commit-Hash nur noch im Tooltip/Kopie (`formatAppVersionDetails`) und in `version.json` für die Update-Erkennung.
- Benutzerhandbuch nachgezogen: Energieanalyse (Zeitraum pro Grafik, Analytics-Studio-Energieanalyse, Link teilen), Ladepunkte („Status abfragen“), neues Kapitel „Konto, Rollen & Support“ (Bereichswechsel, Modul-Freigabe durch Partner, Remote-Support, Sperren/Löschen, Version & Updates); DE/EN/ES/NL.
- Hilfeseite: Versionsanzeige oben rechts zeigt jetzt die echte Build-Version (`formatAppVersion`) statt der festen Konstante „1.1.0“; Versionsverlauf um Eintrag v1.1.0 (2026-10-04) mit den Oktober-Neuerungen ergänzt (Übersetzungen DE/EN/ES/NL).
- `profiles.company_name` nur noch durch Tenant-Admin (eigener Mandant) oder Super-Admin änderbar (Trigger `guard_profile_privileged_columns`, Migration 0006). Firmenname des Mandanten (`tenants.name`) war bereits auf Tenant-Admin/Partner-Admin/Super-Admin beschränkt. GettingStarted speichert Ansprechpartner getrennt vom Firmennamen.
- Rechte-Audit: Trigger `guard_profile_privileged_columns` – nur Super-Admins ändern `tenant_id`, `email`, `user_id` eines Profils; Tenant-Admins nur `custom_role_id` (nur Rollen des eigenen Mandanten, nicht bei sich selbst) und Sperre im eigenen Mandanten; normale Nutzer nur Name/Firma; Self-Insert mit Mandant/Rolle blockiert. `email_templates` schreibend nur noch für Admins (vorher jeder Mandanten-Nutzer). Migrationen 0004/0005.
- Echte Kontosperre: Trigger `sync_profile_block_to_auth` auf `profiles.is_blocked` setzt `auth.users.banned_until` (infinity/NULL), löscht Sessions/Refresh-Tokens und erlaubt Änderung nur Super-Admin bzw. Tenant-Admin des eigenen Mandanten (vorher konnte ein Nutzer sich über die Own-Profile-Policy selbst entsperren). Bestehende Sperren nachgezogen. Zusätzlich Client-Check in `useAuth` (gesperrt → Abmelden). Migration `drizzle/migrations/0003_real_account_block.sql`.
- Bereichs-Umschalter kein Overlay mehr: `AreaSwitcher floating` rendert jetzt per Portal in einen Slot als erstes Kind von `<main>` (eigene Kopfleiste rechts, im Seitenfluss) statt `fixed z-50` über dem Inhalt – verdeckt keine Header-Elemente (z. B. „Aktualisiert“, Liegenschaftsfilter) mehr.
- Bereichs-Umschalter einheitlich fest oben rechts (Portal via `AreaSwitcher floating`) in EMS, Partner-Portal und Super-Admin; Kapseln aus den Seitenleisten entfernt. Staging: `super_admin` für Haupt-Login h.verst@esb-metelen.de ergänzt.
- Super-Admin → Rollen & Rechte: Button „Super-Admin-Rolle entziehen“ mit Bestätigungsdialog; letzter Super-Admin geschützt; Doppel-Einträge in `user_roles` werden je Person zusammengefasst. Serverseitig durch RLS + `guard_privileged_roles`, Protokoll via `user_role_audit_log`.
- Super-Admin → Benutzer: Löschen-Button (Mülleimer) mit Bestätigungsdialog über `delete-user`; Schutz gegen Selbstlöschung und Löschen des letzten Super-Admins (auch serverseitig in `delete-user`). Rollenanzeige zeigt jetzt die höchste Rolle statt der zufällig ersten Zeile.
- Dashboard: Jede Grafik hat eigenen Zeitraum/Offset (`WidgetPeriodScope` überschreibt nur Zeitraum im Filter-Kontext; Liegenschaft bleibt global), gespeichert in `dashboard_widgets.config.period/offset`. Button „In Analyse öffnen“ in Energieverlauf und eigenen Widgets.
- Neue Seite Energieanalyse `/analytics-studio/analyse` (Modul `analytics_studio`): Mehrfachauswahl Messstellen, Achse je Einheit, Linie/Balken/Fläche/gestapelt, Schnellwahl + freier Zeitraum, Auflösung 5 Min–Monat, Vergleich Vorperiode/Vorjahr/frei, Heatmap Stunde×Tag, Dauerlinie mit Grundlast/Spitze, Kennzahlen, Bezug m² NGF / Heizgradtage (Open-Meteo-Archiv), CSV/Excel. Gesamter Zustand Zod-validiert base64url in `?a=`; Daten nur via `get_power_series_auto`/Sensor-Aggregate mit Tenant-Filter.
- Ladepunkte: Fernfunktion „Status abfragen“ (`ocpp-central` Endpoint `TriggerStatus` → OCPP `TriggerMessage(StatusNotification)`). Stündliche Plausibilitätsprüfung in `charge-point-auto-reboot`: Stecker mit Lade-/Belegt-Status > 2 h, Wallbox online, keine aktive Session → Statusmeldung anfordern (kein blindes Überschreiben).
- Build-Fix: `vite-plugin-version.ts` nach `vite-plugins/` verschoben (Ordner `build/` wird global von git ignoriert, Datei fehlte im Build).
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

## [Unreleased]
- Sicherheit: gateway-ingest prüft Zähler-Eigentum; Gateways ohne Mandant und fremde tenant_id bei Schneider-Push werden abgewiesen.
