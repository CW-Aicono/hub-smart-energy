# Module im Partner-Portal und Partner-Freigaben auf Live reparieren

## Befund (bisher gesichert)
- Das Partner-Portal liest die Kundenmodule und das Partner-Angebot direkt aus der Datenbank, wertet aber Fehler nicht aus. Schlägt das Lesen fehl (fehlende Leserechte oder fehlende Tabelle auf Live), zeigt es still "0 aktiv" und "Nicht in Ihrem Partner-Portfolio".
- Der Dialog "Module für ESB GmbH" im AICONO Portal schaltet sofort um, liest danach neu ein und übernimmt das Ergebnis. Liefert das Neueinlesen nichts, springen alle Schalter zurück. Beide Fehler haben vermutlich dieselbe Ursache: Auf Live kommen die gespeicherten Module beim Lesen nicht an.
- Die genaue Ursache ist noch nicht bestätigt, weil ich nicht in die Live-Datenbank sehen kann.

## Schritt 1: Live prüfen (lesend, Befehl kommt direkt im Chat)
Ein Terminal-Befehl zeigt: ob die Tabelle für das Partner-Angebot existiert, welche Leserechte auf beiden Tabellen bestehen, ob die Speicherfunktion Einträge für ESB geschrieben hat und welche Module Bolan/ESB in der Datenbank haben.

## Schritt 2: Beheben
- Leserechte idempotent sicherstellen: Partner-Mitglieder dürfen die Module ihrer eigenen Kunden und das eigene Partner-Angebot lesen; Portal-Admins alles. Schreiben bleibt ausschließlich über die geprüften Server-Funktionen.
- Fehlt die Tabelle oder Spalte auf Live, wird sie per idempotenter Migration nachgeliefert.
- Partner-Portal und Portal-Dialog zeigen Lesefehler sichtbar an statt leerer Schalter; der Dialog überschreibt erfolgreiche Schaltungen nicht mehr mit einem fehlgeschlagenen Neueinlesen.
- Bestehende Kundenmodule von Partnerkunden werden ins Partner-Angebot übernommen, damit die Ansicht konsistent ist.

## Schritt 3: Prüfen und dokumentieren
- Build und Tests prüfen, Ablauf auf Staging durchklicken (Portal-Admin schaltet Partner-Modul, Partner sieht Kundenmodule).
- Version 1.6.4, Changelog, Release Notes, Handbuch (4 Sprachen), Roadmap.

## Technische Details
- `src/pages/partner/PartnerTenantDetail.tsx`: `error` aus den Abfragen auf `tenant_modules`/`partner_modules` auswerten.
- `src/components/super-admin/PartnerModulesDialog.tsx`: `setLocal` nur aus erfolgreichem Refetch.
- Neue Migration (drizzle + supabase): RLS-Policies für `tenant_modules` (Partner-Mitglied über `tenants.partner_id` = `get_user_partner_id`) und `partner_modules` mit `IF NOT EXISTS`-Guards, GRANTs, Backfill aus aktiven `tenant_modules`.
