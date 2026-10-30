# Änderungsprotokoll (intern)

## v1.18.0 – 30.10.2026
- Monatsübersicht nach Paketen berechnet für umgestellte Kunden UVP und EK je Position und ist dort Grundlage der Monatsrechnung („Positionen“ aufklappbar).
- Mengen werden automatisch gezählt (täglicher Zähllauf): Ladepunkte mit mindestens einem aktiven Tag, Liegenschaften, abgerechnete Ladevorgänge, Pakete taggenau anteilig, Remote-Support, Support je 15 Min., Einrichtung im Aktivierungsmonat.
- Support-Sitzungen über 4 Stunden oder ohne Ende werden nicht automatisch berechnet, sondern als „Prüfen“ markiert.
- Freigegebene Partnerrabatte mindern den EK; Summen je Partner und für Direktkunden.
- Neue Spalte „Änderung zum Vormonat“; Mengenänderungen über 50 % markieren den Entwurf gelb. Nachträgliche Mengen werden im nächsten Lauf nachberechnet.
- Partner sehen Mengenänderungen ihrer Kunden einmal täglich gesammelt unter Abrechnung.
- Neue Kunden werden ab Anlage nach Paketen abgerechnet; Bestandskunden bleiben unverändert.
- Technisch: Migration 0055 (tenant_usage_daily + snapshot_tenant_usage, Cron 00:20, partner_usage_notices, tenant_invoices.usage_review/usage_delta, Trigger: neue Mandanten package_billing=true), _shared/packageUsage.ts + Loader, package-billing-overview und generate-monthly-invoices nutzen dieselbe Rechnung. Snapshots auf Staging für 30 Tage nachgefüllt.

## v1.17.0 – 30.10.2026
- „Paket buchen“ belegt den Preis automatisch aus der Preisliste vor (Direktkunde UVP, Partnerkunde EK); abweichende Preise nur mit Begründung, gekennzeichnet als „individueller Preis“.
- Neu buchbar: „Einrichtung (einmalig)“. Ladepunkte und weitere Liegenschaften werden nicht mehr manuell gebucht, sondern automatisch gezählt.
- Voraussetzungen werden geprüft (Pakete 2/3/5 nur mit Paket 1, Paket 6 nur mit weiterem Paket oder Ladepunkten); ab 7 Liegenschaften Hinweis auf Paket 6.
- Kündigen eines Pakets schaltet nur Module ab, die kein anderes Paket abdeckt und die nicht einzeln freigeschaltet sind.
- Neuer Schalter „Abrechnung nach Paketen“ je Kunde mit Paketvorschlag; gilt ab dem Folgemonat, Modulpreise werden danach nur angezeigt.
- Technisch: Migrationen 0053/0054 (tenants.package_billing*, tenant_modules.individual_grant, license_sales.price_individual/price_reason, set_tenant_package_billing, Schutz-Trigger), license-sale (Begründungspflicht, action=end), generate-monthly-invoices (Modulpreise für umgestellte Kunden aussetzen).

## v1.16.3 – 30.10.2026
- Paketabrechnung Schritt 1 (Preisstammdaten): Ladepunkt-EK 6,00 € (bisher 5,25 €), Remote-Support-EK 112,00 € und für Partner buchbar (bisher kein Partnerpreis). UVP unverändert.
- Preisversionierung: valid_from auf pricing_packages/pricing_unit_prices, Historientabelle pricing_price_history mit Trigger (jede UVP/EK-Änderung protokolliert), „Gültig ab“-Datum in der Katalogpflege; erzeugte Rechnungen bleiben unverändert.
- Tooltip erklärt „Freischaltung Partner“ (einmalige Gebühr je Partner und Paket).
- module_bundles.bookable (Standard false): alte Bundles als „Altvertrag – nicht mehr buchbar“ gekennzeichnet, Neubuchung im Mandanten-Dialog gesperrt, Bestandsbuchungen laufen unverändert weiter.

## v1.16.2 – 30.10.2026
- Fernstart (RemoteStartTransaction) jetzt auch bei Status „Vorbereitung“ (Fahrzeug angesteckt) zulässig, nicht nur bei „Verfügbar“/„Nicht verfügbar“ (ocpp-central).
- OCPP-Protokoll: ELMI-Statuscode 0x0B0B0000 gilt als reine Information und wird nicht mehr rot als Fehler markiert (OcppLogViewer).

## v1.16.1 – 30.10.2026
- Alle OCPP-Ladestatus getrennt dargestellt, insbesondere Vorbereitung, Fahrzeug-/Stationspause, Beendet und Reserviert. Offene Sitzungen überschreiben gemeldete Zustände nicht; Statusanzeige in Listen, Details, Karten, Widgets und Lade-App vereinheitlicht.

Format: neueste Einträge oben. Jede Änderung wird hier und – falls kundenrelevant – in `docs/RELEASE_NOTES.md` festgehalten.

## Unreleased
- v1.16.0: Package-only new contract/invoice choices, per-point charging and additional locations/support; legacy module contracts remain unchanged. Additive current-unit UVP and partner availability, database insert/preflight safeguards, localized manual and version history. Current charging recommendation 8 EUR; existing partner EK 5.25 EUR retained pending specified replacement.
- v1.15.0 validation: authenticated sales for two temporary partner customers, monthly and quarterly proration read back in both invoice paths; identical retry reused sale, changed payload rejected, direct bill RPC denied, partner issuance blocked without legal sender details. Test tenants/drafts removed. Partner PDF issuance awaits real sender data; email/bank debit not performed. Existing sales remain explicit opt-in rather than technical module toggles; new contract entry available in portal/partner customer details. Daily catch-up bounded; initial/follow-up calendar periods non-overlapping.
- v1.15.0: Explicit license sales with once/monthly/quarterly/halfyearly cadence, catalog purchase snapshots, daily due draft generation and transactional billing-event idempotency. Separate partner customer invoices/settings/counters, partner-scoped issuance with immutable snapshots, PDF/email and approved-only SEPA export. Legacy monthly billing excludes explicitly sold positions; issued partner wholesale invoices are no longer overwritten. Existing bookings remain unchanged.
- Rechnungs-PDF: Logo mittig, Leistungszeitraum überlappt nicht mehr.

## [Unreleased]
- Fix: Rechnungs-PDF-Download aus „Abrechnung" robust gegen blockierte Downloads (zusätzlicher Button „Herunterladen" im Hinweis).

## v1.14.0 – 29.10.2026
- Freie Rechnung: Auswahlfeld „Modul/Paket“ je Position füllt Bezeichnung und Preis vor (Kunde: UVP/Standardpreis, Partner: EK/Partnerpreis); Werte bleiben editierbar, keine Schema-/Logikänderung.
- Migration drizzle 0043: aicono_billing_settings (Singleton, Seed AICONO GmbH), aicono_invoice_counter, tenant_invoices.issued_at/due_date/vat_rate/issued_by/emailed_at/emailed_to; Trigger sperren Inhalt/Löschen festgeschriebener Rechnungen; RPCs issue_aicono_invoice (fortlaufend PREFIX-JJJJ-NNNNN) und create_manual_aicono_invoice (nur can_portal_write commercial).
- src/lib/aiconoInvoicePdf.ts (+3 Tests), components/billing/AiconoInvoices.tsx (PDF, E-Mail, freie Rechnung, Absender); Edge Function send-aicono-invoice.
- generate-monthly-invoices überspringt Kunden mit festgeschriebener Monatsrechnung; Lexware-Sammelversand lässt festgeschriebene Rechnungen aus (Einzelversand weiter möglich).

## v1.13.2 – 29.10.2026
- Migration drizzle 0042: Komplex-Etagen idempotent in Platzhalter-Gebäude „Gebäude 1 (bitte umbenennen)“ verschoben (inkl. meters.location_id); Trigger legt Platzhalter bei neuen Komplexen an; RPCs move_floor_to_building, convert_floor_to_building, convert_building_to_floor (SECURITY DEFINER, Admin + gleicher Mandant + gleicher Komplex, atomar).
- ComplexBuildingsCard: Gebäude aufklappbar mit FloorList/AddFloorDialog und Umbau-Bereich; LocationDetail blendet Etagenkarte beim Komplex aus, solange dort keine Etagen hängen.

## v1.13.1 – 28.10.2026
- Migration drizzle 0041: Staging-only Stammdaten idempotent nachgezogen (OCPP-Anleitung Mennekes AMTRON 4Business, neue ELMI-All-in-One-Anleitungen, ELMI-Modelle), Ladepunkt-Zähler-Nachlauf wiederholt.
- deploy-prod.yml: Node 24, checkout/setup-node v5, build-push v6, runs-on ubuntu-24.04. deploy.sh: lesende Stammdaten-Prüfung im Log.
- AGENTS.md: Stammdaten niemals direkt in DB schreiben.

## v1.13.0 – 28.10.2026
- Migration drizzle 0040: floor_rooms.area_m2, floor_rooms.cost_center, locations.allocation_key (area|equal|none, Default area).
- src/lib/roomCostAllocation.ts (+5 Tests): direkt je Raum, Rest = Hauptzähler − Raumzähler, Fehlbetrag nie verteilt.
- RoomCostAllocationCard (Standortseite, bei Komplex inkl. Untergebäude; nutzt get_meter_period_sums_with_fallback + energy_prices), ComplexBuildingsCard (Gebäude hinzufügen/zuordnen/lösen), AddLocationDialog triggerLabel. Raum-Labels „Räume / Abteilungen“.

## v1.12.2 – 28.10.2026
- Migration drizzle 0039: get_power_series_step idempotent neu angelegt (Live-Drift: Funktion fehlte), mit to_regclass-Fallback falls meter_power_readings_5min_bridge/_hourly fehlen.
- fetchPowerSeriesStep: bei RPC-Fehler Fallback auf get_power_series_auto → Energieanalyse nie leer.
- scripts/deploy.sh: `up -d --force-recreate frontend functions`, damit geänderte Edge Functions (u. a. Einladungs-/Reset-Fix v1.11.1) nach jedem Deploy sicher geladen werden.

## v1.12.1 – 26.10.2026
- Fix Rechte eigener Rollen (Live-Befund Bolan/„Endkunde“): Rechte wurden nur gespeichert, nie geprüft. Migration drizzle 0038: get_my_permission_codes() (NULL = uneingeschränkt: Admin oder ohne custom_role_id) und has_custom_permission(); dashboard_widgets UPDATE/DELETE erfordern dashboard.customize. Neu useMyPermissions (ROUTE_PERMISSION_MAP), eingebunden in useModuleGuard (Menü + ModuleGuard); Menügruppen sichtbar, wenn ein Unterpunkt erlaubt ist; DashboardCustomizer nur mit dashboard.customize. 6 Vitest-Tests.
- CustomWidget: Tacho/KPI im Tagesmodus nutzt jüngsten Rohwert aus meter_power_readings (≤15 Min alt), Abfrage alle 15 s, nicht im Hintergrund-Tab.
- Offen: Energieanalyse leer auf Live (Ursache unbestätigt, Prüfbefehle an Nutzer), E-Mail-Adresse ändern, Inbetriebnahme-/Abnahmeprotokoll.

- ELMI bestätigt Kapitel 6.1 (korrigiertes Protokoll v1.5): Entladen = negativer Sollwert, -10 kW = 0xFFFE7960, Schreiben mit FC 0x10, Skalierung 0,1 W. Implementierung in _shared/elmiAio.ts entsprach bereits dieser Fassung; keine Codeänderung, bestehende Tests decken die Werte ab.

## v1.12.0 – 20.10.2026
- ELMI All-in-One: Migration drizzle 0037 – energy_storages (device_template, charge_point_id, control_mode, allow_self_discharge, allow_grid_discharge [per Trigger fest false, vorbereitet für Peak-Shaving], min_setpoint_kw, setpoint_integration_id, setpoint_control_uuid, last_setpoint_*), solar_charging_config (storage_id, storage_priority), Seeds charger_models „ELMI Power All-in-One 180/360“ und wallbox_modbus_templates „ELMI Power / All-in-One“ (Protokoll v1.4).
- _shared/elmiAio.ts: Register-Codierung (32 Bit Big-Endian, 0,1) und Sollwertregel (Netz → 0, < Mindestleistung = 0, Begrenzung, nie Netzentladung) + 10 Vitest-Tests.
- solar-charging-scheduler: setzt Speicher-Sollwert minütlich über loxone-api executeCommand auf virtuellen Eingang; storage_first reduziert EV-Überschuss.
- UI: StorageControlDialog (Energiehandel → Speicher), Speicherauswahl + Priorität in GroupSolarChargingConfig; Handbuch-Abschnitt mit Loxone-Anleitung (4 Sprachen).
- Daten (Staging): Stadt Steinfurt „Gaszähler Hausanschluss“ is_pulse_meter=true; 5-Min-/Stundenwerte 22.09.–04.10. aus meter_cumulative_readings linear neu berechnet (Tagessummen = Loxone-Tageswerte). Ab 13.10. keine Zählerstände vorhanden → Tagessummen dort aus Momentanwerten zu hoch, Neuberechnung offen.
- Offen: Rückfrage an ELMI zu Kapitel 6.1 (Vorzeichen/Funktionscode beim Schreiben).

## v1.11.2 – 20.10.2026
- Impulszähler-Rollout: LiveValues ignoriert für meters.is_pulse_meter den Broadcast-Momentanwert und zeigt den letzten 5-Min-Wert (aus Zählerstandsdifferenz, Worker v1.18) mit Label „Mittelwert (Impulszähler)“. EditMeterDialog: Hinweis-Badge „Impulszähler: bitte Zählerstand mappen“ bei Gas/Wasser mit Quelleinheit m³/h ohne Impulszähler-Schalter. Keine Schemaänderung.

## v1.11.1 – 14.10.2026
- Fix Einladung „Link abgelaufen“: invite-tenant-admin, invite-partner-admin, partner-invite-member und send-auth-email (password_reset) verschickten den einmaligen Recovery-Link direkt; Mail-Scanner (z. B. Defender) verbrauchten ihn vorab. Neu _shared/inviteLink.ts (createSafeInviteLink): Mail enthält nur /accept-invite?t=<invite_tokens.id>, Recovery-Link entsteht erst beim Klick (activate-invited-user getInviteLink, redirectFromStoredLink). Ältere offene Tokens derselben E-Mail werden gesperrt. Fallbacks auf hub-smart-energy.lovable.app entfernt, Ziel über safeAuthRedirect.
- Neu Edge-Function admin-set-temp-password: Startpasswort + must_change_password; Rechte serverseitig (Portal-Admin alle; Kunden-Admin eigener Mandant; Partner-Admin/can_manage_members eigene Mitglieder; Partner-Admin Nutzer eigener Kunden; nie eigenes Konto; Portal-Admin-Ziel nur durch Portal-Admin). Sperrt offene invite_tokens, setzt user_invitations.accepted_at, schreibt audit_logs (action set_temp_password, ohne Passwort).
- UI: SetTempPasswordDialog/Button in SuperAdminTenantDetail (Nutzer + Einladungen), UserManagement, SuperAdminUsers, PartnerMembers. AcceptInvite mit mode=reset. Reset-Mail-Text: 7 Tage statt 60 Minuten.

## v1.11.0 – 13.10.2026
- Migration drizzle 0036: get_power_series_step(meter_ids, start, end, step 5/15/60/1440) – feste Auflösung, max. 400 Tage, gleiche Zugriffsprüfung wie get_power_series_auto.
- Energieanalyse: Auflösung „15min“, Abfrage über fetchPowerSeriesStep (Chunks < 1000 Zeilen, 4 parallel) statt Server-Automatik.
- useGatewayLivePower: 10-s-Poll (nicht im Hintergrund) statt 5 min.
- Dashboard: Größen 1/6, 1/4, 3/4; neues Widget charge_station (ChargeStationWidget, 15-s-Poll).
- shelly-periodic-sync: sensor_missing nur bei > 10 min ohne Messwert, Zählername in Meldung, Auto-Resolve.

## v1.10.0 – 13.10.2026
- Migration drizzle 0035: meters.source_charge_point_id (unique), Trigger sync_charge_point_meter (Anlage/Umbenennung/Liegenschaft, Archivierung bei Löschung), linked_meter_id gesetzt; Backfill Zähler + Historie aus ocpp_meter_samples (5-Min-Leistung, stündlicher Zählerstand). Staging: 2 Ladepunkte mit Liegenschaft angebunden, 5 ohne Liegenschaft (kein Zähler möglich).
- UI: Badge „Ladepunkt“ in Zählerlisten, Name im Zählerdialog gesperrt, Device-Tree erkennt Ladepunkt-Zähler über source_charge_point_id.

## v1.9.0 – 09.10.2026
- Daten: 20 nicht übergebene Rechnungsentwürfe storniert (status voided); 7 Lexware-Rechnungen unverändert.
- Migration drizzle 0034: tenant_invoices.partner_id/invoice_kind/source_ref (Unique auf aktive source_refs), partners.lexware_contact_id, pricing_packages.partner_unlock_fee; Trigger create_setup_invoice auf tenants (Einrichtung aus pricing_unit_prices.setup); RLS: Mandant sieht keine an Partner adressierten Rechnungen, Partner nur an sich adressierte.
- _shared/invoiceDrafts.ts (proRataAmount, createOneTimeDraft); package-book erzeugt Anteilsrechnung; super-admin-set-partner-module erzeugt Freischaltrechnung je Paket (Anker: erster Kunde des Partners).
- generate-monthly-invoices: Paketkunden über Paketkatalog (UVP bzw. EK an Partner, je Partnerkunde ein Entwurf), Altpreis-Kunden unverändert; Einmal- und Partnerrechnungen werden nie zusammengeführt.
- lexware-api: Partner als Rechnungsempfänger; alle Positionstypen werden übertragen (vorher fehlten Rabatt-/Ladepunkt-/Vorkassezeilen).

## Unreleased
- Fix Auth-Mail-Links: Bestätigungs- und Magic-Links führen zurück in die anfragende App (safeAppRedirect, ALLOWED_APP_PATHS /, /ev, /te, /mein-sharing); Passwort-Links bleiben auf /set-password, merken sich die Herkunfts-App als ?next= (Whitelist) und SetPassword navigiert nach dem Speichern dorthin zurück. Betroffen: _shared/appOrigin.ts, send-auth-email, ChargingApp, TenantEnergyApp, SetPassword.
- AICONO Portal → Modulpreise: Karte „Monatliche Standardpreise" ausgeblendet; Altpreise bleiben für Bestandskunden in der Abrechnung aktiv.
- Daten (Migration drizzle 0032): d.markus@bright-networks.de als Partner-Admin der AICONO Partner GmbH (idempotent, per E-Mail aufgelöst; greift auf Live nur, wenn das Konto dort existiert).
- Daten (Migration drizzle 0033): Heimatmandant BrightNetWorks für d.markus@bright-networks.de (nur wenn bisher leer), damit der EMS-Bereich verfügbar ist.
- Fix GettingStarted: „Abbrechen“/Abschluss lädt den Mandanten neu und setzt einen Sitzungs-Merker; Index leitet nicht mehr mit veralteten Mandantendaten zurück in den Assistenten (Umleitungsschleife).

## v1.8.1 – 09.10.2026
- Portal-Navigation: BadgeCheck für aktive Lizenzen, Handshake für Gain-Sharing; gemeinsamer Einstieg „Module & Bundles“ (Layers) mit Reitern Modulpreise (Tags) und Bundles (Package). URLs, Berechtigungen und Abrechnung unverändert.

## v1.8.0 – 09.10.2026
- Neue Preislogik Basis + 6 Pakete (Migration 0030): `pricing_packages`, `pricing_package_modules`, `pricing_unit_prices`, `module_catalog_flags`, `tenant_package_bookings` mit RLS (Lesen angemeldet, Schreiben `can_portal_write(commercial)`).
- `src/lib/packagePricing.ts` (Preisrechnung, Abhängigkeiten, Rabatt/Aufschlag) mit Akzeptanztests (31 €, 242/181 €, 678/506 €).
- Edge Functions `package-book` (schaltet Modul-Codes über portal-/partner-set-tenant-module) und `package-billing-overview` (nur lesend).
- UI: Paketkatalog in Modulpreisen, Paket-Angebotsrechner im Angebotsbaukasten (hidden/on_request-Module ausgeblendet), Paketbuchung in Kundendetail (Portal + Partner), Monatsübersicht in Abrechnung (Portal + Partner).
- Unverändert: `generate-monthly-invoices`, Inhalte `module_prices`, ModuleGuard, alle EMS-Funktionen. Bestandskunden ohne Paketbuchung = „Altpreis“.

## v1.7.2 – 08.10.2026
- Passwort-Mails: `send-auth-email` prüft `redirectTo` serverseitig gegen Positivliste (`_shared/appOrigin.ts`: staging/ems-pro, Pfade `/set-password`, `/mein-sharing/set-password`); Vorschau-/Fremdadressen werden ersetzt.
- Profil: direkte Passwortänderung (aktuelles Passwort prüfen, dann `updateUser`); E-Mail-Weg bleibt.
- Gemeinsame Passwortregeln `src/lib/passwordPolicy.ts` (8 Zeichen, Buchstabe + Ziffer, alt ≠ neu) in Profil, SetPassword, SharingSetPassword; Schutz vor geleakten Passwörtern (HIBP) aktiviert.

## v1.7.1 – 07.10.2026
- Portal-Rollen: Teammitglieder-Tabelle (Rollen-Badges, Status Aktiv/Eingeladen/Deaktiviert, letzter Login) und Dialog „Rollen bearbeiten“. Neue RPCs `portal_staff_overview` und `portal_set_user_roles` (nur super_admin, ändert nur Portal-Rollen), Trigger `guard_last_portal_admin` schützt DB-seitig vor Selbstentzug und Entfernen des letzten Portal-Admins (Migration 0026).
- Audit: Trigger `audit_portal_role_change` schreibt jede Vergabe/Entzug einer Portal-Rolle mit Bearbeiter und Zeitstempel in `audit_logs` (entity_type `portal_role`, Migration 0027); Anzeige „Änderungsprotokoll“ unter Portal-Rollen.

## v1.7.0 – 07.10.2026
- AICONO Portal → Rollen: Spalte „Admin“ in der Portal-Benutzerliste; Admins vergeben/entziehen Admin, Kaufmännisch und Technisch. Selbstentzug und Entzug des letzten Admins gesperrt.
- Partner-Rabatt-Anfragen: Partner-Admins fragen unter Partner-Portal → Abrechnung Rabatte für ein oder mehrere Module an (ein Kunde oder alle Kunden). AICONO Portal → Abrechnung: Freigabe ganz/teilweise oder Ablehnung mit Notiz; Freigabe legt Kundenrabatte an.

## v1.6.9 – 2026-10-07
- Einladungslink: `activate-invited-user` verbraucht den Token nicht mehr beim Klick, sondern erzeugt bei jedem Klick einen frischen Recovery-Link; neuer Modus `consumeInvite` (nach `updateUser` in SetPassword, E-Mail-Abgleich). Fehlercodes `used|expired|not_found` mit klaren Texten und „Passwort vergessen“-Knopf (`/auth?forgot=1`).
- Link-Domain: `resolveOrigin` lässt nur `*.aicono.org` und die veröffentlichte App zu, Vorschau-Hosts werden verworfen (Fallback `APP_URL`).
- Neuer Modus `resendInvite`: neuer 7-Tage-Link, alte offene Links werden gesperrt, Rollen bleiben unangetastet (Kunden-Admin nur eigene Organisation). Knopf im AICONO Portal → Benutzer; Kunden-Benutzerverwaltung nutzt denselben Modus.
- „Profil & Passwort“ im Portal-Benutzermenü und in der Partner-Seitenleiste.

## v1.6.8 – 2026-10-07
- Ladeinfrastruktur → Abrechnung: CSV-Export in den Reitern „Ladevorgänge“ (nach Nutzern bzw. Abrechnungsgruppen) und „Rechnungen“. Exportiert alle gefilterten Zeilen (Zeitraum + Suche, nicht nur aktuelle Seite), UTF-8-BOM, Semikolon, deutsches Zahlenformat. Helper `src/lib/chargingCsvExport.ts`.

## v1.6.7 – 2026-10-07
- Automatische Lückenfüllung für Shelly Cloud: `shelly-api` Aktion `backfillRange` (nur intern) liest `/v2/statistics/power-consumption/em-3p|em-1p` (stündliche Wh je Phase, Europe/Berlin), berechnet mittlere Netto-Leistung je Stunde und schreibt fehlende 5-Min-Buckets mit `source='shelly_cloud_backfill'` (ignoreDuplicates – Live-Werte bleiben). `gap-backfill-scheduler` kennt jetzt `shelly_cloud`. Migration 0024 plant `gap-backfill-hourly` (Minute 23, versetzt) – der Scheduler war bisher gar nicht eingeplant.

## v1.6.6 – 2026-10-07
- CustomWidget: Die im Widget konfigurierte Einheit (W/kW/MW bzw. Wh/kWh/MWh) hat jetzt Vorrang vor der Zähler-Einheit. Werte werden systemweit in kW/kWh gespeichert und für die Anzeige korrekt umgerechnet; W/Wh ganzzahlig, kW/MW/kWh/MWh mit 2 Dezimalstellen (deutsches Zahlenformat). Betrifft Tacho, KPI, Tabelle, Tooltip und Tages-/Periodenverläufe. Behebt: nach STRG+F5 falsche Werte trotz gespeicherter kW-Konfiguration.

## v1.6.5 – 2026-10-07
- Ursache „Werte nach 15 min weg“: Shelly-Rohwerte wurden nie in `meter_power_readings_5min` verdichtet; der Tagesverlauf zeigte nur die letzten 15 min Rohdaten. Neue Funktion `aggregate_raw_power_to_5min` (Migration 0023, inkl. Nachberechnung der letzten 7 Tage), aufgerufen am Ende von `shelly-periodic-sync`. Fremdquellen (Loxone/Bridge) werden nicht überschrieben.
- HTTP 429: `gateway-periodic-sync` ruft Shelly nicht mehr doppelt ab; `shelly-api` bedient Browser-`getSensors` aus frischem Snapshot (<3 min), wiederholt bei 429 einmal, cached v2-Gerätenamen 6 h; Sensor-Historie nur noch bei Server-Abholung.
- CustomWidget: Tacho/KPI im Tag-Zeitraum = letzter Messwert statt Summe; Leistungsverlauf wird bei Zählereinheit W/MW aus kW umgerechnet.

## v1.6.4 – 2026-10-06
- Migration 0022: Leserechte für `tenant_modules` (Partner-Mitglieder eigener Kunden) und `partner_modules` idempotent sichergestellt, GRANTs, Partner-Portfolio aus aktiven Kundenmodulen ergänzt.
- Partner-Portal zeigt Lesefehler bei Modulen statt „0 aktiv“; Portal-Dialog „Module für Partner“ übernimmt nur erfolgreich geladene Daten.

## v1.6.3 – 2026-10-06
- Widgets: Hinweis „keine gespeicherten Werte“ je Zähler statt leerer Grafik.
- Shelly-Abholung meldet Zähler ohne passenden Sensor als Integrationsfehler (`sensor_missing`).
- Neue Edge Function `portal-set-tenant-module`: Portal-Admins setzen Kunden-Module direkt, Partner-Portfolio wird ergänzt, Audit-Log.
- Migration 0021: `audit_logs.entity_label`/`support_session_id` idempotent nachgeliefert (Änderungsprotokoll auf Live).
- Live-Prüfung per Terminal-Befehl im Chat (Diagnose-Datei wieder entfernt; Terminal-Befehle künftig immer direkt im Chat).

## Unreleased
- Live-Fix: Portal-Zugang fällt auf eigene Rollen zurück, falls `portal_roles` in der DB fehlt; Migration 0020 setzt Heimat-Mandant von h.verst auf ESB GmbH.

## 2026-10-06 – v1.6.2
- Benutzerliste: falsches `partner_members.role` durch `partner_role` ersetzt; Abfragefehler werden nicht mehr als leere Liste angezeigt.
- Sichtbare Rollenbezeichnungen Portal-Admin, Partner-Admin und Kunden-Admin vereinheitlicht; Rollenwerte, Adressen und Sicherheitsprüfungen bleiben unverändert.
- Handbuch (DE/EN/ES/NL), Versionsverlauf und Staging-Roadmap aktualisiert.

## 2026-10-07
### Neu
- Benutzerverwaltung (Portal): Partner-Mitgliedschaften werden jetzt unter dem Nutzernamen angezeigt („Partner-Admin: <Name>" / „Partner-Mitglied: <Name>"); Löschdialog warnt, wenn der Nutzer Partner-Mitglied/Admin ist.
### Behoben
- v1.6.1: Roadmap-Menü/-Route nur im Staging (`isStagingEnvironment`), neuer Status `waiting` („Wartet auf Nutzer“); Board mit offenen/erledigten Punkten abgeglichen (Daten, Staging).
- „Database error deleting user“ (nrgy-hub@web.de): Konto war einziger Partner-Admin von „AICONO Partner GmbH“; Trigger `prevent_last_partner_admin_removal` blockierte die Lösch-Kaskade. Trigger lässt jetzt Systemkontext (Konto-Löschung) und Portal-Admins durch; normale Partner-Admins bleiben geschützt (Migration 0019).
- Eigentliche Ursache „Database error loading user“: gesperrte Konten hatten `banned_until = infinity`, das der Auth-Dienst nicht lesen kann → Löschen/Laden gesperrter Konten scheiterte. Sperre setzt jetzt 2999-12-31, Bestand umgestellt (Migration 0018). Zweitkonto h.verst+partner: Super-Admin entzogen, gesperrt, Profil-E-Mail korrigiert (Daten, Staging).
- Benutzer löschen scheiterte („Database error loading user“): `legal_pages.updated_by` verwies ohne ON DELETE auf auth.users und blockierte das Löschen von Konten, die Rechtstexte bearbeitet hatten. Jetzt ON DELETE SET NULL (Migration 0017); `delete-user` mit aktuellen Schutzregeln neu ausgerollt.
### Neu
- v1.6.0: AICONO Portal. Enum `app_role` + `portal_commercial`/`portal_technical`; SQL `portal_roles`, `is_portal_member`, `can_portal_read/write` (Bereiche overview/commercial/technical/roadmap/admin); zusätzliche Policies `portal_read`/`portal_write` auf Kunden-, Abrechnungs- und Technik-Tabellen (Migration 0015). `guard_privileged_roles` schützt auch Portal-Rollen (0016). `SuperAdminWrapper` prüft Bereich je Adresse (Kein Zugriff / Nur Ansicht); Seiten nutzen `usePortalMember`; Seitenleiste gruppiert; `PortalStaffCard` unter Portal-Rollen. super_admin = Portal-Admin, bestehende Policies/Edge Functions unverändert (Edge Functions mit reiner super_admin-Prüfung bleiben Portal-Admins vorbehalten).
- v1.5.0: Einheitspreise – `useModulePrices` liefert für alle Varianten `standard_price`/`standard_charge_point_price_monthly` bzw. Partnerpreis; Preismaske nur noch Partner-Einkauf + Standardpreis; Mitglied/Kommune-Schalter im Mandanten entfernt; alte Spalten DEPRECATED (Migration 0014). `tenant_invoices.document_type` (`invoice`/`subscription_notice`); generate-monthly-invoices: keine 0-€-Modulzeilen, 0-€-Ergebnis → Abo-Beleg ohne Rechnungsnummer; lexware-api und SEPA überspringen Abo-Belege; Rechnungsliste mit Filter/Kennzeichnung.
### Behoben
- v1.4.2: Neue Edge Function `remove-user-from-tenant` (Tenant-Admin/Partner-Admin/Super-Admin, Selbst- und Letzter-Admin-Schutz, Audit) ersetzt `delete-user` in Tenant-Benutzerliste und Super-Admin-Mandantendetail; Konto + super_admin/partner_members bleiben. PartnerTenants: eigener Tenant öffnet direkt (keine Impersonation), 403 verständlich. PartnerModulesDialog: optimistisch, 15-s-Timeout, Rollback, Refetch.
- v1.4.1: EditMeterDialog leerte beim Öffnen Gateway/Sensor, solange Integrationen noch luden (Race) → Speichern löschte `location_integration_id`/`sensor_uuid`, keine Messwerte. Effekt wartet jetzt auf Laden und leert nie automatisch; fehlendes Gateway wird nur angezeigt. MeterManagement: „Keine Zähler angelegt“ nur, wenn auch keine Gateway-Zähler existieren.
### Neu / Behoben
- v1.4.0: Widget `charge_point_power` (letzter OCPP `Power.Active.Import` je Ladepunkt, 30 s Polling) + Knopf „Im Dashboard anzeigen“ in ChargingPoints. `loadProfileExport.ts`: Jahreslastgang 15 min (7-Tage-Abschnitte über `get_power_series_auto`) als Excel in EnergyAnalysis. EditMeterDialog: fehlende Integration/Sensor wird erkannt und muss neu gewählt werden. Integration-Unlink löscht verwaiste Integration; Integrationen-Seite bietet Löschen für verwaiste Einträge. Remote-Ende kehrt in Ausgangsbereich (Partner/Super-Admin) zurück. Neue Edge Function `super-admin-set-partner-module` (Super-Admin-Prüfung serverseitig) ersetzt direkte RLS-Schreibzugriffe auf `partner_modules`.

## 2026-10-06
### Behoben
- v1.3.2: RemoteSupportHistory übergab `started_at` mit `+00:00` im PostgREST-`or`-Filter (→ Leerzeichen, 22007, falscher Hinweis „nicht eingerichtet“); jetzt ISO-`Z`. Hinweis nur noch bei fehlender Tabelle/Spalte. Ladepunkt-Übersicht (Tenant + Super-Admin): offene Session zählt nur noch als belegt, wenn der Stecker nicht „Available“ meldet. charge-point-auto-reboot schließt offene Sessions >2 h ohne Energie, wenn Stecker „Available“ meldet (`stop_reason=stale_auto_close`, 0 kWh).

## 2026-10-05
### Behoben
- v1.3.1: support-session-impersonate verlangt `tenants.remote_support_enabled` (auch für Super-Admins, sonst 403). Trigger beendet offene Support-Sitzungen und widerruft Support-Sessions, wenn der Kunde Remote ausschaltet. `accept_own_invitations()` markiert Einladungen beim Anmelden als angenommen; Backfill für bereits angemeldete Konten; Benutzerliste blendet Einladungen registrierter Personen aus. Migration 0013.

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
- Sicherheit: Wallbox-/Gateway-Befehle nur mit Geräten des eigenen Mandanten; Updates an Ladepunkten, Ladevorgängen, Rechnungen, Gateway-Befehlen und Wallboxen können Datensätze nicht mehr in fremde Mandanten verschieben.
- Sicherheit: E-Mail-Prüfung verrät Kunden-Admins keine Konten außerhalb der eigenen Organisation.
- Sicherheit: Alte HTTP-Schnittstelle der Ladepunkt-Zentrale nur noch mit Backend-Secret; Fernbefehle für unbekannte Ladepunkte abgewiesen.
- Sicherheit: Rechnungsdateien (invoice-files) nur noch im Ordner des eigenen Mandanten lesbar/beschreibbar/löschbar.
