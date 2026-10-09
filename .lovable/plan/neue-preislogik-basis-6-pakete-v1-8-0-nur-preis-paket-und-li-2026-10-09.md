# Neue Preislogik: Basis + 6 Pakete (v1.8.0) – nur Preis-, Paket- und Lizenzschicht

## Leitplanken (aus deiner Vorgabe)
- Keine EMS-Funktion, keine Messdaten-, Zähler-, Standort- oder Ladepunkt-Tabelle, kein Menü und keine Route der Funktionsmodule wird geändert.
- Die 29 Modul-Codes bleiben unverändert.
- Keine destruktiven Migrationen. Es kommen nur neue Tabellen hinzu, vorhandene Spalten werden nur noch als „veraltet“ markiert und nicht gelöscht.
- **Bestandskunden (deine Wahl: einfrieren):** Ihre Freischaltungen bleiben unverändert. Ihre Monatsrechnung läuft weiter nach der heutigen Modulpreisliste. Diese Liste wird nicht überschrieben.
- **Umfang (deine Wahl: erst Anzeige):** Die automatische Monatsrechnung (`generate-monthly-invoices`) bleibt unverändert. Paketpreise erscheinen zunächst in der Preisliste, im Angebotsbaukasten und in der Monatsübersicht je Partner. Die Umstellung der Rechnung folgt in einem zweiten Schritt.
- **Ladevorgänge zu 0,10 € (deine Wahl):** Es zählen Ladevorgänge, die in einer AICONO-Laderechnung stehen, plus bezahlte Ad-hoc-Zahlungen. Interne Ladevorgänge zählen nicht.

## Was gebaut wird
1. **Neuer Preiskatalog.** Basis und die Pakete 1–6 mit UVP und Partner-EK, Mengenpreise (weitere Liegenschaft, Ladepunkt, Ladevorgang), Einrichtung 200 €, Support 25 € je 15 Minuten, Remote-Support 149 € ohne Rabatt. Alle Werte sind im AICONO Portal (Kaufmännisch) pflegbar.
2. **Ausblenden statt Löschen.** reporting, automation_building und task_management erscheinen nicht mehr in Preislisten und im Angebot. tenant_electricity, energy_sharing, ppa_onsite, ppa_offsite und gain_sharing werden als „auf Anfrage“ angezeigt. Technisch bleibt alles erhalten.
3. **Preisanzeige.** Nur noch UVP („unverbindliche Preisempfehlung“) und Partner-EK. Die Spalten für Kommunen und Industrie werden ausgeblendet, die Daten bleiben erhalten.
4. **Angebotsbaukasten (Partner/Vertrieb).** Pakete statt Einzelmodule, mit Prüfung der Voraussetzungen:
   - Die Pakete 2, 3 und 5 brauchen Paket 1.
   - Paket 6 geht nur zusammen mit einem anderen Paket.
   - Basis ist immer aktiv.

   Eingaben sind Liegenschaften, Ladepunkte und Ladevorgänge. Der Partner setzt den Endpreis frei. Angezeigt werden der Rabatt auf die UVP und der Aufschlag auf den EK, bei einem Preis unter dem EK erscheint ein Warnhinweis (ohne Sperre).
5. **Paket buchen = Module freischalten.** Neue Buchungen schalten die Modul-Codes des Pakets über die bestehenden, serverseitig geprüften Freigabe-Funktionen frei. Die Paketbuchung wird je Kunde gespeichert, damit die Übersicht weiß, wer nach neuer Logik läuft.
6. **Monatsübersicht je Partner (nur Anzeige).** Pro Endkunde und Monat:
   - gebuchte Pakete
   - Liegenschaften
   - aktive Ladepunkte
   - abgerechnete und interne Ladevorgänge getrennt
   - Summe UVP und Summe EK

   Dazu kommt die Summe je Partner. Partner sehen nur ihre eigenen Kunden, AICONO sieht alle. Bestandskunden ohne Paketbuchung sind als „Altpreis“ gekennzeichnet.
7. **Rollen bleiben preisfrei und unverändert.**

## Dateien und Auswirkung auf das EMS
| Datei | Änderung | EMS-Funktion betroffen? |
|---|---|---|
| neue Migration `pricing_packages` | neue Tabellen für Katalog, Paket-Module, Mengenpreise und Paketbuchungen je Kunde, mit Zugriffsregeln und Startwerten | Nein, nur neue Tabellen |
| `src/lib/packagePricing.ts` (neu) + Test | Preisrechnung, Voraussetzungen, Rabatt/Aufschlag | Nein, reine Rechnung |
| `src/hooks/usePricingPackages.tsx` (neu) | Katalog lesen und pflegen | Nein |
| `src/pages/SuperAdminModulePricing.tsx` | Paketkatalog, Ausblenden, nur UVP/EK | Nein, nur Preisanzeige |
| `src/pages/SuperAdminBundles.tsx` | alte Bündel als Hinweis auf die neuen Pakete | Nein |
| `src/components/sales/QuoteBuilderSheet.tsx` | Paketauswahl, Mengen, Endpreis, Warnung | Nein, nur Angebot |
| `src/pages/PublicSalesQuote.tsx` | Angebotsanzeige mit Paketen und UVP | Nein |
| `src/lib/salesModuleLabels.ts` | Paketnamen und Kennzeichen „auf Anfrage“ | Nein, nur Texte |
| `src/pages/partner/PartnerBilling.tsx` | Monatsübersicht je Endkunde | Nein, nur Anzeige |
| `src/pages/partner/PartnerTenantDetail.tsx`, `src/components/super-admin/TenantModulesDialog.tsx` | Knopf „Paket buchen“, der die bestehenden Modulschalter setzt | Nein, Freischaltung wie heute |
| neue Funktion `package-billing-overview` | Zählung je Kunde und Monat (nur lesend) | Nein, liest nur |
| Handbuch (4 Sprachen), Changelog, Release Notes, Version, Roadmap | Doku | Nein |

Nicht angefasst werden `generate-monthly-invoices`, `module_prices` (Inhalte), `useTenantModules`/ModuleGuard, alle Lade-, Zähler- und Automationsseiten.

## Prüfung
- Tests mit deinen drei Akzeptanzfällen:
  - Nur Laden: 31,00 € UVP
  - Pakete 1 + 2: 242,00 € UVP / 181,00 € EK
  - Pakete 1 + 2 + 3 + 5: 678,00 € UVP / 506,00 € EK
- Tests für die Voraussetzungen und für die Warnung unter EK.
- Build prüfen.
- Lesende Gegenprobe: Anzahl freigeschalteter Module und Preise der Bestandskunden sind vorher und nachher identisch.

## Technische Details
- Tabellen: `pricing_packages` (code, name, uvp, ek, requires_package, requires_any_other, sort, active), `pricing_package_modules` (package_code, module_code), `pricing_unit_prices` (code: extra_location/charge_point/charging_session/setup/support_15min/remote_support, uvp, ek), `tenant_package_bookings` (tenant_id, package_code, booked_at, cancelled_at), `module_catalog_flags` (module_code, visibility: sellable/hidden/on_request).
- Zugriff: Alle Angemeldeten dürfen lesen. Schreiben dürfen nur Portal-Rollen mit Schreibrecht im Bereich `commercial`. Paketbuchungen sind über die Partnerzugehörigkeit bzw. `can_portal_read` lesbar, geschrieben wird nur serverseitig in den bestehenden Freigabe-Funktionen.
- Spalten für Kommunen und Industrie in `module_prices` erhalten nur einen Kommentar „DEPRECATED (Anzeige)“, keine Löschung.
- Rechenformel: Endpreis = UVP × (1 − Rabatt) = EK × (1 + Aufschlag). Weitere Liegenschaften = max(0, Anzahl − 1), entfällt bei Paket 6.
