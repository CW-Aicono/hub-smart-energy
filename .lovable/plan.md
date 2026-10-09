# Automatische Einmal- und Dauerrechnungen (v1.9.0)

## Erledigt vorab
- 20 Rechnungsentwürfe (12.020,06 €) sind storniert. Die 7 an Lexware übergebenen Rechnungen (1.805,00 €) bleiben unverändert.

## Ziel
Bei jedem Verkaufsvorgang entsteht automatisch ein **Rechnungsentwurf**. Du prüfst ihn und gibst ihn an Lexware frei. Nichts wird ohne Freigabe verschickt.

## Wer bekommt welche Rechnung
| Vorgang | Empfänger | Einmalrechnung | Dauerrechnung (monatlich) |
|---|---|---|---|
| AICONO legt Kunden selbst an | Kunde | Einrichtungsgebühr (UVP) | Pakete zur UVP |
| Partner legt Kunden an / bucht Pakete | Partner | Einrichtungsgebühr zum EK | Pakete zum EK, gesammelt je Partner |
| AICONO schaltet einem Partner ein Modul frei | Partner | Freischaltgebühr | – |
| Paket mitten im Monat gebucht | wie oben | Anteil für den Restmonat (tagesgenau) | ab dem Folgemonat voll |

- Paket mitten im Monat gekündigt: läuft bis Monatsende, keine Erstattung.
- Bestandskunden ohne Paketbuchung bleiben bei ihrer bisherigen Abrechnung (Altpreis), unverändert.
- Ein Ergebnis von 0 € wird ein Abo-Beleg, keine Rechnung (wie bisher).
- Doppelte Rechnungen sind ausgeschlossen: Jeder Vorgang wird höchstens einmal berechnet.

## Neue Preisfelder (Paketkatalog)
- **Einrichtungsgebühr Kunde**: UVP und EK.
- **Freischaltgebühr Partner** je Modul bzw. Paket.
- Start mit 0 €. Solange 0 € eingetragen ist, entsteht keine Einmalrechnung. Die Beträge trägst du selbst ein.

## Rechnungsübersicht
- Neue Spalten und Filter: Art (Einmal / Monatlich), Empfänger (Kunde / Partner).
- Partnerrechnungen gehen an die Rechnungsadresse des Partners.
- Freigabe an Lexware wie bisher per Button, Abo-Belege werden nie übergeben.

## Prüfung danach
Testläufe auf Staging mit Testkunden, danach alles wieder storniert:
1. AICONO legt Kunden an und bucht p1 am 15. → Einrichtung + anteilig p1 (Entwurf an Kunde).
2. Partner legt Kunden an und bucht p1 + p2 → Entwürfe an Partner zum EK.
3. Freischaltung eines Moduls für einen Partner → Freischaltrechnung an Partner.
4. Monatslauf → je Kunde (AICONO) bzw. je Partner gesammelt, keine Doppelungen, Altpreis-Kunden unverändert.
Zusätzlich gibt es automatische Tests für die Anteils- und Preisrechnung.

## Dokumentation
Version 1.9.0, Handbuch in 4 Sprachen, Änderungsprotokoll, Versionshinweise und Roadmap.

## Technische Details
- Migration (idempotent): `tenant_invoices` + `partner_id uuid null`, `invoice_kind text default 'recurring'` (`recurring|one_time`), `source_ref text null` mit Unique-Index (Idempotenz); `tenant_id` darf bei Partnerrechnungen leer sein (nur falls nötig, additiv). `pricing_packages` + `setup_fee_uvp`, `setup_fee_ek`, `partner_unlock_fee`, Default 0. `module_prices` bleibt unverändert.
- Neue Edge Function `create-one-time-invoice` (nur intern aufrufbar), aufgerufen aus `package-book`, `partner-create-tenant`, Kundenanlage im Portal und `super-admin-set-partner-module`. `source_ref` z. B. `setup:<tenant>`, `prorata:<booking>`, `unlock:<partner>:<module>`.
- `generate-monthly-invoices`: Mandanten mit Paketbuchung über `packagePricing` (UVP bzw. EK je nach Partner) abrechnen, Partnerkunden je Partner zusammenfassen; Kunden ohne Buchung wie heute. `source_ref = monthly:<empfänger>:<YYYY-MM>`.
- `lexware-api`: Kontakt aus `partners.billing_address`, wenn `partner_id` gesetzt ist.
- Anteilsrechnung als reine Funktion in `src/lib/packagePricing.ts` mit Tests (Deno-Kopie für Edge).
